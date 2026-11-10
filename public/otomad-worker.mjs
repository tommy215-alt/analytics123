// 音声分離(声と伴奏を分ける)を、画面を止めないように別スレッドで行う。
// モデルは Demucs(htdemucs)。初回だけ約180MBをダウンロードし、以後はブラウザに保存したものを使う。
import * as ort from "/ort/ort.wasm.min.mjs";
import { CONSTANTS, DemucsProcessor } from "/ort/demucs/index.js";

const MODEL_URL = CONSTANTS.DEFAULT_MODEL_URL;
const CACHE_NAME = "otomad-model-v1";

ort.env.wasm.wasmPaths = "/ort/";
// 複数スレッドは、ページが「クロスオリジン分離」されているときだけ使える
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 1;

let processor = null;
let currentId = 0;

const post = (message, transfer) => self.postMessage({ id: currentId, ...message }, transfer ?? []);

async function modelBytes() {
  let cache = null;
  try {
    cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(MODEL_URL);
    if (hit) {
      post({ type: "status", text: "保存済みのモデルを読み込んでいます…" });
      return await hit.arrayBuffer();
    }
  } catch {
    cache = null; // 保存領域が使えない環境では、毎回ダウンロードする
  }

  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) throw new Error(`モデルをダウンロードできませんでした(${response.status})`);
  const total = Number(response.headers.get("Content-Length")) || 180_000_000;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    post({ type: "download", loaded, total });
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  if (cache) {
    try {
      await cache.put(MODEL_URL, new Response(new Blob([bytes]), { headers: { "Content-Type": "application/octet-stream" } }));
    } catch {
      // 容量不足などで保存できなくても、今回の処理は続ける
    }
  }
  return bytes.buffer;
}

async function ensureProcessor() {
  if (processor) return processor;
  const next = new DemucsProcessor({
    ort,
    sessionOptions: { executionProviders: ["wasm"], graphOptimizationLevel: "all" },
    onProgress: ({ progress, currentSegment, totalSegments }) => post({ type: "progress", value: progress, currentSegment, totalSegments }),
  });
  const bytes = await modelBytes();
  post({ type: "status", text: "モデルを準備しています…" });
  await next.loadModel(bytes);
  processor = next;
  return processor;
}

self.onmessage = async (event) => {
  const { id, left, right } = event.data;
  currentId = id;
  try {
    const active = await ensureProcessor();
    post({ type: "status", text: "声と伴奏を分けています…" });
    post({ type: "progress", value: 0, currentSegment: 0, totalSegments: 0 });
    const result = await active.separate(left, right);
    const stems = {};
    const transfer = [];
    for (const name of CONSTANTS.TRACKS) {
      stems[name] = result[name];
      transfer.push(result[name].left.buffer, result[name].right.buffer);
    }
    post({ type: "done", stems, threads: ort.env.wasm.numThreads }, transfer);
  } catch (error) {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
