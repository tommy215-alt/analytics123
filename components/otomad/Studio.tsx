"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyze, hzToMidi, makeDemoVoice, noteName, type Slice } from "@/lib/otomad/analyze";
import { arrange, encodeWav, pickLeads } from "@/lib/otomad/arrange";
import { parseMidi } from "@/lib/otomad/midi";
import { schedule, songSeconds } from "@/lib/otomad/render";
import { generateSong, STYLES, type Song, type Style } from "@/lib/otomad/song";

/** 一度に切り分けて使う長さの上限(秒) */
const MAX_VOICE_SEC = 90;
/** 読み込んだ素材として保持する長さの上限(秒)。長い動画はここまでを読み込む */
const MAX_SOURCE_SEC = 600;
const MAX_FILE_BYTES = 500 * 1024 * 1024;

type Voice = { buffer: AudioBuffer; name: string; slices: Slice[] };

/** 読み込んだ元の素材(音声だけを取り出して1本にまとめたもの) */
type Source = { buffer: AudioBuffer; name: string; videoUrl: string | null };

const mmss = (sec: number): string => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

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

export function Studio() {
  const ctxRef = useRef<AudioContext | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const endTimer = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeLength, setRangeLength] = useState(30);

  const [voice, setVoice] = useState<Voice | null>(null);
  const [enabled, setEnabled] = useState<boolean[]>([]);
  const [style, setStyle] = useState<Style>("four");
  const [seed, setSeed] = useState(1);
  const [bpm, setBpm] = useState<number | null>(null);
  const [midiSong, setMidiSong] = useState<Song | null>(null);
  const [shots, setShots] = useState(true);
  const [voiceDrums, setVoiceDrums] = useState(true);
  const [transpose, setTranspose] = useState(0);
  const [mix, setMix] = useState({ voice: 1, backing: 0.7, drums: 0.8 });
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
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

  const song = useMemo<Song>(() => {
    if (midiSong) return bpm ? { ...midiSong, bpm } : midiSong;
    return generateSong(seed, style, bpm ?? undefined);
  }, [midiSong, seed, style, bpm]);

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

  const adoptBuffer = useCallback((buffer: AudioBuffer, name: string) => {
    const mono = new Float32Array(buffer.length);
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < mono.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
    }
    const slices = analyze(mono, buffer.sampleRate);
    if (slices.length === 0) {
      setError("音が検出できませんでした。もう少し大きな音の素材で試してください。");
      return;
    }
    setError("");
    setDownload(null);
    setVoice({ buffer, name, slices });
    setEnabled(slices.map(() => true));
    setSeed(Math.floor(Math.random() * 100000) + 1);
  }, []);

  /** 元の素材のうち、指定した範囲だけを切り出して解析する */
  const applyRange = useCallback(
    (from: Source, start: number, length: number) => {
      const ctx = audio();
      const rate = from.buffer.sampleRate;
      const first = Math.max(0, Math.min(from.buffer.length - 1, Math.floor(start * rate)));
      const count = Math.max(1, Math.min(from.buffer.length - first, Math.floor(Math.min(length, MAX_VOICE_SEC) * rate)));
      const excerpt = ctx.createBuffer(1, count, rate);
      excerpt.getChannelData(0).set(from.buffer.getChannelData(0).subarray(first, first + count));
      const whole = first === 0 && count === from.buffer.length;
      adoptBuffer(excerpt, whole ? from.name : `${from.name}(${mmss(start)}から${Math.round(count / rate)}秒)`);
    },
    [adoptBuffer, audio],
  );

  const replaceSource = useCallback((next: Source | null) => {
    setSource((current) => {
      if (current?.videoUrl) URL.revokeObjectURL(current.videoUrl);
      return next;
    });
  }, []);

  const loadFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      stop();
      const list = Array.from(files).slice(0, 12);
      if (list.some((file) => file.size > MAX_FILE_BYTES)) {
        setError("ファイルが大きすぎます(1つ500MBまで)。動画を短く切り出してから入れてください。");
        return;
      }
      const hasVideo = list.some((file) => file.type.startsWith("video/"));
      setBusy(hasVideo ? "動画から音声を取り出しています…(長い動画は時間がかかります)" : "素材を読み込んでいます…");
      try {
        const ctx = audio();
        const decoded: AudioBuffer[] = [];
        for (const file of list) decoded.push(await ctx.decodeAudioData(await file.arrayBuffer()));

        // 音声だけをモノラルにして、複数の素材はすき間を空けて1本につなぐ
        const gap = decoded.length > 1 ? Math.floor(ctx.sampleRate * 0.15) : 0;
        const limit = Math.floor(ctx.sampleRate * MAX_SOURCE_SEC);
        const total = Math.min(limit, decoded.reduce((sum, b) => sum + b.length + gap, 0) - gap);
        const joined = ctx.createBuffer(1, Math.max(1, total), ctx.sampleRate);
        const out = joined.getChannelData(0);
        let offset = 0;
        for (const buffer of decoded) {
          for (let c = 0; c < buffer.numberOfChannels; c++) {
            const data = buffer.getChannelData(c);
            for (let i = 0; i < data.length && offset + i < total; i++) out[offset + i] += data[i] / buffer.numberOfChannels;
          }
          offset += buffer.length + gap;
          if (offset >= total) break;
        }

        const single = list.length === 1 ? list[0] : null;
        const next: Source = {
          buffer: joined,
          name: single ? single.name : `${list.length}個の素材`,
          videoUrl: single && single.type.startsWith("video/") ? URL.createObjectURL(single) : null,
        };
        replaceSource(next);
        const length = Math.min(30, joined.duration);
        setRangeStart(0);
        setRangeLength(joined.duration <= MAX_VOICE_SEC ? Math.ceil(joined.duration) : 30);
        applyRange(next, 0, joined.duration <= MAX_VOICE_SEC ? joined.duration : length);
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
    [audio, replaceSource, stop, applyRange],
  );

  const loadDemo = useCallback(() => {
    stop();
    try {
      const ctx = audio();
      const samples = makeDemoVoice(ctx.sampleRate);
      const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
      buffer.getChannelData(0).set(samples);
      replaceSource(null);
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

  const loadMidi = useCallback(async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      setMidiSong(parseMidi(new Uint8Array(await file.arrayBuffer()), file.name));
      setBpm(null);
      setError("");
      setDownload(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "MIDI を読み込めませんでした。");
    }
  }, []);

  const options = useMemo(() => ({ leadSlices: [] as number[], shots, voiceDrums, transpose }), [shots, voiceDrums, transpose]);

  const play = useCallback(() => {
    if (!voice || active.slices.length === 0) return;
    stop();
    const ctx = audio();
    const events = arrange(song, active.slices, options);
    stopRef.current = schedule(ctx, song, voice.buffer, active.slices, events, mix, ctx.currentTime + 0.08);
    setPlaying(true);
    endTimer.current = window.setTimeout(() => stop(), songSeconds(song) * 1000 + 200);
  }, [active, audio, mix, options, song, stop, voice]);

  const audition = useCallback(
    (index: number) => {
      if (!voice) return;
      const ctx = audio();
      const slice = voice.slices[index];
      const source = ctx.createBufferSource();
      source.buffer = voice.buffer;
      source.connect(ctx.destination);
      source.start(ctx.currentTime, slice.start, slice.end - slice.start);
    },
    [audio, voice],
  );

  const exportWav = useCallback(async () => {
    if (!voice || active.slices.length === 0) return;
    setBusy("書き出しています…");
    try {
      const rate = 44100;
      const offline = new OfflineAudioContext(2, Math.ceil(songSeconds(song) * rate), rate);
      schedule(offline, song, voice.buffer, active.slices, arrange(song, active.slices, options), mix, 0);
      const rendered = await offline.startRendering();
      const wav = encodeWav([rendered.getChannelData(0), rendered.getChannelData(1)], rate);
      if (download) URL.revokeObjectURL(download.url);
      setDownload({ url: URL.createObjectURL(new Blob([wav], { type: "audio/wav" })), name: `otomad-${seed}.wav` });
    } catch {
      setError("書き出しに失敗しました。");
    } finally {
      setBusy("");
    }
  }, [active, download, mix, options, seed, song, voice]);

  // 設定を変えたら、前に書き出したファイルは古くなるので消す
  useEffect(() => {
    setDownload((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, [song, options, mix, enabled]);

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

      <section className="card">
        <div className="card-head">
          <h2>1. 声ネタを入れる</h2>
          <span className="code">SOURCE</span>
        </div>
        <div className="otomad-buttons">
          <label className="btn primary">
            音声・動画ファイルを選ぶ
            <input className="visually-hidden" type="file" accept="audio/*,video/*" multiple onChange={(e) => void loadFiles(e.target.files)} />
          </label>
          <button className={recording ? "btn danger" : "btn"} type="button" onClick={() => void toggleRecording()}>
            {recording ? "■ 録音を止める" : "マイクで録音"}
          </button>
          <button className="btn" type="button" onClick={loadDemo}>
            お試し音声で試す
          </button>
        </div>
        {busy && <p className="sub" style={{ marginTop: 8 }}>{busy}</p>}

        {source && (source.videoUrl || source.buffer.duration > MAX_VOICE_SEC) && (
          <div className="otomad-range">
            {source.videoUrl && (
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <video ref={videoRef} src={source.videoUrl} controls playsInline preload="metadata" />
            )}
            <p className="sub">
              {source.name}・音声 {mmss(source.buffer.duration)}
              {source.buffer.duration >= MAX_SOURCE_SEC - 1 ? "(先頭10分まで読み込みました)" : ""}。使いたい場面を選んでください(一度に{MAX_VOICE_SEC}秒まで)。
            </p>
            <div className="sliders">
              <label>
                <span>開始 {mmss(rangeStart)}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, Math.floor(source.buffer.duration - 1))}
                  step={0.5}
                  value={rangeStart}
                  onChange={(e) => setRangeStart(Number(e.target.value))}
                />
              </label>
              <label>
                <span>長さ {rangeLength}秒</span>
                <input type="range" min={2} max={MAX_VOICE_SEC} step={1} value={rangeLength} onChange={(e) => setRangeLength(Number(e.target.value))} />
              </label>
            </div>
            <div className="otomad-buttons" style={{ marginTop: 8 }}>
              {source.videoUrl && (
                <button className="btn" type="button" onClick={() => setRangeStart(Math.floor((videoRef.current?.currentTime ?? 0) * 2) / 2)}>
                  動画の再生位置を開始にする
                </button>
              )}
              <button className="btn primary" type="button" onClick={() => applyRange(source, rangeStart, rangeLength)}>
                この範囲を声ネタにする
              </button>
            </div>
          </div>
        )}

        {voice && (
          <>
            <canvas ref={canvasRef} className="otomad-wave" aria-label="声ネタの波形と、切り分けた区間" />
            <p className="sub">
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
          </>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>2. 曲を決める</h2>
          <span className="code">{song.label}</span>
        </div>
        <div className="filters">
          <div className="filter-row">
            <span className="code">曲調</span>
            <div className="chips" style={{ margin: 0, padding: "1px 0" }}>
              {STYLES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  className="chip"
                  aria-pressed={!midiSong && style === s.value}
                  onClick={() => {
                    setMidiSong(null);
                    setStyle(s.value);
                    setBpm(null);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="otomad-buttons" style={{ marginTop: 8 }}>
          <button
            className="btn primary"
            type="button"
            onClick={() => {
              setMidiSong(null);
              setSeed((value) => value + 1);
            }}
          >
            別の曲にする
          </button>
          <label className="btn">
            MIDI を読み込む
            <input className="visually-hidden" type="file" accept=".mid,.midi,audio/midi" onChange={(e) => void loadMidi(e.target.files)} />
          </label>
        </div>
        <div className="sliders">
          <label>
            <span>テンポ {Math.round(song.bpm)}</span>
            <input type="range" min={70} max={190} step={1} value={Math.round(song.bpm)} onChange={(e) => setBpm(Number(e.target.value))} />
          </label>
          <label>
            <span>
              キー {transpose > 0 ? "+" : ""}
              {transpose}
            </span>
            <input type="range" min={-6} max={6} step={1} value={transpose} onChange={(e) => setTranspose(Number(e.target.value))} />
          </label>
        </div>
        <div className="otomad-toggles">
          <label>
            <input type="checkbox" checked={shots} onChange={(e) => setShots(e.target.checked)} disabled={Boolean(midiSong)} /> 連打の合いの手
          </label>
          <label>
            <input type="checkbox" checked={voiceDrums} onChange={(e) => setVoiceDrums(e.target.checked)} /> 声でドラム
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
          <button className="btn primary" type="button" onClick={playing ? stop : play} disabled={!voice || active.slices.length === 0}>
            {playing ? "■ 止める" : "▶ 再生"}
          </button>
          <button className="btn" type="button" onClick={() => void exportWav()} disabled={!voice || active.slices.length === 0 || Boolean(busy)}>
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
        音声はこの端末の中だけで処理し、どこにも送信しません。曲は毎回その場で自動生成するオリジナルです。他人の映像・音声・楽曲を素材にしたものを公開すると、権利者から削除や収益化の停止を求められることがあります。
      </p>
    </main>
  );
}
