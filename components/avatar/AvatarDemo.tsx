"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Portrait, type Mouth } from "./Portrait";

/** 見本用の台本。text は字幕と読み上げ、kana は口の動きに使う読み */
const LINES: { id: string; label: string; text: string; kana: string }[] = [
  {
    id: "intro",
    label: "自己紹介",
    text: "はじめまして、紬です。あなたの考えごとの壁打ち相手を務めます。まとまっていなくても大丈夫。思いついたことから、そのまま話してみてください。",
    kana: "はじめまして、つむぎです。あなたのかんがえごとのかべうちあいてをつとめます。まとまっていなくてもだいじょうぶ。おもいついたことから、そのままはなしてみてください。",
  },
  {
    id: "sparring",
    label: "壁打ちの例",
    text: "ショート動画を伸ばしたい、ということですね。まず確認させてください。伸ばしたいのは再生数ですか、それとも登録者ですか。目的によって、最初の三秒で見せるべきものが変わります。",
    kana: "しょーとどうがをのばしたい、ということですね。まずかくにんさせてください。のばしたいのはさいせいすうですか、それともとうろくしゃですか。もくてきによって、さいしょのさんびょうでみせるべきものがかわります。",
  },
  {
    id: "push",
    label: "辛口モード",
    text: "正直に言いますね。その企画、タイトルを聞いただけでは見たい理由が伝わってきません。誰の、どんな悩みに効く動画なのか。一文で言えるところまで、一緒に削りましょう。",
    kana: "しょうじきにいいますね。そのきかく、たいとるをきいただけではみたいりゆうがつたわってきません。だれの、どんななやみにきくどうがなのか。いちぶんでいえるところまで、いっしょにけずりましょう。",
  },
];

const A: Mouth = { open: 1, wide: 0.25 };
const I: Mouth = { open: 0.28, wide: 1 };
const U: Mouth = { open: 0.3, wide: -1 };
const E: Mouth = { open: 0.55, wide: 0.65 };
const O: Mouth = { open: 0.75, wide: -0.7 };
const CLOSED: Mouth = { open: 0, wide: 0.15 };
const HALF: Mouth = { open: 0.12, wide: 0 };

const ROWS: [string, Mouth][] = [
  ["あかさたなはまやらわがざだばぱゃぁ", A],
  ["いきしちにひみりぎじぢびぴぃ", I],
  ["うくすつぬふむゆるぐずづぶぷゅぅ", U],
  ["えけせてねへめれげぜでべぺぇ", E],
  ["おこそとのほもよろをごぞどぼぽょぉ", O],
];

const PAUSE_CHARS = "、。!?!? ";

type Step = { mouth: Mouth; beats: number };

/** かなの読みを、口の形の並びに変える(1拍ずつ) */
export function toSteps(kana: string): Step[] {
  const steps: Step[] = [];
  for (const ch of kana) {
    if (PAUSE_CHARS.includes(ch)) {
      steps.push({ mouth: CLOSED, beats: ch === "、" ? 1.6 : 3 });
      continue;
    }
    if (ch === "ん") {
      steps.push({ mouth: HALF, beats: 1 });
      continue;
    }
    if (ch === "っ") {
      steps.push({ mouth: CLOSED, beats: 1 });
      continue;
    }
    if (ch === "ー") {
      const prev = steps[steps.length - 1];
      if (prev) prev.beats += 1;
      continue;
    }
    const row = ROWS.find(([chars]) => chars.includes(ch));
    if (!row) continue;
    // 小さい「ゃゅょ」は前の音とまとめて1拍にする
    if ("ゃゅょぁぃぅぇぉ".includes(ch) && steps.length > 0) {
      steps[steps.length - 1] = { mouth: row[1], beats: 1 };
      continue;
    }
    // ま行・ば行・ぱ行は、いったん唇を閉じてから開く
    steps.push({ mouth: row[1], beats: 1 });
  }
  return steps;
}

const BEAT_MS = 128;

export function AvatarDemo() {
  const mouthTarget = useRef<Mouth>(CLOSED);
  const [speaking, setSpeaking] = useState(false);
  const [caption, setCaption] = useState("下のボタンを押すと話します。");
  const [voiceNote, setVoiceNote] = useState("");
  const timer = useRef<number | null>(null);
  const runId = useRef(0);

  const stop = useCallback(() => {
    runId.current += 1;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    mouthTarget.current = CLOSED;
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  const speak = useCallback(
    (line: (typeof LINES)[number]) => {
      stop();
      const id = runId.current;
      const steps = toSteps(line.kana);
      setCaption(line.text);
      setSpeaking(true);

      let index = 0;
      let rate = 1;
      const advance = () => {
        if (runId.current !== id) return;
        if (index >= steps.length) {
          mouthTarget.current = CLOSED;
          return;
        }
        const step = steps[index++];
        mouthTarget.current = step.mouth;
        timer.current = window.setTimeout(advance, (step.beats * BEAT_MS) / rate);
      };
      const finish = () => {
        if (runId.current !== id) return;
        if (timer.current !== null) window.clearTimeout(timer.current);
        mouthTarget.current = CLOSED;
        setSpeaking(false);
      };

      const synth = typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
      const voices = synth?.getVoices().filter((v) => v.lang.toLowerCase().startsWith("ja")) ?? [];
      if (!synth || voices.length === 0) {
        // 日本語の読み上げ音声が無い端末では、口の動きと字幕だけで再生する
        setVoiceNote("この端末には日本語の読み上げ音声が見つからないため、口の動きと字幕だけで再生しています。");
        advance();
        const total = steps.reduce((sum, s) => sum + s.beats, 0) * BEAT_MS;
        window.setTimeout(finish, total + 300);
        return;
      }

      const female = voices.find((v) => /kyoko|nanami|haruka|ayumi|sayaka|o-ren|female|女性/i.test(v.name));
      const utterance = new SpeechSynthesisUtterance(line.text);
      utterance.voice = female ?? voices[0];
      utterance.lang = "ja-JP";
      utterance.rate = 1;
      utterance.pitch = 1.08;
      setVoiceNote(`読み上げ: ${utterance.voice.name}(端末に入っている音声)`);
      utterance.onstart = advance;
      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance);
    },
    [stop],
  );

  return (
    <main className="avatar-page">
      <div className="avatar-stage">
        <div className="avatar-frame">
          <Portrait mouthTarget={mouthTarget} speaking={speaking} />
          <div className="avatar-name">
            <b>紬</b>
            <span>TSUMUGI</span>
            <i className={speaking ? "live on" : "live"}>{speaking ? "SPEAKING" : "STANDBY"}</i>
          </div>
        </div>
        <p className="avatar-caption" aria-live="polite">
          {caption}
        </p>
      </div>

      <div className="avatar-controls">
        {LINES.map((line) => (
          <button key={line.id} type="button" className="btn primary" onClick={() => speak(line)}>
            {line.label}
          </button>
        ))}
        <button type="button" className="btn" onClick={stop} disabled={!speaking}>
          止める
        </button>
      </div>
      <p className="sub avatar-note">
        {voiceNote || "声は端末に入っている読み上げ音声を使います。"}
        <br />
        試作版: 絵と動きはすべてコードで描いています。台本は固定で、まだ会話はできません。
      </p>
    </main>
  );
}
