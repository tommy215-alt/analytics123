import type { Video } from "./types.ts";

/**
 * ショートかどうかは API に正式な項目が無いため、長さで推定する。
 * (ショートは最長3分。3分以下の横長動画も含まれてしまう点に注意)
 */
export const SHORT_MAX_SEC = 180;

export function isShort(video: Pick<Video, "durationSec" | "isLive">): boolean {
  return !video.isLive && video.durationSec > 0 && video.durationSec <= SHORT_MAX_SEC;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** 公開からの1時間あたり再生数(勢いの目安) */
export function viewsPerHour(video: Pick<Video, "views" | "publishedAt">, now = Date.now()): number {
  const hours = Math.max(1, (now - new Date(video.publishedAt).getTime()) / 3600_000);
  return video.views / hours;
}

/** 公開からの1日あたり再生数 */
export function viewsPerDay(video: Pick<Video, "views" | "publishedAt">, now = Date.now()): number {
  return viewsPerHour(video, now) * 24;
}

const STOP_WORDS = new Set([
  "こと", "これ", "それ", "あれ", "ため", "よう", "さん", "ちゃん", "くん", "もの", "ところ", "する", "した", "して",
  "ます", "です", "ない", "から", "まで", "という", "って", "ので", "のに", "the", "and", "for", "with", "you", "feat", "official",
  "video", "shorts", "short", "動画", "公式",
]);

const segmenter = new Intl.Segmenter("ja", { granularity: "word" });

/** タイトルを単語に分ける(1文字の語、数字だけの語、ありふれた語は除く) */
export function titleWords(title: string): string[] {
  const words = new Set<string>();
  for (const part of segmenter.segment(title.replace(/#[^\s#]+/g, " "))) {
    if (!part.isWordLike) continue;
    const word = part.segment.toLowerCase();
    if ([...word].length < 2) continue;
    if (/^[\d０-９.,]+$/.test(word)) continue;
    if (/^[ぁ-ん]{1,2}$/.test(word)) continue;
    if (STOP_WORDS.has(word)) continue;
    words.add(word);
  }
  return [...words];
}

export type Count = { label: string; count: number };

function topCounts(items: string[], limit: number, min = 2): Count[] {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ja"))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** 日本時間での公開時刻(時)と曜日 */
export function jstParts(iso: string): { hour: number; weekday: number } {
  const jst = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return { hour: jst.getUTCHours(), weekday: jst.getUTCDay() };
}

export type TrendInsights = {
  count: number;
  medianViews: number;
  medianViewsPerHour: number;
  shortShare: number;
  medianLongSec: number;
  medianShortSec: number;
  /** 公開が多い時間帯(3時間刻み、日本時間)の上位 */
  timeSlots: Count[];
  weekdays: Count[];
  avgTitleLength: number;
  titlePatterns: { label: string; share: number }[];
  words: Count[];
  tags: Count[];
};

export function analyzeVideos(videos: Video[], now = Date.now()): TrendInsights {
  const count = videos.length;
  const shorts = videos.filter((v) => isShort(v));
  const longs = videos.filter((v) => !isShort(v) && v.durationSec > 0);
  const share = (test: (title: string) => boolean): number =>
    count === 0 ? 0 : videos.filter((v) => test(v.title)).length / count;

  const slots: string[] = [];
  const days: string[] = [];
  for (const v of videos) {
    if (!v.publishedAt) continue;
    const { hour, weekday } = jstParts(v.publishedAt);
    const start = Math.floor(hour / 3) * 3;
    slots.push(`${start}–${start + 3}時`);
    days.push(`${WEEKDAYS[weekday]}曜`);
  }

  return {
    count,
    medianViews: median(videos.map((v) => v.views)),
    medianViewsPerHour: median(videos.map((v) => viewsPerHour(v, now))),
    shortShare: count === 0 ? 0 : shorts.length / count,
    medianLongSec: median(longs.map((v) => v.durationSec)),
    medianShortSec: median(shorts.map((v) => v.durationSec)),
    timeSlots: topCounts(slots, 3, 1),
    weekdays: topCounts(days, 3, 1),
    avgTitleLength: count === 0 ? 0 : videos.reduce((sum, v) => sum + [...v.title].length, 0) / count,
    titlePatterns: [
      { label: "【】で強調", share: share((t) => /【.+?】/.test(t)) },
      { label: "数字入り", share: share((t) => /[\d０-９]/.test(t)) },
      { label: "！や？で終わる・含む", share: share((t) => /[!?！？]/.test(t)) },
      { label: "#ハッシュタグ入り", share: share((t) => /#[^\s#]+/.test(t)) },
    ],
    words: topCounts(videos.flatMap((v) => titleWords(v.title)), 12),
    tags: topCounts(videos.flatMap((v) => [...new Set(v.tags.map((t) => t.toLowerCase()))]), 12),
  };
}

export type VideoSort = "new" | "views" | "momentum" | "likeRate";
export type VideoKind = "all" | "long" | "short";

export function likeRate(video: Pick<Video, "likes" | "views">): number {
  return video.likes === null || video.views === 0 ? 0 : video.likes / video.views;
}

export function filterAndSort(videos: Video[], kind: VideoKind, sort: VideoSort, now = Date.now()): Video[] {
  const filtered = videos.filter((v) => (kind === "all" ? true : kind === "short" ? isShort(v) : !isShort(v)));
  const by: Record<VideoSort, (a: Video, b: Video) => number> = {
    new: (a, b) => b.publishedAt.localeCompare(a.publishedAt),
    views: (a, b) => b.views - a.views,
    momentum: (a, b) => viewsPerHour(b, now) - viewsPerHour(a, now),
    likeRate: (a, b) => likeRate(b) - likeRate(a),
  };
  return filtered.sort(by[sort]);
}
