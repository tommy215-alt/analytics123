import { parseIsoDuration } from "./format.ts";
import { googleGet } from "./google.ts";
import type { Account, ChannelSummary, RefChannel, Video } from "./types.ts";

const API = "https://www.googleapis.com/youtube/v3";

const MIN = 60;
const TTL = {
  channel: 10 * MIN,
  uploads: 10 * MIN,
  videos: 15 * MIN,
  popular: 30 * MIN,
  // search は1回で利用枠を100消費するので長めに使い回す
  search: 60 * MIN,
};

type Thumbs = Record<string, { url: string } | undefined> | undefined;

function pickThumb(t: Thumbs): string {
  return t?.medium?.url ?? t?.high?.url ?? t?.default?.url ?? "";
}

type VideoItem = {
  id: string;
  snippet?: {
    title?: string;
    channelId?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: Thumbs;
    tags?: string[];
    categoryId?: string;
    liveBroadcastContent?: string;
  };
  statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
  contentDetails?: { duration?: string };
  liveStreamingDetails?: unknown;
};

const toNumber = (v: string | undefined): number | null => (v === undefined ? null : Number(v));

export function toVideo(item: VideoItem): Video {
  return {
    id: item.id,
    title: item.snippet?.title ?? "(タイトルなし)",
    channelId: item.snippet?.channelId ?? "",
    channelTitle: item.snippet?.channelTitle ?? "",
    publishedAt: item.snippet?.publishedAt ?? "",
    thumbnail: pickThumb(item.snippet?.thumbnails),
    durationSec: parseIsoDuration(item.contentDetails?.duration),
    views: Number(item.statistics?.viewCount ?? 0),
    likes: toNumber(item.statistics?.likeCount),
    comments: toNumber(item.statistics?.commentCount),
    tags: item.snippet?.tags ?? [],
    categoryId: item.snippet?.categoryId,
    isLive: Boolean(item.liveStreamingDetails) || (item.snippet?.liveBroadcastContent ?? "none") !== "none",
  };
}

type ChannelItem = {
  id: string;
  snippet?: { title?: string; customUrl?: string; thumbnails?: Thumbs };
  statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
};

function toChannelSummary(item: ChannelItem): ChannelSummary {
  return {
    channelId: item.id,
    title: item.snippet?.title ?? "(名前なし)",
    handle: item.snippet?.customUrl,
    thumbnail: pickThumb(item.snippet?.thumbnails) || undefined,
    subscribers: item.statistics?.hiddenSubscriberCount ? null : toNumber(item.statistics?.subscriberCount),
    totalViews: Number(item.statistics?.viewCount ?? 0),
    videoCount: Number(item.statistics?.videoCount ?? 0),
  };
}

export async function getOwnChannel(account: Account): Promise<ChannelSummary> {
  const data = await googleGet<{ items?: ChannelItem[] }>(
    account,
    `${API}/channels?part=snippet,statistics&id=${encodeURIComponent(account.channelId)}`,
    TTL.channel,
  );
  const item = data.items?.[0];
  if (!item) throw new Error("チャンネル情報を取得できませんでした。");
  return toChannelSummary(item);
}

export async function getVideosByIds(account: Account, ids: string[]): Promise<Video[]> {
  const videos: Video[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await googleGet<{ items?: VideoItem[] }>(
      account,
      `${API}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&maxResults=50&id=${chunk.join(",")}`,
      TTL.videos,
    );
    videos.push(...(data.items ?? []).map(toVideo));
  }
  // API は指定順で返すとは限らないので、渡した順に並べ直す
  const order = new Map(ids.map((id, i) => [id, i]));
  return videos.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** チャンネルIDから「アップロード動画」再生リストのIDを作る(UC… → UU…) */
export function uploadsPlaylistId(channelId: string): string {
  return channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : channelId;
}

/** あるチャンネルの新しい順のアップロード動画(最大 max 本) */
export async function getChannelUploads(account: Account, channelId: string, max = 50): Promise<Video[]> {
  const ids: string[] = [];
  let pageToken = "";
  while (ids.length < max) {
    const data = await googleGet<{
      items?: { contentDetails?: { videoId?: string } }[];
      nextPageToken?: string;
    }>(
      account,
      `${API}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploadsPlaylistId(channelId)}` +
        (pageToken ? `&pageToken=${pageToken}` : ""),
      TTL.uploads,
    );
    for (const item of data.items ?? []) {
      if (item.contentDetails?.videoId) ids.push(item.contentDetails.videoId);
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return getVideosByIds(account, ids.slice(0, max));
}

/** 国内の急上昇(YouTube が選ぶ人気動画チャート) */
export async function getMostPopular(account: Account, categoryId?: string): Promise<Video[]> {
  const data = await googleGet<{ items?: VideoItem[] }>(
    account,
    `${API}/videos?part=snippet,statistics,contentDetails,liveStreamingDetails&chart=mostPopular&regionCode=JP&hl=ja&maxResults=50` +
      (categoryId ? `&videoCategoryId=${encodeURIComponent(categoryId)}` : ""),
    TTL.popular,
  );
  return (data.items ?? []).map(toVideo);
}

export type SearchOptions = {
  query: string;
  days: number;
  /** short = 4分未満 / long = 20分超 / medium = その間 */
  length: "any" | "short" | "medium" | "long";
};

/** 期間内に公開された動画を再生数の多い順に探す */
export async function searchTopVideos(account: Account, options: SearchOptions, now = new Date()): Promise<Video[]> {
  // キャッシュが効くように、検索の起点は「時」単位に丸める
  const after = new Date(now.getTime() - options.days * 86400_000);
  after.setUTCMinutes(0, 0, 0);
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    order: "viewCount",
    regionCode: "JP",
    relevanceLanguage: "ja",
    maxResults: "50",
    publishedAfter: after.toISOString(),
  });
  if (options.query) params.set("q", options.query);
  if (options.length !== "any") params.set("videoDuration", options.length);
  const data = await googleGet<{ items?: { id?: { videoId?: string } }[] }>(account, `${API}/search?${params}`, TTL.search);
  const ids = (data.items ?? []).map((i) => i.id?.videoId).filter((id): id is string => Boolean(id));
  return getVideosByIds(account, ids);
}

/** 入力(チャンネルID / @ハンドル / URL / 名前)からチャンネルを探す */
export async function findChannel(account: Account, input: string): Promise<RefChannel | null> {
  const text = input.trim();
  if (!text) return null;

  let filter: string | null = null;
  const idMatch = /(UC[\w-]{22})/.exec(text);
  const handleMatch = /@([\w.\-぀-ヿ一-鿿]+)/.exec(decodeURIComponent(text));
  if (idMatch) filter = `id=${idMatch[1]}`;
  else if (handleMatch) filter = `forHandle=${encodeURIComponent(`@${handleMatch[1]}`)}`;

  if (!filter) {
    // 名前での検索(利用枠を100消費する)
    const found = await googleGet<{ items?: { id?: { channelId?: string } }[] }>(
      account,
      `${API}/search?part=snippet&type=channel&maxResults=1&q=${encodeURIComponent(text)}`,
      TTL.search,
    );
    const channelId = found.items?.[0]?.id?.channelId;
    if (!channelId) return null;
    filter = `id=${channelId}`;
  }

  const data = await googleGet<{ items?: ChannelItem[] }>(account, `${API}/channels?part=snippet,statistics&${filter}`, TTL.channel);
  const item = data.items?.[0];
  if (!item) return null;
  const summary = toChannelSummary(item);
  return { channelId: summary.channelId, title: summary.title, handle: summary.handle, thumbnail: summary.thumbnail };
}

export const CATEGORIES: { id: string; label: string }[] = [
  { id: "", label: "すべて" },
  { id: "10", label: "音楽" },
  { id: "20", label: "ゲーム" },
  { id: "24", label: "エンタメ" },
  { id: "23", label: "コメディ" },
  { id: "22", label: "ブログ" },
  { id: "26", label: "ハウツー" },
  { id: "27", label: "教育" },
  { id: "28", label: "科学と技術" },
  { id: "17", label: "スポーツ" },
  { id: "25", label: "ニュース" },
  { id: "1", label: "映画とアニメ" },
  { id: "15", label: "ペット" },
  { id: "2", label: "自動車" },
];
