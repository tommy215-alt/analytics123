import type { DrumHit, Note, Song } from "./song.ts";

/**
 * MIDI ファイル(.mid)を読み、メロディ・伴奏・ドラムに振り分ける。
 * メロディは「平均していちばん高い音を鳴らしているパート」を選び、同時に鳴る音は高い方だけ残す。
 */

const MAX_NOTES = 6000;
const MAX_BEATS = 4 * 200;

type RawNote = { time: number; dur: number; midi: number; vel: number; channel: number; track: number };

export function parseMidi(data: Uint8Array, name = "MIDI"): Song {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const text = (offset: number) => String.fromCharCode(...data.subarray(offset, offset + 4));
  if (data.length < 14 || text(0) !== "MThd") throw new Error("MIDI ファイルではないようです。");

  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error("この形式(SMPTE 時間)の MIDI には対応していません。");

  const notes: RawNote[] = [];
  let tempoMicros = 500000;
  let tempoFound = false;
  let position = 8 + view.getUint32(4);

  for (let track = 0; track < trackCount && position + 8 <= data.length; track++) {
    if (text(position) !== "MTrk") break;
    const end = Math.min(data.length, position + 8 + view.getUint32(position + 4));
    let p = position + 8;
    let tick = 0;
    let status = 0;
    const open = new Map<number, { tick: number; vel: number }>();

    const varLen = (): number => {
      let value = 0;
      for (let i = 0; i < 4 && p < end; i++) {
        const byte = data[p++];
        value = (value << 7) | (byte & 0x7f);
        if (!(byte & 0x80)) break;
      }
      return value;
    };

    while (p < end) {
      tick += varLen();
      let byte = data[p];
      if (byte & 0x80) {
        status = byte;
        p++;
      }
      byte = status;
      if (byte === 0xff) {
        const type = data[p++];
        const length = varLen();
        if (type === 0x51 && length === 3 && !tempoFound) {
          tempoMicros = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
          tempoFound = true;
        }
        p += length;
        if (type === 0x2f) break;
      } else if (byte === 0xf0 || byte === 0xf7) {
        p += varLen();
      } else {
        const kind = byte & 0xf0;
        const channel = byte & 0x0f;
        if (kind === 0x90 || kind === 0x80) {
          const midi = data[p++];
          const vel = data[p++];
          const key = channel * 128 + midi;
          const started = open.get(key);
          if (started && (kind === 0x80 || vel === 0)) {
            notes.push({ time: started.tick / division, dur: Math.max(0.05, (tick - started.tick) / division), midi, vel: started.vel / 127, channel, track });
            open.delete(key);
          } else if (kind === 0x90 && vel > 0) {
            open.set(key, { tick, vel });
          }
        } else if (kind === 0xc0 || kind === 0xd0) {
          p += 1;
        } else {
          p += 2;
        }
      }
      if (notes.length > MAX_NOTES) break;
    }
    position = end;
  }

  const usable = notes.filter((n) => n.time < MAX_BEATS).sort((a, b) => a.time - b.time);
  if (usable.length === 0) throw new Error("音符が見つかりませんでした。");

  const drumNotes = usable.filter((n) => n.channel === 9);
  const pitched = usable.filter((n) => n.channel !== 9);

  // パートごとにまとめて、メロディらしいもの(音数が十分あり、平均の高さが最も高い)を選ぶ
  const parts = new Map<string, RawNote[]>();
  for (const n of pitched) {
    const key = `${n.track}:${n.channel}`;
    if (!parts.has(key)) parts.set(key, []);
    parts.get(key)!.push(n);
  }
  let melodyKey = "";
  let bestScore = -Infinity;
  for (const [key, list] of parts) {
    if (list.length < 8) continue;
    const average = list.reduce((sum, n) => sum + n.midi, 0) / list.length;
    const score = average + Math.min(12, list.length / 20);
    if (score > bestScore) {
      bestScore = score;
      melodyKey = key;
    }
  }
  if (!melodyKey) melodyKey = [...parts.keys()][0] ?? "";

  const toNote = (n: RawNote): Note => ({ time: n.time, dur: n.dur, midi: n.midi, vel: Math.max(0.3, n.vel) });

  // 同じ瞬間に複数鳴るときは高い音だけを残し、前の音は次の音の頭で切る
  const melody: Note[] = [];
  for (const n of parts.get(melodyKey) ?? []) {
    const previous = melody[melody.length - 1];
    if (previous && Math.abs(previous.time - n.time) < 0.02) {
      if (n.midi > previous.midi) melody[melody.length - 1] = toNote(n);
      continue;
    }
    if (previous && previous.time + previous.dur > n.time) previous.dur = Math.max(0.05, n.time - previous.time);
    melody.push(toNote(n));
  }

  const others = pitched.filter((n) => `${n.track}:${n.channel}` !== melodyKey);
  const bass = others.filter((n) => n.midi < 48).map(toNote);
  const chords = others.filter((n) => n.midi >= 48).map(toNote);

  const drums: DrumHit[] = [];
  for (const n of drumNotes) {
    const kind = n.midi === 35 || n.midi === 36 ? "kick" : n.midi === 38 || n.midi === 40 || n.midi === 37 ? "snare" : n.midi === 42 || n.midi === 44 || n.midi === 46 ? "hat" : null;
    if (kind) drums.push({ time: n.time, kind, vel: Math.max(0.4, n.vel) });
  }

  const last = usable.reduce((max, n) => Math.max(max, n.time + n.dur), 0);
  return {
    bpm: Math.round((60000000 / tempoMicros) * 10) / 10,
    beats: Math.ceil(last) + 2,
    melody,
    bass,
    chords,
    drums,
    shots: [],
    label: name,
  };
}
