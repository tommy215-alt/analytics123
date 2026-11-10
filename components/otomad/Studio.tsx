"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyze, hzToMidi, makeDemoVoice, noteName, type Slice } from "@/lib/otomad/analyze";
import { arrange, encodeWav, pickLeads } from "@/lib/otomad/arrange";
import { extractMelody } from "@/lib/otomad/melody";
import { parseMidi } from "@/lib/otomad/midi";
import { schedule, songSeconds, type BackingStems } from "@/lib/otomad/render";
import { MIN_VOCAL_SHARE, mixStems, separate, toAudioBuffer, toModelInput, toMono, vocalShare } from "@/lib/otomad/separator";
import { generateSong, STYLES, type Song, type Style } from "@/lib/otomad/song";

/** 一度に切り分けて使う声ネタの長さの上限(秒) */
const MAX_VOICE_SEC = 90;
/** 好きな曲として一度に使う長さの上限(秒) */
const MAX_SONG_SEC = 180;
/** 読み込んだ素材として保持する長さの上限(秒)。長い動画はここまでを読み込む */
const MAX_SOURCE_SEC = 600;
const MAX_FILE_BYTES = 500 * 1024 * 1024;

type Voice = { buffer: AudioBuffer; name: string; slices: Slice[] };

/** 読み込んだ元の素材(音声を取り出して1本にまとめたもの) */
type Source = { buffer: AudioBuffer; name: string; videoUrl: string | null };

/** 自分で選んだ曲(MIDI、または音声から読み取ったもの) */
type CustomSong = { song: Song; stems?: BackingStems; /** 歌声から読み取ったか(false なら伴奏の主旋律から) */ fromVocals?: boolean };

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

function drawWave(canvas: HTMLCanvasElement, voice: Voice, enabled: boolean[], leads: number[]) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const g = canvas.getContext("2d");
  if (!g) return;
  g.scale(ratio, ratio);
  g.clearRect(0, 0, width, height);
  const data = voice.buffer.getChannelData(0);
  const duration = voice.buffer.duration;

  voice.slices.forEach((slice, i) => {
    const x = (slice.start / duration) * width;
    const w = Math.max(2, ((slice.end - slice.start) / duration) * width);
    g.fillStyle = !enabled[i] ? "rgba(111,131,153,0.12)" : leads.includes(i) ? "rgba(240,69,127,0.28)" : "rgba(34,211,238,0.2)";
    g.fillRect(x, 0, w, height);
  });

  g.fillStyle = "#22d3ee";
  const step = data.length / width;
  for (let x = 0; x < width; x++) {
    let peak = 0;
    const from = Math.floor(x * step);
    const to = Math.min(data.length, Math.floor((x + 1) * step));
    for (let i = from; i < to; i += Math.max(1, Math.floor((to - from) / 40))) peak = Math.max(peak, Math.abs(data[i]));
    const h = Math.max(1, peak * height * 0.95);
    g.fillRect(x, (height - h) / 2, 1, h);
  }
}

/** 場面(開始位置と長さ)を選ぶ部品。動画ならプレビューも出す */
function RangePicker({
  source,
  start,
  length,
  maxLength,
  actionLabel,
  disabled,
  onStart,
  onLength,
  onApply,
}: {
  source: Source;
  start: number;
  length: number;
  maxLength: number;
  actionLabel: string;
  disabled?: boolean;
  onStart: (value: number) => void;
  onLength: (value: number) => void;
  onApply: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  return (
    <div className="otomad-range">
      {source.videoUrl && (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video ref={video} src={source.videoUrl} controls playsInline preload="metadata" />
      )}
      <p className="sub">
        {source.name}・音声 {mmss(source.buffer.duration)}
        {source.buffer.duration >= MAX_SOURCE_SEC - 1 ? "(先頭10分まで読み込みました)" : ""}。使いたい場面を選んでください(一度に{maxLength}秒まで)。
      </p>
      <div className="sliders">
        <label>
          <span>開始 {mmss(start)}</span>
          <input type="range" min={0} max={Math.max(0, Math.floor(source.buffer.duration - 1))} step={0.5} value={start} onChange={(e) => onStart(Number(e.target.value))} />
        </label>
        <label>
          <span>長さ {length}秒</span>
          <input type="range" min={2} max={maxLength} step={1} value={length} onChange={(e) => onLength(Number(e.target.value))} />
        </label>
      </div>
      <div className="otomad-buttons" style={{ marginTop: 8 }}>
        {source.videoUrl && (
          <button className="btn" type="button" onClick={() => onStart(Math.floor((video.current?.currentTime ?? 0) * 2) / 2)}>
            動画の再生位置を開始にする
          </button>
        )}
        <button className="btn primary" type="button" onClick={onApply} disabled={disabled}>
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

export function Studio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const endTimer = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  // 声ネタ
  const [source, setSource] = useState<Source | null>(null);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeLength, setRangeLength] = useState(30);
  const [voice, setVoice] = useState<Voice | null>(null);
  /** 「声だけにする」をする前の音(元に戻す用) */
  const [beforeIsolation, setBeforeIsolation] = useState<{ buffer: AudioBuffer; name: string } | null>(null);
  const [enabled, setEnabled] = useState<boolean[]>([]);

  // 曲
  const [songMode, setSongMode] = useState<"auto" | "custom">("auto");
  const [style, setStyle] = useState<Style>("four");
  const [seed, setSeed] = useState(1);
  const [bpm, setBpm] = useState<number | null>(null);
  const [custom, setCustom] = useState<CustomSong | null>(null);
  const [songSource, setSongSource] = useState<Source | null>(null);
  const [songStart, setSongStart] = useState(0);
  const [songLength, setSongLength] = useState(60);

  const [shots, setShots] = useState(true);
  const [voiceDrums, setVoiceDrums] = useState(true);
  const [transpose, setTranspose] = useState(0);
  const [mix, setMix] = useState({ voice: 1, backing: 0.7, drums: 0.8 });
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  /** 時間のかかる処理の進み具合(空なら何もしていない) */
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);

  const audio = useCallback((): AudioContext => {
    if (!ctxRef.current) {
      const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!Ctor) throw new Error("このブラウザは音声の再生に対応していません。");
      ctxRef.current = new Ctor();
    }
    void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    if (endTimer.current !== null) window.clearTimeout(endTimer.current);
    endTimer.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => stop, [stop]);

  const usingCustom = songMode === "custom" && custom !== null;
  const stems = usingCustom ? custom.stems : undefined;

  const song = useMemo<Song>(() => {
    if (usingCustom) return bpm && !custom.stems ? { ...custom.song, bpm } : custom.song;
    return generateSong(seed, style, bpm ?? undefined);
  }, [usingCustom, custom, seed, style, bpm]);

  // 使う声ネタだけを取り出した一覧と、元の番号との対応
  const active = useMemo(() => {
    if (!voice) return { slices: [] as Slice[], original: [] as number[] };
    const original = voice.slices.map((_, i) => i).filter((i) => enabled[i]);
    return { slices: original.map((i) => voice.slices[i]), original };
  }, [voice, enabled]);

  const leads = useMemo(() => pickLeads(active.slices).map((i) => active.original[i]), [active]);

  useEffect(() => {
    if (voice && canvasRef.current) drawWave(canvasRef.current, voice, enabled, leads);
  }, [voice, enabled, leads]);

  /** 音声を切り分けて、声ネタとして採用する。音が見つからなければ false */
  const adoptBuffer = useCallback((buffer: AudioBuffer, name: string): boolean => {
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
    }
    const slices = analyze(mono, buffer.sampleRate);
    if (slices.length === 0) {
      setError("音が検出できませんでした。もう少し大きな音の素材や、別の場面で試してください。");
      return false;
    }
    setError("");
    setVoice({ buffer, name, slices });
    setEnabled(slices.map(() => true));
    return true;
  }, []);

  /** ファイル(音声・動画)を読み込み、音声だけをステレオのまま1本にまとめる */
  const decodeFiles = useCallback(
    async (files: File[]): Promise<Source> => {
      const ctx = audio();
      const decoded: AudioBuffer[] = [];
      for (const file of files) decoded.push(await ctx.decodeAudioData(await file.arrayBuffer()));
      const gap = decoded.length > 1 ? Math.floor(ctx.sampleRate * 0.15) : 0;
      const limit = Math.floor(ctx.sampleRate * MAX_SOURCE_SEC);
      const total = Math.max(1, Math.min(limit, decoded.reduce((sum, b) => sum + b.length + gap, 0) - gap));
      const joined = ctx.createBuffer(2, total, ctx.sampleRate);
      let offset = 0;
      for (const buffer of decoded) {
        for (let c = 0; c < 2; c++) {
          // モノラルの素材は、同じ音を左右に入れる
          const data = buffer.getChannelData(Math.min(c, buffer.numberOfChannels - 1));
          const out = joined.getChannelData(c);
          for (let i = 0; i < data.length && offset + i < total; i++) out[offset + i] = data[i];
        }
        offset += buffer.length + gap;
        if (offset >= total) break;
      }
      const single = files.length === 1 ? files[0] : null;
      return {
        buffer: joined,
        name: single ? single.name : `${files.length}個の素材`,
        videoUrl: single && single.type.startsWith("video/") ? URL.createObjectURL(single) : null,
      };
    },
    [audio],
  );

  const checkFiles = useCallback((files: FileList | null): File[] | null => {
    if (!files || files.length === 0) return null;
    const list = Array.from(files).slice(0, 12);
    if (list.some((file) => file.size > MAX_FILE_BYTES)) {
      setError("ファイルが大きすぎます(1つ500MBまで)。短く切り出してから入れてください。");
      return null;
    }
    return list;
  }, []);

  const excerpt = useCallback(
    (from: Source, start: number, length: number): AudioBuffer => {
      const ctx = audio();
      const rate = from.buffer.sampleRate;
      const first = Math.max(0, Math.min(from.buffer.length - 1, Math.floor(start * rate)));
      const count = Math.max(1, Math.min(from.buffer.length - first, Math.floor(length * rate)));
      const out = ctx.createBuffer(from.buffer.numberOfChannels, count, rate);
      for (let c = 0; c < out.numberOfChannels; c++) out.getChannelData(c).set(from.buffer.getChannelData(c).subarray(first, first + count));
      return out;
    },
    [audio],
  );

  /** 元の素材のうち、指定した範囲だけを声ネタにする */
  const applyRange = useCallback(
    (from: Source, start: number, length: number) => {
      const part = excerpt(from, start, Math.min(length, MAX_VOICE_SEC));
      const whole = part.length === from.buffer.length;
      setBeforeIsolation(null);
      adoptBuffer(part, whole ? from.name : `${from.name}(${mmss(start)}から${Math.round(part.duration)}秒)`);
    },
    [adoptBuffer, excerpt],
  );

  const replaceSource = useCallback((next: Source | null) => {
    setSource((current) => {
      if (current?.videoUrl) URL.revokeObjectURL(current.videoUrl);
      return next;
    });
  }, []);

  const loadVoiceFiles = useCallback(
    async (files: FileList | null) => {
      const list = checkFiles(files);
      if (!list) return;
      stop();
      const hasVideo = list.some((file) => file.type.startsWith("video/"));
      setBusy(hasVideo ? "動画から音声を取り出しています…(長い動画は時間がかかります)" : "素材を読み込んでいます…");
      try {
        const next = await decodeFiles(list);
        replaceSource(next);
        const fits = next.buffer.duration <= MAX_VOICE_SEC;
        setRangeStart(0);
        setRangeLength(fits ? Math.max(2, Math.ceil(next.buffer.duration)) : 30);
        applyRange(next, 0, fits ? next.buffer.duration : 30);
      } catch {
        setError(
          hasVideo
            ? "この動画から音声を取り出せませんでした。mp4(一般的なスマホの動画)か mov で試すか、別のブラウザで開いてください。"
            : "読み込めませんでした。mp3・wav・m4a などの音声ファイルか、mp4 などの動画ファイルを選んでください。",
        );
      } finally {
        setBusy("");
      }
    },
    [applyRange, checkFiles, decodeFiles, replaceSource, stop],
  );

  const loadDemo = useCallback(() => {
    stop();
    try {
      const ctx = audio();
      const samples = makeDemoVoice(ctx.sampleRate);
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.getChannelData(0).set(samples);
      replaceSource(null);
      setBeforeIsolation(null);
      adoptBuffer(buffer, "お試し音声(合成)");
    } catch (e) {
      setError(e instanceof Error ? e.message : "音声を準備できませんでした。");
    }
  }, [adoptBuffer, audio, replaceSource, stop]);

  const toggleRecording = useCallback(async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        try {
          const buffer = await audio().decodeAudioData(await new Blob(chunks).arrayBuffer());
          replaceSource(null);
          setBeforeIsolation(null);
          adoptBuffer(buffer, "録音した声");
        } catch {
          setError("録音を読み込めませんでした。");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setError("");
    } catch {
      setError("マイクを使えませんでした。ブラウザでマイクの使用を許可してください。");
    }
  }, [adoptBuffer, audio, recording, replaceSource, stop]);

  /** いまの声ネタから、BGM や効果音を取り除いて声だけにする */
  const isolateVoice = useCallback(async () => {
    if (!voice) return;
    stop();
    const original = { buffer: voice.buffer, name: voice.name };
    try {
      setBusy("声を取り出す準備をしています…");
      const input = await toModelInput(voice.buffer);
      const result = await separate(input, setBusy);
      if (vocalShare(result) < MIN_VOCAL_SHARE) {
        setError("この場面からは人の声が見つかりませんでした。声の入っている場面を選んでください(元の音はそのまま残しています)。");
        return;
      }
      const ok = adoptBuffer(toAudioBuffer(audio(), result.vocals), `${voice.name}(声のみ)`);
      if (ok) setBeforeIsolation(original);
    } catch (e) {
      setError(e instanceof Error ? e.message : "声の取り出しに失敗しました。");
    } finally {
      setBusy("");
    }
  }, [adoptBuffer, audio, stop, voice]);

  const restoreVoice = useCallback(() => {
    if (!beforeIsolation) return;
    stop();
    adoptBuffer(beforeIsolation.buffer, beforeIsolation.name);
    setBeforeIsolation(null);
  }, [adoptBuffer, beforeIsolation, stop]);

  const loadMidi = useCallback(
    async (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      stop();
      try {
        setCustom({ song: parseMidi(new Uint8Array(await file.arrayBuffer()), file.name) });
        setSongMode("custom");
        setBpm(null);
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "MIDI を読み込めませんでした。");
      }
    },
    [stop],
  );

  const loadSongFiles = useCallback(
    async (files: FileList | null) => {
      const list = checkFiles(files);
      if (!list) return;
      stop();
      setBusy("曲を読み込んでいます…");
      try {
        const next = await decodeFiles(list.slice(0, 1));
        setSongSource((current) => {
          if (current?.videoUrl) URL.revokeObjectURL(current.videoUrl);
          return next;
        });
        setSongStart(0);
        setSongLength(Math.max(2, Math.min(60, Math.floor(next.buffer.duration))));
        setError("");
      } catch {
        setError("曲を読み込めませんでした。mp3・wav・m4a などの音声ファイルか、mp4 などの動画ファイルを選んでください。");
      } finally {
        setBusy("");
      }
    },
    [checkFiles, decodeFiles, stop],
  );

  /** 選んだ曲を「歌声」と「伴奏」に分け、歌声からメロディを読み取る */
  const analyzeSong = useCallback(async () => {
    if (!songSource) return;
    stop();
    try {
      setBusy("曲を解析する準備をしています…");
      const length = Math.min(songLength, MAX_SONG_SEC, songSource.buffer.duration - songStart);
      const input = await toModelInput(songSource.buffer, songStart, length);
      const result = await separate(input, setBusy);
      setBusy("歌声からメロディを読み取っています…");
      await new Promise((resolve) => setTimeout(resolve, 30));

      // 歌が入っていれば歌声から、入っていなければ(インスト曲など)伴奏の主旋律からメロディを読み取る
      const hasVocals = vocalShare(result) >= MIN_VOCAL_SHARE;
      const melody = extractMelody(toMono(hasVocals ? result.vocals : result.other), 44100);
      if (melody.length < 4) {
        setError("この場面からはメロディを読み取れませんでした。歌や主旋律がはっきりしている場面を選んでください。");
        return;
      }
      const ctx = audio();
      setCustom({
        // 1拍=1秒として扱う(伴奏の音声に合わせるので、テンポは変えない)
        song: {
          bpm: 60,
          beats: result.vocals.left.length / 44100,
          melody,
          bass: [],
          chords: [],
          drums: [],
          shots: [],
          label: `${songSource.name}・${melody.length}音`,
        },
        stems: {
          music: toAudioBuffer(ctx, mixStems([result.bass, result.other])),
          drums: toAudioBuffer(ctx, result.drums),
        },
        fromVocals: hasVocals,
      });
      setSongMode("custom");
      setBpm(null);
      setTranspose(0);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "曲の解析に失敗しました。");
    } finally {
      setBusy("");
    }
  }, [audio, songLength, songSource, songStart, stop]);

  const options = useMemo(
    () => ({ leadSlices: [] as number[], shots: shots && !usingCustom, voiceDrums: voiceDrums && !stems, transpose: stems ? 0 : transpose }),
    [shots, voiceDrums, transpose, usingCustom, stems],
  );

  const ready = voice !== null && active.slices.length > 0 && !busy;

  const play = useCallback(() => {
    if (!voice || active.slices.length === 0) return;
    stop();
    const ctx = audio();
    const events = arrange(song, active.slices, options);
    stopRef.current = schedule(ctx, song, voice.buffer, active.slices, events, mix, ctx.currentTime + 0.08, stems);
    setPlaying(true);
    endTimer.current = window.setTimeout(() => stop(), songSeconds(song) * 1000 + 200);
  }, [active, audio, mix, options, song, stems, stop, voice]);

  const audition = useCallback(
    (index: number) => {
      if (!voice) return;
      const ctx = audio();
      const slice = voice.slices[index];
      const node = ctx.createBufferSource();
      node.buffer = voice.buffer;
      node.connect(ctx.destination);
      node.start(ctx.currentTime, slice.start, slice.end - slice.start);
    },
    [audio, voice],
  );

  const exportWav = useCallback(async () => {
    if (!voice || active.slices.length === 0) return;
    setBusy("書き出しています…");
    try {
      const rate = 44100;
      const offline = new OfflineAudioContext(2, Math.ceil(songSeconds(song) * rate), rate);
      schedule(offline, song, voice.buffer, active.slices, arrange(song, active.slices, options), mix, 0, stems);
      const rendered = await offline.startRendering();
      const wav = encodeWav([rendered.getChannelData(0), rendered.getChannelData(1)], rate);
      setDownload((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { url: URL.createObjectURL(new Blob([wav], { type: "audio/wav" })), name: `otomad-${usingCustom ? "custom" : seed}.wav` };
      });
    } catch {
      setError("書き出しに失敗しました。");
    } finally {
      setBusy("");
    }
  }, [active, mix, options, seed, song, stems, usingCustom, voice]);

  // 設定や素材を変えたら、前に書き出したファイルは古くなるので消す
  useEffect(() => {
    setDownload((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, [song, options, mix, enabled, voice, stems]);

  const seconds = Math.round(songSeconds(song));

  return (
    <main className="content" style={{ maxWidth: 860 }}>
      <div className="page-title">
        <div>
          <h1>音MADメーカー</h1>
          <span className="sub">声ネタを入れると、音程を合わせたメロディと伴奏を自動で付けます</span>
        </div>
      </div>

      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {busy && (
        <p className="notice ok" role="status">
          {busy}
        </p>
      )}

      <section className="card">
        <div className="card-head">
          <h2>1. 声ネタを入れる</h2>
          <span className="code">SOURCE</span>
        </div>
        <div className="otomad-buttons">
          <label className="btn primary">
            音声・動画ファイルを選ぶ
            <input className="visually-hidden" type="file" accept="audio/*,video/*" multiple disabled={Boolean(busy)} onChange={(e) => void loadVoiceFiles(e.target.files)} />
          </label>
          <button className={recording ? "btn danger" : "btn"} type="button" onClick={() => void toggleRecording()} disabled={Boolean(busy)}>
            {recording ? "■ 録音を止める" : "マイクで録音"}
          </button>
          <button className="btn" type="button" onClick={loadDemo} disabled={Boolean(busy)}>
            お試し音声で試す
          </button>
        </div>

        {source && (source.videoUrl || source.buffer.duration > MAX_VOICE_SEC) && (
          <RangePicker
            source={source}
            start={rangeStart}
            length={rangeLength}
            maxLength={MAX_VOICE_SEC}
            actionLabel="この範囲を声ネタにする"
            disabled={Boolean(busy)}
            onStart={setRangeStart}
            onLength={setRangeLength}
            onApply={() => applyRange(source, rangeStart, rangeLength)}
          />
        )}

        {voice && (
          <>
            <canvas ref={canvasRef} className="otomad-wave" aria-label="声ネタの波形と、切り分けた区間" />
            <p className="sub" data-testid="voice-info">
              {voice.name}・{voice.slices.length}個に切り分けました。押すと試聴、「×」でその音を使わないようにできます。ピンクはメロディ担当です。
            </p>
            <div className="slice-list">
              {voice.slices.map((slice, i) => (
                <span key={i} className={!enabled[i] ? "slice off" : leads.includes(i) ? "slice lead" : "slice"}>
                  <button type="button" onClick={() => audition(i)} aria-label={`${i + 1}番を試聴`}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    {slice.pitchHz ? noteName(hzToMidi(slice.pitchHz)) : "音程なし"}
                  </button>
                  <button
                    type="button"
                    className="x"
                    aria-pressed={!enabled[i]}
                    aria-label={enabled[i] ? `${i + 1}番を使わない` : `${i + 1}番を使う`}
                    onClick={() => setEnabled((list) => list.map((value, j) => (j === i ? !value : value)))}
                  >
                    {enabled[i] ? "×" : "+"}
                  </button>
                </span>
              ))}
            </div>
            <div className="otomad-buttons" style={{ marginTop: 10 }}>
              {beforeIsolation ? (
                <button className="btn" type="button" onClick={restoreVoice} disabled={Boolean(busy)}>
                  分ける前の音に戻す
                </button>
              ) : (
                <button className="btn" type="button" onClick={() => void isolateVoice()} disabled={Boolean(busy)}>
                  BGM を消して声だけにする(AI)
                </button>
              )}
            </div>
            <p className="sub" style={{ marginTop: 6 }}>
              AI の処理はこの端末の中で行います。初回だけ約180MBのモデルをダウンロードし、処理には素材の長さと同じくらいかそれ以上の時間がかかります。パソコンでの利用をおすすめします。
            </p>
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>2. 曲を決める</h2>
          <span className="code" data-testid="song-label">
            {song.label}
          </span>
        </div>
        <div className="chips major" style={{ margin: "0 0 10px", padding: "1px 0" }}>
          <button
            type="button"
            className="chip"
            aria-pressed={songMode === "auto"}
            onClick={() => {
              stop();
              setSongMode("auto");
              setBpm(null);
            }}
          >
            おまかせで作る
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={songMode === "custom"}
            onClick={() => {
              stop();
              setSongMode("custom");
              setBpm(null);
            }}
          >
            好きな曲を使う
          </button>
        </div>

        {songMode === "auto" ? (
          <>
            <div className="filter-row">
              <span className="code">曲調</span>
              <div className="chips" style={{ margin: 0, padding: "1px 0" }}>
                {STYLES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    className="chip"
                    aria-pressed={style === s.value}
                    onClick={() => {
                      setStyle(s.value);
                      setBpm(null);
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="otomad-buttons" style={{ marginTop: 8 }}>
              <button className="btn primary" type="button" onClick={() => setSeed((value) => value + 1)}>
                別の曲にする
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="otomad-buttons">
              <label className="btn primary">
                曲のファイルを選ぶ(音声・動画)
                <input className="visually-hidden" data-testid="song-file" type="file" accept="audio/*,video/*" disabled={Boolean(busy)} onChange={(e) => void loadSongFiles(e.target.files)} />
              </label>
              <label className="btn">
                MIDI を読み込む
                <input className="visually-hidden" type="file" accept=".mid,.midi,audio/midi" disabled={Boolean(busy)} onChange={(e) => void loadMidi(e.target.files)} />
              </label>
            </div>
            {songSource && (
              <RangePicker
                source={songSource}
                start={songStart}
                length={songLength}
                maxLength={MAX_SONG_SEC}
                actionLabel="この範囲で曲を解析する(AI)"
                disabled={Boolean(busy)}
                onStart={setSongStart}
                onLength={setSongLength}
                onApply={() => void analyzeSong()}
              />
            )}
            <p className="sub" style={{ marginTop: 8 }}>
              {custom
                ? custom.stems
                  ? custom.fromVocals
                    ? "曲の歌声を抜いた伴奏に合わせて、読み取ったメロディを声ネタが歌います。"
                    : "この曲からは歌声が見つからなかったので、伴奏の主旋律を読み取って声ネタに歌わせます(元の主旋律も伴奏に残ります)。"
                  : "MIDI のメロディを声ネタが歌い、伴奏は MIDI の内容を合成音で鳴らします。"
                : "曲のファイルを選ぶと、AI が歌声と伴奏に分け、歌声のメロディを声ネタに歌わせます。歌の入った場面を選んでください。まだ曲を選んでいないあいだは、おまかせの曲が鳴ります。"}
            </p>
          </>
        )}

        <div className="sliders">
          <label>
            <span>テンポ {stems ? "曲のまま" : Math.round(song.bpm)}</span>
            <input
              type="range"
              min={70}
              max={190}
              step={1}
              value={Math.round(Math.max(70, Math.min(190, song.bpm)))}
              disabled={Boolean(stems)}
              onChange={(e) => setBpm(Number(e.target.value))}
            />
          </label>
          <label>
            <span>キー {stems ? "曲のまま" : `${transpose > 0 ? "+" : ""}${transpose}`}</span>
            <input type="range" min={-6} max={6} step={1} value={stems ? 0 : transpose} disabled={Boolean(stems)} onChange={(e) => setTranspose(Number(e.target.value))} />
          </label>
        </div>
        <div className="otomad-toggles">
          <label>
            <input type="checkbox" checked={shots && !usingCustom} onChange={(e) => setShots(e.target.checked)} disabled={usingCustom} /> 連打の合いの手
          </label>
          <label>
            <input type="checkbox" checked={voiceDrums && !stems} onChange={(e) => setVoiceDrums(e.target.checked)} disabled={Boolean(stems)} /> 声でドラム
          </label>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>3. 聴く・書き出す</h2>
          <span className="code">{seconds}秒</span>
        </div>
        <div className="sliders">
          {(
            [
              ["voice", "声"],
              ["backing", "伴奏"],
              ["drums", "ドラム"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <span>
                {label} {Math.round(mix[key] * 100)}
              </span>
              <input type="range" min={0} max={1.2} step={0.05} value={mix[key]} onChange={(e) => setMix((m) => ({ ...m, [key]: Number(e.target.value) }))} />
            </label>
          ))}
        </div>
        <div className="otomad-buttons" style={{ marginTop: 10 }}>
          <button className="btn primary" type="button" onClick={playing ? stop : play} disabled={!ready && !playing}>
            {playing ? "■ 止める" : "▶ 再生"}
          </button>
          <button className="btn" type="button" onClick={() => void exportWav()} disabled={!ready}>
            WAV に書き出す
          </button>
          {download && (
            <a className="btn" href={download.url} download={download.name}>
              ダウンロード
            </a>
          )}
        </div>
        {!voice && <p className="empty" style={{ marginTop: 8 }}>先に声ネタを入れてください。</p>}
      </section>

      <p className="sub" style={{ lineHeight: 1.7 }}>
        音声と動画はこの端末の中だけで処理し、どこにも送信しません。他人の映像・音声・楽曲を素材にしたものを公開すると、権利者から削除や収益化の停止を求められることがあります。
      </p>
    </main>
  );
}
