/**
 * 声と伴奏を分ける処理の窓口。実際の計算は別スレッド(public/otomad-worker.mjs)で行う。
 * ブラウザでしか動かないので、画面のコードからだけ呼ぶこと。
 */

export type Stereo = { left: Float32Array; right: Float32Array };
export type Stems = { drums: Stereo; bass: Stereo; other: Stereo; vocals: Stereo };

export const SEPARATION_RATE = 44100;

/** 進み具合の表示用の文言を受け取る */
export type OnStatus = (text: string) => void;

let worker: Worker | null = null;
let nextId = 1;

/** AudioBuffer の一部を、分離モデルが受け付ける形(44.1kHz ステレオ)にする */
export async function toModelInput(buffer: AudioBuffer, startSec = 0, lengthSec = buffer.duration): Promise<Stereo> {
  const length = Math.max(0.1, Math.min(lengthSec, buffer.duration - startSec));
  const offline = new OfflineAudioContext(2, Math.ceil(length * SEPARATION_RATE), SEPARATION_RATE);
  const source = offline.createBufferSource();
  source.buffer = buffer;
  source.connect(offline.destination);
  source.start(0, startSec, length);
  const rendered = await offline.startRendering();
  return { left: rendered.getChannelData(0).slice(), right: rendered.getChannelData(1).slice() };
}

export function separate(input: Stereo, onStatus: OnStatus): Promise<Stems> {
  if (typeof Worker === "undefined") return Promise.reject(new Error("このブラウザでは音声の分離を実行できません。"));
  worker ??= new Worker("/otomad-worker.mjs", { type: "module" });
  const active = worker;
  const id = nextId++;
  // モデルは約7.8秒ずつ、少し重ねながら処理する。進み具合はその区切りの数から出す
  const expectedSegments = Math.max(1, Math.ceil(input.left.length / 257985));

  return new Promise<Stems>((resolve, reject) => {
    const fail = (message: string) => {
      active.removeEventListener("message", onMessage);
      active.removeEventListener("error", onError);
      // 途中で失敗したスレッドは状態が分からないので作り直す
      active.terminate();
      if (worker === active) worker = null;
      reject(new Error(message));
    };
    const onError = () => fail("音声の分離を開始できませんでした。ページを開き直して、もう一度お試しください。");
    const onMessage = (event: MessageEvent) => {
      const message = event.data as { id: number; type: string; text?: string; loaded?: number; total?: number; currentSegment?: number; stems?: Stems; message?: string };
      if (message.id !== id) return;
      if (message.type === "status" && message.text) onStatus(message.text);
      if (message.type === "download") {
        onStatus(`分離用のモデルをダウンロードしています…${Math.round(((message.loaded ?? 0) / (message.total ?? 1)) * 100)}%(初回のみ・約180MB)`);
      }
      if (message.type === "progress") {
        const percent = Math.min(100, Math.round(((message.currentSegment ?? 0) / expectedSegments) * 100));
        onStatus(`声と伴奏を分けています…${percent}%`);
      }
      if (message.type === "error") fail(message.message ?? "音声の分離に失敗しました。");
      if (message.type === "done" && message.stems) {
        active.removeEventListener("message", onMessage);
        active.removeEventListener("error", onError);
        resolve(message.stems);
      }
    };
    active.addEventListener("message", onMessage);
    active.addEventListener("error", onError);
    active.postMessage({ id, left: input.left, right: input.right }, [input.left.buffer, input.right.buffer]);
  });
}

/** 複数のパートを足し合わせる(例: ドラム以外の伴奏をまとめる) */
export function mixStems(parts: Stereo[]): Stereo {
  const length = parts[0]?.left.length ?? 0;
  const left = new Float32Array(length);
  const right = new Float32Array(length);
  for (const part of parts) {
    for (let i = 0; i < length; i++) {
      left[i] += part.left[i];
      right[i] += part.right[i];
    }
  }
  return { left, right };
}

export function toAudioBuffer(ctx: BaseAudioContext, stereo: Stereo): AudioBuffer {
  const buffer = ctx.createBuffer(2, stereo.left.length, SEPARATION_RATE);
  buffer.getChannelData(0).set(stereo.left);
  buffer.getChannelData(1).set(stereo.right);
  return buffer;
}

/** 音の大きさ(左右をまとめた RMS) */
export function level(stereo: Stereo): number {
  let sum = 0;
  for (let i = 0; i < stereo.left.length; i++) sum += stereo.left[i] * stereo.left[i] + stereo.right[i] * stereo.right[i];
  return Math.sqrt(sum / Math.max(1, stereo.left.length * 2));
}

/** 全体の音量に対して、歌声のパートがこの割合より小さければ「声は入っていない」とみなす */
export const MIN_VOCAL_SHARE = 0.05;

export function vocalShare(stems: Stems): number {
  const total = level(mixStems([stems.drums, stems.bass, stems.other, stems.vocals]));
  return total === 0 ? 0 : level(stems.vocals) / total;
}

export function toMono(stereo: Stereo): Float32Array {
  const mono = new Float32Array(stereo.left.length);
  for (let i = 0; i < mono.length; i++) mono[i] = (stereo.left[i] + stereo.right[i]) / 2;
  return mono;
}
