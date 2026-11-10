import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Channel Deck",
    short_name: "Channel Deck",
    description: "YouTube チャンネルの分析とトレンド確認",
    start_url: "/",
    display: "standalone",
    background_color: "#f9f9f7",
    theme_color: "#f9f9f7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
