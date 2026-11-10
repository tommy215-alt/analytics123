import assert from "node:assert/strict";
import { test } from "node:test";
import { analyze, detectPitch, findSlices, hzToMidi, makeDemoVoice, noteName } from "../lib/otomad/analyze.ts";
import { arrange, bestOctaveShift, encodeWav, pickLeads } from "../lib/otomad/arrange.ts";
import { parseMidi } from "../lib/otomad/midi.ts";
import { generateSong, STYLES } from "../lib/otomad/song.ts";

const RATE = 44100;

function tone(hz: number, sec: number, amp = 0.5): Float32Array {
  const out = new Float32Array(Math.floor(sec * RATE));
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * hz * i) / RATE) * amp;
  return out;
}

function join(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const silence = (sec: number) => new Float32Array(Math.floor(sec * RATE));

test("detectPitch は正弦波の高さを当てる", () => {
  for (const hz of [110, 220, 330, 523.25]) {
    const result = detectPitch(tone(hz, 0.3), RATE);
    assert.ok(result.hz !== null && Math.abs(result.hz - hz) / hz < 0.01, `${hz}Hz → ${result.hz}`);
    assert.ok(result.clarity > 0.8);
  }
});

test("detectPitch は雑音や無音では高さを返さない", () => {
  let seed = 7;
  const noise = new Float32Array(RATE / 4).map(() => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  });
  assert.equal(detectPitch(noise, RATE).hz, null);
  assert.equal(detectPitch(silence(0.3), RATE).hz, null);
});

test("findSlices は無音で区切り、短すぎる音は捨てる", () => {
  const signal = join([silence(0.2), tone(220, 0.25), silence(0.2), tone(330, 0.3), silence(0.2), tone(440, 0.02), silence(0.2)]);
  const slices = findSlices(signal, RATE);
  assert.equal(slices.length, 2);
  assert.ok(Math.abs(slices[0].start - 0.2) < 0.03 && Math.abs(slices[0].end - 0.45) < 0.05);
  assert.ok(Math.abs(slices[1].start - 0.65) < 0.03);
});

test("findSlices は長い音を0.5秒以下に分け、無音だけなら空を返す", () => {
  const slices = findSlices(join([silence(0.1), tone(200, 1.6), silence(0.1)]), RATE);
  assert.ok(slices.length >= 3);
  for (const s of slices) assert.ok(s.end - s.start <= 0.52);
  assert.deepEqual(findSlices(silence(1), RATE), []);
  assert.deepEqual(findSlices(new Float32Array(0), RATE), []);
});

test("お試し音声は5つに切れて、それぞれ音程が取れる", () => {
  const slices = analyze(makeDemoVoice(RATE), RATE);
  assert.equal(slices.length, 5);
  const expected = [196, 220, 247, 220, 174.6];
  slices.forEach((slice, i) => {
    assert.ok(slice.pitchHz !== null, `slice ${i} に音程が無い`);
    assert.ok(Math.abs(hzToMidi(slice.pitchHz!) - hzToMidi(expected[i])) < 0.5, `slice ${i}: ${slice.pitchHz}`);
  });
  assert.equal(noteName(69), "ラ4");
  assert.equal(noteName(60), "ド4");
});

test("generateSong は同じ種なら同じ曲、違う種なら違う曲を作る", () => {
  const a = generateSong(5, "four");
  assert.deepEqual(a, generateSong(5, "four"));
  assert.notDeepEqual(a.melody, generateSong(6, "four").melody);
});

test("generateSong の音符は曲の長さに収まり、歌える範囲にある", () => {
  for (const { value, bpm } of STYLES) {
    for (let seed = 1; seed <= 25; seed++) {
      const song = generateSong(seed, value);
      assert.equal(song.bpm, bpm);
      assert.ok(song.melody.length > 60);
      for (const n of song.melody) {
        assert.ok(n.time >= 0 && n.time + n.dur <= song.beats, "曲の長さからはみ出している");
        assert.ok(n.midi >= 55 && n.midi <= 96, `メロディの高さ ${n.midi}`);
        assert.ok(n.dur > 0);
      }
      for (let i = 1; i < song.melody.length; i++) {
        assert.ok(song.melody[i].time >= song.melody[i - 1].time + song.melody[i - 1].dur - 1e-9, "メロディが重なっている");
      }
      for (const d of song.drums) assert.ok(d.time < song.beats);
      assert.equal(song.shots.length > 0, true);
    }
  }
  assert.equal(generateSong(1, "euro", 100).bpm, 100);
});

test("arrange は音程を再生速度で合わせる", () => {
  const slices = analyze(makeDemoVoice(RATE), RATE);
  const song = generateSong(3, "four");
  const events = arrange(song, slices, { leadSlices: [1], shots: false, voiceDrums: false, transpose: 0 });
  assert.equal(events.length, song.melody.length);
  const shift = bestOctaveShift(song.melody.map((n) => n.midi), hzToMidi(slices[1].pitchHz!));
  const sorted = [...song.melody].sort((a, b) => a.time - b.time);
  events.forEach((event, i) => {
    const expected = 2 ** ((sorted[i].midi + shift - hzToMidi(slices[1].pitchHz!)) / 12);
    assert.ok(Math.abs(event.rate - Math.max(0.45, Math.min(2.4, expected))) < 1e-9);
    assert.ok(event.rate >= 0.45 && event.rate <= 2.4);
  });
  // 1オクターブ上げる指定は、速度がちょうど2倍になる(上限に当たらない範囲で)
  const up = arrange({ ...song, melody: [{ time: 0, dur: 1, midi: 60, vel: 1 }] }, [{ ...slices[1], pitchHz: 261.6256 }], {
    leadSlices: [0],
    shots: false,
    voiceDrums: false,
    transpose: 12,
  });
  assert.ok(Math.abs(up[0].rate - 1) < 1e-3, "オクターブ調整で元の高さに近づける");
});

test("arrange は合いの手と声ドラムを足し、声ネタが無ければ何も返さない", () => {
  const slices = analyze(makeDemoVoice(RATE), RATE);
  const song = generateSong(3, "four");
  const base = arrange(song, slices, { leadSlices: [], shots: false, voiceDrums: false, transpose: 0 }).length;
  const withShots = arrange(song, slices, { leadSlices: [], shots: true, voiceDrums: false, transpose: 0 }).length;
  const withDrums = arrange(song, slices, { leadSlices: [], shots: false, voiceDrums: true, transpose: 0 }).length;
  assert.equal(withShots, base + song.shots.length);
  assert.equal(withDrums, base + song.drums.filter((d) => d.kind !== "hat").length);
  assert.deepEqual(arrange(song, [], { leadSlices: [], shots: true, voiceDrums: true, transpose: 0 }), []);
  assert.deepEqual(pickLeads([]), []);
});

test("pickLeads は音程の取れない素材だけでも候補を返す", () => {
  const unpitched = [
    { start: 0, end: 0.1, pitchHz: null, clarity: 0, rms: 0.1, zcr: 0.3 },
    { start: 0.2, end: 0.6, pitchHz: null, clarity: 0, rms: 0.1, zcr: 0.2 },
  ];
  assert.deepEqual(pickLeads(unpitched), [1, 0]);
});

test("encodeWav は正しいヘッダーと長さの WAV を作る", () => {
  const wav = new DataView(encodeWav([new Float32Array([0, 1, -1, 2]), new Float32Array([0, 0.5, -0.5, 0])], 44100));
  assert.equal(wav.byteLength, 44 + 4 * 2 * 2);
  assert.equal(String.fromCharCode(wav.getUint8(0), wav.getUint8(1), wav.getUint8(2), wav.getUint8(3)), "RIFF");
  assert.equal(wav.getUint16(22, true), 2);
  assert.equal(wav.getUint32(24, true), 44100);
  assert.equal(wav.getInt16(44 + 4, true), 0x7fff);
  assert.equal(wav.getInt16(44 + 8, true), -0x8000);
  assert.equal(wav.getInt16(44 + 12, true), 0x7fff, "範囲外の値は上限に丸める");
});

/** テスト用の小さな MIDI ファイルを組み立てる */
function buildMidi(tracks: number[][]): Uint8Array {
  const bytes: number[] = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks.length, 0, 96];
  for (const track of tracks) {
    bytes.push(0x4d, 0x54, 0x72, 0x6b, (track.length >>> 24) & 255, (track.length >>> 16) & 255, (track.length >>> 8) & 255, track.length & 255, ...track);
  }
  return Uint8Array.from(bytes);
}

test("parseMidi はテンポ・メロディ・ドラムを読み分ける", () => {
  const tempo = [0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20, 0, 0xff, 0x2f, 0]; // 120 BPM
  const melody: number[] = [];
  for (let i = 0; i < 8; i++) melody.push(0, 0x90, 72 + i, 100, 96, 0x80, 72 + i, 0);
  melody.push(0, 0xff, 0x2f, 0);
  // 低いパート(ランニングステータスと、ベロシティ0のノートオフを使う)
  const low: number[] = [0, 0x91, 40, 90];
  for (let i = 0; i < 9; i++) low.push(48, 40, 0, 0, 40, 90);
  low.push(48, 40, 0, 0, 0xff, 0x2f, 0);
  const drums = [0, 0x99, 36, 110, 24, 0x89, 36, 0, 72, 0x99, 38, 100, 24, 0x89, 38, 0, 0, 0xff, 0x2f, 0];
  const song = parseMidi(buildMidi([tempo, melody, low, drums]), "test.mid");
  assert.equal(song.bpm, 120);
  assert.equal(song.melody.length, 8);
  assert.deepEqual(song.melody.map((n) => n.midi), [72, 73, 74, 75, 76, 77, 78, 79]);
  assert.equal(song.melody[1].time, 1);
  assert.equal(song.bass.length, 10);
  assert.deepEqual(song.drums.map((d) => [d.kind, d.time]), [["kick", 0], ["snare", 1]]);
  assert.equal(song.beats, 10);
});

test("parseMidi は MIDI でないデータや空のデータを断る", () => {
  assert.throws(() => parseMidi(new Uint8Array([1, 2, 3])), /MIDI ファイルではない/);
  assert.throws(() => parseMidi(buildMidi([[0, 0xff, 0x2f, 0]])), /音符が見つかりません/);
});
