import { hzToMidi, type Slice } from "./analyze.ts";
import type { Song } from "./song.ts";

/**
 * 曲の音符に、どの声ネタをどの速さで鳴らすかを割り当てる。
 * 音程は再生速度を変えて合わせる(速くすると高く、遅くすると低くなる、音MADの基本の手法)。
 */

export type VoiceEvent = {
  /** 曲の頭からの位置(秒) */
  time: number;
  /** 鳴らす長さ(秒) */
  dur: number;
  sliceIndex: number;
  /** 再生速度(1 = 元の高さ) */
  rate: number;
  gain: number;
};

export type Options = {
  /** メロディを歌わせる声ネタ(スライスの番号)。空なら自動で選ぶ */
  leadSlices: number[];
  /** 合いの手(連打)を入れる */
  shots: boolean;
  /** キックとスネアに声ネタを重ねる */
  voiceDrums: boolean;
  /** メロディ全体の上げ下げ(半音) */
  transpose: number;
};

const MIN_RATE = 0.45;
const MAX_RATE = 2.4;

/** 音程がはっきりしている順に、メロディ向きの声ネタを選ぶ */
export function pickLeads(slices: Slice[], max = 3): number[] {
  const ranked = slices
    .map((slice, index) => ({ index, slice }))
    .filter(({ slice }) => slice.pitchHz !== null && slice.end - slice.start >= 0.1)
    .sort((a, b) => b.slice.clarity - a.slice.clarity);
  if (ranked.length > 0) return ranked.slice(0, max).map((r) => r.index);
  // 音程の取れる声ネタが無ければ、長いものを使う(高さは仮にド=60として扱う)
  return slices
    .map((slice, index) => ({ index, length: slice.end - slice.start }))
    .sort((a, b) => b.length - a.length)
    .slice(0, max)
    .map((r) => r.index);
}

const baseMidi = (slice: Slice): number => (slice.pitchHz ? hzToMidi(slice.pitchHz) : 60);

/** メロディを何オクターブずらせば、声ネタを無理のない速さで鳴らせるか */
export function bestOctaveShift(melodyMidis: number[], sliceMidi: number): number {
  if (melodyMidis.length === 0) return 0;
  const sorted = [...melodyMidis].sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)];
  return Math.round((sliceMidi - middle) / 12) * 12;
}

export function arrange(song: Song, slices: Slice[], options: Options): VoiceEvent[] {
  if (slices.length === 0) return [];
  const secPerBeat = 60 / song.bpm;
  const leads = (options.leadSlices.length ? options.leadSlices : pickLeads(slices)).filter((i) => slices[i]);
  if (leads.length === 0) return [];
  const events: VoiceEvent[] = [];
  const clampRate = (rate: number) => Math.max(MIN_RATE, Math.min(MAX_RATE, rate));

  // メロディ: 2小節ごとに声ネタを切り替える
  const melodyMidis = song.melody.map((n) => n.midi + options.transpose);
  const shifts = leads.map((i) => bestOctaveShift(melodyMidis, baseMidi(slices[i])));
  for (const note of song.melody) {
    const which = Math.floor(note.time / 8) % leads.length;
    const slice = slices[leads[which]];
    const semitones = note.midi + options.transpose + shifts[which] - baseMidi(slice);
    events.push({
      time: note.time * secPerBeat,
      dur: note.dur * secPerBeat,
      sliceIndex: leads[which],
      rate: clampRate(2 ** (semitones / 12)),
      gain: note.vel,
    });
  }

  // 合いの手: メロディに使っていない声ネタを優先して連打する
  if (options.shots && song.shots.length > 0) {
    const spare = slices.map((_, i) => i).filter((i) => !leads.includes(i));
    const candidates = spare.length ? spare : leads;
    for (const shot of song.shots) {
      const index = candidates[Math.floor(shot.time / 16) % candidates.length];
      events.push({
        time: shot.time * secPerBeat,
        dur: shot.dur * secPerBeat,
        sliceIndex: index,
        rate: clampRate(2 ** (shot.semitone / 12)),
        gain: shot.vel * 0.9,
      });
    }
  }

  // 声ドラム: キックには低く鳴らした声、スネアにはザラついた声を重ねる
  if (options.voiceDrums) {
    const byNoise = slices.map((slice, index) => ({ index, zcr: slice.zcr })).sort((a, b) => b.zcr - a.zcr);
    const snareSlice = byNoise[0].index;
    const kickSlice = byNoise[byNoise.length - 1].index;
    for (const hit of song.drums) {
      if (hit.kind === "kick") events.push({ time: hit.time * secPerBeat, dur: 0.11, sliceIndex: kickSlice, rate: 0.6, gain: 0.55 * hit.vel });
      if (hit.kind === "snare") events.push({ time: hit.time * secPerBeat, dur: 0.14, sliceIndex: snareSlice, rate: 1.35, gain: 0.5 * hit.vel });
    }
  }

  return events.sort((a, b) => a.time - b.time);
}

/** 16ビットの WAV ファイルにする */
export function encodeWav(channels: Float32Array[], sampleRate: number): ArrayBuffer {
  const frames = channels[0]?.length ?? 0;
  const count = channels.length;
  const buffer = new ArrayBuffer(44 + frames * count * 2);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + frames * count * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, frames * count * 2, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < count; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return buffer;
}
