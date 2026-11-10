/**
 * 声ネタの解析: 無音で区切って「切れ端(スライス)」にし、それぞれの音の高さを調べる。
 * ブラウザに依存しない計算だけで書いてあるので、単体テストできる。
 */

export type Slice = {
  /** 元の音声の中での開始・終了位置(秒) */
  start: number;
  end: number;
  /** 検出した音の高さ(Hz)。はっきりしない場合は null */
  pitchHz: number | null;
  /** 音程のはっきり度(0〜1) */
  clarity: number;
  /** 音量(RMS) */
  rms: number;
  /** ザラつき具合(ゼロ交差率)。高いほど子音や雑音っぽい */
  zcr: number;
};

const HOP = 256;
const MIN_SLICE_SEC = 0.07;
const MAX_SLICE_SEC = 0.5;
const MAX_SLICES = 24;

function envelope(samples: Float32Array): Float32Array {
  const frames = Math.floor(samples.length / HOP);
  const env = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * HOP;
    for (let i = 0; i < HOP; i++) sum += samples[base + i] * samples[base + i];
    env[f] = Math.sqrt(sum / HOP);
  }
  // 前後1フレームでならす
  const smooth = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    smooth[f] = (env[Math.max(0, f - 1)] + env[f] + env[Math.min(frames - 1, f + 1)]) / 3;
  }
  return smooth;
}

/** 音のある区間を見つけ、長すぎる区間は音量の谷か一定の長さで分ける */
export function findSlices(samples: Float32Array, sampleRate: number): { start: number; end: number }[] {
  const env = envelope(samples);
  if (env.length === 0) return [];
  const sorted = Float32Array.from(env).sort();
  const floor = sorted[Math.floor(sorted.length * 0.1)];
  const peak = sorted[sorted.length - 1];
  if (peak < 1e-4) return [];
  const threshold = Math.max(floor * 3, peak * 0.06);
  const frameSec = HOP / sampleRate;
  const hang = Math.round(0.04 / frameSec);

  const regions: [number, number][] = [];
  let start = -1;
  let quiet = 0;
  for (let f = 0; f < env.length; f++) {
    if (env[f] >= threshold) {
      if (start < 0) start = f;
      quiet = 0;
    } else if (start >= 0 && ++quiet > hang) {
      regions.push([start, f - quiet + 1]);
      start = -1;
      quiet = 0;
    }
  }
  if (start >= 0) regions.push([start, env.length]);

  const minFrames = Math.round(MIN_SLICE_SEC / frameSec);
  const maxFrames = Math.round(MAX_SLICE_SEC / frameSec);
  const pieces: [number, number][] = [];
  for (const [a, b] of regions) {
    let from = a;
    while (b - from > maxFrames) {
      // 0.2秒より先〜上限のあいだで、いちばん音量の小さい所を切れ目にする
      let cut = from + maxFrames;
      let lowest = Infinity;
      for (let f = from + Math.round(0.2 / frameSec); f < from + maxFrames; f++) {
        if (env[f] < lowest) {
          lowest = env[f];
          cut = f;
        }
      }
      pieces.push([from, cut]);
      from = cut;
    }
    pieces.push([from, b]);
  }

  return pieces
    .filter(([a, b]) => b - a >= minFrames)
    .slice(0, MAX_SLICES)
    .map(([a, b]) => ({ start: (a * HOP) / sampleRate, end: Math.min(samples.length, b * HOP) / sampleRate }));
}

/**
 * 音の高さを調べる(YIN 法の簡略版)。
 * 声の範囲(70〜700Hz)だけを探し、周期性が弱ければ null を返す。
 */
export function detectPitch(samples: Float32Array, sampleRate: number): { hz: number | null; clarity: number } {
  const minLag = Math.floor(sampleRate / 700);
  const maxLag = Math.floor(sampleRate / 70);
  const size = Math.min(samples.length - maxLag, 2048);
  if (size < 256) return { hz: null, clarity: 0 };

  const diff = new Float32Array(maxLag + 1);
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    for (let i = 0; i < size; i++) {
      const d = samples[i] - samples[i + lag];
      sum += d * d;
    }
    diff[lag] = sum;
  }
  // 累積平均で正規化(ずれ0付近に引っ張られないようにする)
  const norm = new Float32Array(maxLag + 1);
  norm[0] = 1;
  let running = 0;
  for (let lag = 1; lag <= maxLag; lag++) {
    running += diff[lag];
    norm[lag] = running === 0 ? 1 : (diff[lag] * lag) / running;
  }

  let best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (norm[lag] < 0.2) {
      while (lag + 1 <= maxLag && norm[lag + 1] < norm[lag]) lag++;
      best = lag;
      break;
    }
  }
  if (best < 0) {
    let lowest = Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (norm[lag] < lowest) {
        lowest = norm[lag];
        best = lag;
      }
    }
    if (lowest > 0.35) return { hz: null, clarity: Math.max(0, 1 - lowest) };
  }

  // 前後の値から放物線で補間して、周期を細かく求める
  const a = norm[Math.max(1, best - 1)];
  const b = norm[best];
  const c = norm[Math.min(maxLag, best + 1)];
  const shift = a + c - 2 * b === 0 ? 0 : (a - c) / (2 * (a + c - 2 * b));
  return { hz: sampleRate / (best + shift), clarity: Math.max(0, Math.min(1, 1 - b)) };
}

export function analyze(samples: Float32Array, sampleRate: number): Slice[] {
  return findSlices(samples, sampleRate).map(({ start, end }) => {
    const from = Math.floor(start * sampleRate);
    const to = Math.floor(end * sampleRate);
    const part = samples.subarray(from, to);

    let sum = 0;
    let crossings = 0;
    for (let i = 0; i < part.length; i++) {
      sum += part[i] * part[i];
      if (i > 0 && part[i - 1] < 0 !== part[i] < 0) crossings++;
    }

    // 音程は、出だしの子音を避けて少し後ろから調べる
    const skip = Math.min(Math.floor(part.length * 0.25), Math.floor(0.06 * sampleRate));
    const pitch = detectPitch(part.subarray(skip), sampleRate);
    return {
      start,
      end,
      pitchHz: pitch.hz,
      clarity: pitch.clarity,
      rms: Math.sqrt(sum / Math.max(1, part.length)),
      zcr: crossings / Math.max(1, part.length),
    };
  });
}

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

const NOTE_NAMES = ["ド", "ド#", "レ", "レ#", "ミ", "ファ", "ファ#", "ソ", "ソ#", "ラ", "ラ#", "シ"];

export function noteName(midi: number): string {
  const rounded = Math.round(midi);
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

/**
 * お試し用の合成音声(「あ・い・う・え・お」風の5音)。
 * のこぎり波を、母音ごとの響き(フォルマント)に合わせた共鳴器に通して作る。
 */
export function makeDemoVoice(sampleRate: number): Float32Array {
  const vowels: [number, number, number][] = [
    [800, 1200, 196],
    [300, 2300, 220],
    [350, 1200, 247],
    [500, 1900, 220],
    [500, 900, 174.6],
  ];
  const noteSec = 0.26;
  const gapSec = 0.09;
  const out = new Float32Array(Math.ceil((noteSec + gapSec) * vowels.length * sampleRate) + 1);

  vowels.forEach(([f1, f2, f0], index) => {
    const offset = Math.floor(index * (noteSec + gapSec) * sampleRate);
    const length = Math.floor(noteSec * sampleRate);
    const resonators = [f1, f2].map((freq) => {
      const r = Math.exp((-Math.PI * 110) / sampleRate);
      return { a1: 2 * r * Math.cos((2 * Math.PI * freq) / sampleRate), a2: -r * r, y1: 0, y2: 0 };
    });
    let phase = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      phase += (f0 * (1 + 0.012 * Math.sin(i * 0.004))) / sampleRate;
      phase -= Math.floor(phase);
      const source = phase * 2 - 1;
      let voiced = 0;
      for (const res of resonators) {
        const y = source + res.a1 * res.y1 + res.a2 * res.y2;
        res.y2 = res.y1;
        res.y1 = y;
        voiced += y;
      }
      const env = Math.min(1, t / 0.06) * Math.min(1, (1 - t) / 0.18);
      out[offset + i] = voiced * 0.018 * env;
    }
  });

  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) for (let i = 0; i < out.length; i++) out[i] = (out[i] / peak) * 0.8;
  return out;
}
