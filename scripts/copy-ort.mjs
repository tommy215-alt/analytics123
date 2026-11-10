// 音声分離に使う実行ファイルを、ブラウザから読める場所(public/ort)へコピーする。
// サイズが大きいのでリポジトリには入れず、ビルドのたびに node_modules から取り出す。
import { cpSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "public", "ort");
mkdirSync(join(out, "demucs"), { recursive: true });

const ortDist = join(root, "node_modules", "onnxruntime-web", "dist");
for (const file of ["ort.wasm.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  cpSync(join(ortDist, file), join(out, file));
}

const demucsSrc = join(root, "node_modules", "demucs-web", "src");
for (const file of readdirSync(demucsSrc)) {
  if (file.endsWith(".js")) cpSync(join(demucsSrc, file), join(out, "demucs", file));
}
console.log("copied separation runtime to public/ort");
