import { midiToHz, type Slice } from "./analyze.ts";
import type { VoiceEvent } from "./arrange.ts";
import type { Song } from "./song.ts";

/**
 * 曲を Web Audio で鳴らす。再生用(AudioContext)と書き出し用(OfflineAudioContext)の
 * どちらにも同じ手順で音を並べるので、聴いた通りの音がファイルになる。
 */

export type Mix = {
  voice: number;
  backing: number;
  drums: number;
};

/** 好きな曲を使うときの伴奏(歌声を抜いた音)。ドラムだけ別にしてあるので音量を個別に変えられる */
export type BackingStems = { music: AudioBuffer; drums: AudioBuffer };

export const TAIL_SEC = 1.2;

export function songSeconds(song: Song): number {
  return (song.beats * 60) / song.bpm + TAIL_SEC;
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 16807) % 2147483647;
    data[i] = (seed / 2147483647) * 2 - 1;
  }
  return buffer;
}

/** start の時刻を 0 として、曲全体の音を並べる。止めるための関数を返す */
export function schedule(
  ctx: BaseAudioContext,
  song: Song,
  voice: AudioBuffer,
  slices: Slice[],
  events: VoiceEvent[],
  mix: Mix,
  start: number,
  stems?: BackingStems,
): () => void {
  const sources: AudioScheduledSourceNode[] = [];
  const master = ctx.createGain();
  master.gain.value = 0.62;
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.12;
  master.connect(limiter).connect(ctx.destination);

  const bus = (level: number): GainNode => {
    const gain = ctx.createGain();
    gain.gain.value = level;
    gain.connect(master);
    return gain;
  };
  const voiceBus = bus(mix.voice);
  const backingBus = bus(mix.backing * 0.5);
  const drumBus = bus(mix.drums);
  const secPerBeat = 60 / song.bpm;
  const noise = noiseBuffer(ctx);

  // ---- 好きな曲の伴奏(あれば) ----
  if (stems) {
    const play = (buffer: AudioBuffer, level: number) => {
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(gain).connect(master);
      source.start(start);
      sources.push(source);
    };
    play(stems.music, mix.backing * 1.1);
    play(stems.drums, mix.drums * 1.1);
  }

  // ---- 声ネタ ----
  for (const event of events) {
    const slice = slices[event.sliceIndex];
    if (!slice) continue;
    const at = start + event.time;
    const available = (slice.end - slice.start) / event.rate;
    const length = Math.max(0.03, Math.min(event.dur, available));
    const source = ctx.createBufferSource();
    source.buffer = voice;
    source.playbackRate.value = event.rate;
    const gain = ctx.createGain();
    const fade = Math.min(0.012, length / 3);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(event.gain, at + 0.004);
    gain.gain.setValueAtTime(event.gain, at + length - fade);
    gain.gain.linearRampToValueAtTime(0, at + length);
    source.connect(gain).connect(voiceBus);
    source.start(at, slice.start, length * event.rate + 0.02);
    source.stop(at + length + 0.02);
    sources.push(source);
  }

  // ---- 伴奏: ベースとコード ----
  const tone = (midi: number, at: number, dur: number, type: OscillatorType, level: number, cutoff: number) => {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = midiToHz(midi);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + 0.01);
    gain.gain.setValueAtTime(level, at + Math.max(0.02, dur - 0.04));
    gain.gain.linearRampToValueAtTime(0, at + dur);
    osc.connect(filter).connect(gain).connect(backingBus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
    sources.push(osc);
  };
  for (const note of song.bass) tone(note.midi, start + note.time * secPerBeat, note.dur * secPerBeat, "sawtooth", 0.5 * note.vel, 520);
  for (const note of song.chords) tone(note.midi, start + note.time * secPerBeat, note.dur * secPerBeat, "triangle", 0.2 * note.vel, 2400);

  // ---- ドラム ----
  for (const hit of song.drums) {
    const at = start + hit.time * secPerBeat;
    if (hit.kind === "kick") {
      const osc = ctx.createOscillator();
      osc.frequency.setValueAtTime(150, at);
      osc.frequency.exponentialRampToValueAtTime(42, at + 0.11);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.95 * hit.vel, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.24);
      osc.connect(gain).connect(drumBus);
      osc.start(at);
      osc.stop(at + 0.26);
      sources.push(osc);
    } else {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const snare = hit.kind === "snare";
      filter.type = snare ? "bandpass" : "highpass";
      filter.frequency.value = snare ? 1900 : 7500;
      const length = snare ? 0.17 : 0.045;
      gain.gain.setValueAtTime((snare ? 0.55 : 0.22) * hit.vel, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + length);
      source.connect(filter).connect(gain).connect(drumBus);
      source.start(at);
      source.stop(at + length + 0.02);
      sources.push(source);
      if (snare) {
        const body = ctx.createOscillator();
        body.type = "triangle";
        body.frequency.setValueAtTime(210, at);
        body.frequency.exponentialRampToValueAtTime(140, at + 0.08);
        const bodyGain = ctx.createGain();
        bodyGain.gain.setValueAtTime(0.3 * hit.vel, at);
        bodyGain.gain.exponentialRampToValueAtTime(0.001, at + 0.1);
        body.connect(bodyGain).connect(drumBus);
        body.start(at);
        body.stop(at + 0.12);
        sources.push(body);
      }
    }
  }

  return () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        // すでに止まっている音は無視する
      }
    }
    master.disconnect();
  };
}
