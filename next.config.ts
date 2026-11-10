import type { NextConfig } from "next";

// 音声分離を複数スレッドで動かすには、ページを「クロスオリジン分離」する必要がある。
// 対象は音MADメーカーのページと、そこから読み込むスクリプトだけに絞る
// (全ページに付けると、YouTube のサムネイルなど外部の画像が表示できなくなる)。
const isolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];
const embeddable = [
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/otomad", headers: isolation },
      { source: "/otomad-worker.mjs", headers: embeddable },
      { source: "/ort/:path*", headers: embeddable },
    ];
  },
};

export default config;
