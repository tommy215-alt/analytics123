import { detectPitch, hzToMidi } from "./analyze.ts";
import type { Note } from "./song.ts";

/**
 * 歌声(ボーカルだけにした音声)から、メロディの音符を読み取る。
 * 細かい間隔で音の高さを調べ、同じ高さが続く区間を1つの音符にまとめる。
 * 返す音符の time / dur は「秒」。
 */

const TARGET_RATE = 11025;
const WINDOW = 512;
const HOP = 128;
const MIN_NOTE_SEC = 0.07;
const MIN_CLARITY = 0.6;

/** 高さの解析は低い周波数だけ見れば足りるので、先に粗くして計算を軽くする */
export function downsample(samples: Float32Array, sampleRate: number): { data: Float32Array; rate: number } {
  const factor = Math.max(1, Math.round(sampleRate / TARGET_RATE));
  if (factor === 1) return { data: samples, rate: sampleRate };
  const out = new Float32Array(Math.floor(samples.length / factor));
  for (let i = 0; i < out.length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += samples[i * factor + k];
    out[i] = sum / factor;
  }
  return { data: out, rate: sampleRate / factor };
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function extractMelody(samples: Float32Array, sampleRate: number): Note[] {
  const { data, rate } = downsample(samples, sampleRate);
  const maxLag = Math.floor(rate / 70);
  const frames = Math.floor((data.length - WINDOW - maxLag) / HOP);
  if (frames <= 0) return [];

  // 1) フレームごとの音量と高さ
  const loudness = new Float32Array(frames);
  let peak = 0;
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * HOP;
    for (let i = 0; i < WINDOW; i++) sum += data[base + i] * data[base + i];
    loudness[f] = Math.sqrt(sum / WINDOW);
    peak = Math.max(peak, loudness[f]);
  }
  if (peak < 1e-4) return [];
  const gate = peak * 0.03;

  const pitch: (number | null)[] = new Array(frames).fill(null);
  for (let f = 0; f < frames; f++) {
    if (loudness[f] < gate) continue;
    const base = f * HOP;
    const result = detectPitch(data.subarray(base, base + WINDOW + maxLag), rate);
    if (result.hz !== null && result.clarity >= MIN_CLARITY) pitch[f] = hzToMidi(result.hz);
  }

  // 2) 1フレームだけの飛び(オクターブ違いの誤検出など)を、前後の値でならす
  const smooth: (number | null)[] = pitch.map((value, f) => {
    if (value === null) return null;
    const near: number[] = [];
    for (let k = -2; k <= 2; k++) {
      const v = pitch[f + k];
      if (v !== null && v !== undefined) near.push(v);
    }
    return near.length >= 3 ? medianOf(near) : value;
  });

  // 3) 同じ高さが続く区間を音符にまとめる
  const frameSec = HOP / rate;
  const notes: Note[] = [];
  let start = -1;
  let values: number[] = [];
  let level = 0;
  const close = (endFrame: number) => {
    if (start < 0) return;
    const dur = (endFrame - start) * frameSec;
    if (dur >= MIN_NOTE_SEC) {
      notes.push({ time: start * frameSec, dur, midi: Math.round(medianOf(values)), vel: Math.max(0.5, Math.min(1, level / values.length / (peak * 0.5))) });
    }
    start = -1;
    values = [];
    level = 0;
  };

  for (let f = 0; f < frames; f++) {
    const value = smooth[f];
    if (value === null) {
      // 2フレームまでの途切れは同じ音符の続きとみなす
      if (start >= 0 && smooth[f + 1] == null && smooth[f + 2] == null) close(f);
      continue;
    }
    if (start >= 0 && Math.abs(value - medianOf(values)) > 0.7) {
      // 高さが変わった状態が2フレーム続いたら、次の音符に切り替える
      const next = smooth[f + 1];
      if (next !== null && next !== undefined && Math.abs(next - value) < 0.7) close(f);
      else continue;
    }
    if (start < 0) start = f;
    values.push(value);
    level += loudness[f];
  }
  close(frames);

  // 4) 同じ高さで、すき間がごく短い音符はつなげる
  const merged: Note[] = [];
  for (const note of notes) {
    const previous = merged[merged.length - 1];
    if (previous && previous.midi === note.midi && note.time - (previous.time + previous.dur) < 0.04) {
      previous.dur = note.time + note.dur - previous.time;
    } else {
      merged.push({ ...note });
    }
  }
  return merged;
}
