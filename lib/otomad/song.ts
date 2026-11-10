/**
 * 自動作曲。乱数の種(seed)と曲調から、コード進行・メロディ・ベース・ドラムを作る。
 * すべてこの場で生成するオリジナルで、既存の曲のデータは使わない。
 */

export type Note = {
  /** 曲の頭からの位置(拍) */
  time: number;
  /** 長さ(拍) */
  dur: number;
  midi: number;
  vel: number;
};

export type DrumHit = { time: number; kind: "kick" | "snare" | "hat"; vel: number };

/** 「連打」などの合いの手。声ネタを短く鳴らす */
export type Shot = { time: number; dur: number; semitone: number; vel: number };

export type Song = {
  bpm: number;
  /** 曲の長さ(拍) */
  beats: number;
  melody: Note[];
  bass: Note[];
  chords: Note[];
  drums: DrumHit[];
  shots: Shot[];
  label: string;
};

export type Style = "four" | "euro" | "chill" | "break";

export const STYLES: { value: Style; label: string; bpm: number }[] = [
  { value: "four", label: "4つ打ち", bpm: 132 },
  { value: "euro", label: "高速ユーロ風", bpm: 156 },
  { value: "break", label: "ブレイクビーツ", bpm: 120 },
  { value: "chill", label: "ゆったり", bpm: 92 },
];

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/** 1小節ごとのコード(音階の何番目を根音にするか)。4小節または8小節でひと回り */
const PROGRESSIONS: { name: string; scale: number[]; degrees: number[] }[] = [
  { name: "王道進行", scale: MAJOR, degrees: [3, 4, 2, 5] },
  { name: "ポップ進行", scale: MAJOR, degrees: [0, 4, 5, 3] },
  { name: "切なめ進行", scale: MINOR, degrees: [0, 5, 2, 6] },
  { name: "疾走進行", scale: MINOR, degrees: [5, 6, 0, 0] },
  { name: "カノン風", scale: MAJOR, degrees: [0, 4, 5, 2, 3, 0, 3, 4] },
];

/** 2小節ぶんのリズム型(16分音符で数えた、音を出す位置) */
const RHYTHMS: number[][] = [
  [0, 4, 6, 8, 12, 16, 20, 22, 24, 28],
  [0, 3, 6, 8, 11, 14, 16, 19, 22, 24, 28],
  [0, 2, 4, 8, 10, 12, 16, 18, 20, 24, 26, 28],
  [0, 4, 8, 10, 12, 16, 20, 24, 26, 28, 30],
  [0, 6, 8, 12, 14, 16, 22, 24, 28],
  [0, 4, 6, 10, 12, 16, 20, 22, 26, 28],
];

const BARS = 16;
const BEATS_PER_BAR = 4;

function degreeToMidi(root: number, scale: number[], degree: number): number {
  const octave = Math.floor(degree / 7);
  return root + scale[((degree % 7) + 7) % 7] + octave * 12;
}

export function generateSong(seed: number, style: Style, bpmOverride?: number): Song {
  const rand = rng(seed * 7919 + 13);
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];
  const preset = STYLES.find((s) => s.value === style) ?? STYLES[0];
  const bpm = bpmOverride ?? preset.bpm;

  const pool = style === "chill" ? PROGRESSIONS.filter((p) => p.scale === MAJOR) : PROGRESSIONS;
  const progression = pick(pool);
  const scale = progression.scale;
  const root = 57 + Math.floor(rand() * 8); // ラ(A3)〜ミ(E4)のどれかを主音にする
  const chordAt = (bar: number): number => progression.degrees[bar % progression.degrees.length];

  // ---- メロディ: 2小節の型を A A' B A の順に並べ、後半は少し変える ----
  const rhythmA = pick(RHYTHMS);
  const rhythmB = pick(RHYTHMS.filter((r) => r !== rhythmA));
  const contour = (length: number): number[] => {
    // 音階の中を、主に隣の音へ動く上がり下がりの形
    const steps: number[] = [];
    let position = 0;
    for (let i = 0; i < length; i++) {
      steps.push(position);
      const r = rand();
      position += r < 0.34 ? 1 : r < 0.68 ? -1 : r < 0.8 ? 2 : r < 0.92 ? -2 : 0;
      position = Math.max(-3, Math.min(5, position));
    }
    return steps;
  };
  const contourA = contour(rhythmA.length);
  const contourB = contour(rhythmB.length);

  const melody: Note[] = [];
  const sections = [
    { rhythm: rhythmA, shape: contourA },
    { rhythm: rhythmA, shape: contourA },
    { rhythm: rhythmB, shape: contourB },
    { rhythm: rhythmA, shape: contourA },
  ];
  for (let half = 0; half < 2; half++) {
    sections.forEach((section, sectionIndex) => {
      const startBar = half * 8 + sectionIndex * 2;
      const lift = half === 1 && sectionIndex >= 2 ? 2 : 0; // 終盤は少し高く
      section.rhythm.forEach((step, i) => {
        const bar = startBar + Math.floor(step / 16);
        const chord = chordAt(bar);
        const strong = step % 4 === 0;
        // 強い拍はコードの音(根音・3度・5度)に寄せる
        let degree = chord + 7 + section.shape[i] + lift;
        if (strong) {
          const offset = (((degree - chord) % 7) + 7) % 7;
          const nearest = [0, 2, 4, 7].reduce((best, tone) => (Math.abs(tone - offset) < Math.abs(best - offset) ? tone : best), 0);
          degree += nearest - offset;
        }
        const next = section.rhythm[i + 1] ?? 32;
        const dur = Math.min(1, (next - step) / 4) * 0.94;
        melody.push({
          time: startBar * BEATS_PER_BAR + step / 4,
          dur,
          midi: degreeToMidi(root + 12, scale, degree - 7),
          vel: strong ? 1 : 0.82,
        });
      });
    });
  }

  // ---- ベースとコード ----
  const bass: Note[] = [];
  const chords: Note[] = [];
  for (let bar = 0; bar < BARS; bar++) {
    const chord = chordAt(bar);
    const base = bar * BEATS_PER_BAR;
    const rootMidi = degreeToMidi(root - 24, scale, chord);
    for (let eighth = 0; eighth < 8; eighth++) {
      const offbeat = eighth % 2 === 1;
      if (style === "chill" && offbeat && eighth !== 7) continue;
      const octave = style === "euro" && offbeat ? 12 : 0;
      bass.push({ time: base + eighth / 2, dur: 0.42, midi: rootMidi + octave, vel: offbeat ? 0.8 : 1 });
    }
    for (const tone of [0, 2, 4]) {
      chords.push({ time: base, dur: 3.9, midi: degreeToMidi(root, scale, chord + tone), vel: 0.6 });
    }
  }

  // ---- ドラム ----
  const drums: DrumHit[] = [];
  for (let bar = 0; bar < BARS; bar++) {
    const base = bar * BEATS_PER_BAR;
    const hit = (beat: number, kind: DrumHit["kind"], vel = 1) => drums.push({ time: base + beat, kind, vel });
    if (style === "four" || style === "euro") {
      for (let beat = 0; beat < 4; beat++) hit(beat, "kick");
      hit(1, "snare");
      hit(3, "snare");
      const division = style === "euro" ? 4 : 2;
      for (let i = 0; i < 4 * division; i++) {
        if (style === "four" && i % 2 === 0) continue;
        hit(i / division, "hat", i % division === division / 2 ? 0.9 : 0.5);
      }
    } else if (style === "break") {
      hit(0, "kick");
      hit(1.75, "kick", 0.8);
      hit(2.5, "kick");
      hit(1, "snare");
      hit(3, "snare");
      if (bar % 2 === 1) hit(3.75, "snare", 0.6);
      for (let i = 0; i < 8; i++) hit(i / 2, "hat", i % 2 ? 0.8 : 0.5);
    } else {
      hit(0, "kick");
      hit(2.5, "kick", 0.8);
      hit(1, "snare", 0.8);
      hit(3, "snare", 0.8);
      for (let i = 0; i < 8; i++) hit(i / 2, "hat", 0.45);
    }
  }

  // ---- 合いの手: 4小節ごとの最後の1拍に、声ネタの連打を入れる ----
  const shots: Shot[] = [];
  for (let bar = 3; bar < BARS; bar += 4) {
    const base = bar * BEATS_PER_BAR + 3;
    const fast = rand() < 0.5;
    const count = fast ? 8 : 4;
    const rising = rand() < 0.6;
    for (let i = 0; i < count; i++) {
      shots.push({ time: base + i / count, dur: (1 / count) * 0.9, semitone: rising ? i * (fast ? 1 : 2) : 0, vel: 0.75 + (i / count) * 0.25 });
    }
  }
  // 曲の終わりは長めに1音伸ばす
  melody.push({ time: BARS * BEATS_PER_BAR, dur: 2, midi: degreeToMidi(root + 12, scale, chordAt(0)), vel: 1 });

  return {
    bpm,
    beats: BARS * BEATS_PER_BAR + 4,
    melody,
    bass,
    chords,
    drums,
    shots,
    label: `${preset.label}・${progression.name}`,
  };
}
