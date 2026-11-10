import type { DateRange } from "./format.ts";
import { googleGet } from "./google.ts";
import type { Account, DailyPoint, Demographics, NamedValue, TopVideoRow, Totals } from "./types.ts";

const API = "https://youtubeanalytics.googleapis.com/v2/reports";
const TTL = 15 * 60;

type Report = {
  columnHeaders?: { name: string }[];
  rows?: (string | number)[][];
};

type Row = Record<string, string | number>;

async function report(account: Account, range: DateRange, params: Record<string, string>): Promise<Row[]> {
  const query = new URLSearchParams({
    ids: "channel==MINE",
    startDate: range.start,
    endDate: range.end,
    ...params,
  });
  const data = await googleGet<Report>(account, `${API}?${query}`, TTL);
  const names = (data.columnHeaders ?? []).map((h) => h.name);
  return (data.rows ?? []).map((row) => Object.fromEntries(names.map((name, i) => [name, row[i]])));
}

const n = (v: string | number | undefined): number => Number(v ?? 0) || 0;

const CORE_METRICS = "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes,comments,shares";

export async function getTotals(account: Account, range: DateRange): Promise<Totals> {
  const [row] = await report(account, range, { metrics: CORE_METRICS });
  return {
    views: n(row?.views),
    minutes: n(row?.estimatedMinutesWatched),
    avgViewDurationSec: n(row?.averageViewDuration),
    subsGained: n(row?.subscribersGained),
    subsLost: n(row?.subscribersLost),
    likes: n(row?.likes),
    comments: n(row?.comments),
    shares: n(row?.shares),
  };
}

export async function getDaily(account: Account, range: DateRange): Promise<DailyPoint[]> {
  const rows = await report(account, range, {
    dimensions: "day",
    metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,subscribersLost,likes",
    sort: "day",
  });
  return rows.map((r) => ({
    date: String(r.day),
    views: n(r.views),
    minutes: n(r.estimatedMinutesWatched),
    subsGained: n(r.subscribersGained),
    subsLost: n(r.subscribersLost),
    likes: n(r.likes),
    avgViewDurationSec: n(r.averageViewDuration),
  }));
}

export async function getTopVideos(account: Account, range: DateRange, max = 10): Promise<TopVideoRow[]> {
  const rows = await report(account, range, {
    dimensions: "video",
    metrics: "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained",
    sort: "-views",
    maxResults: String(max),
  });
  return rows.map((r) => ({
    videoId: String(r.video),
    views: n(r.views),
    minutes: n(r.estimatedMinutesWatched),
    avgViewDurationSec: n(r.averageViewDuration),
    avgViewPercentage: n(r.averageViewPercentage),
    subsGained: n(r.subscribersGained),
  }));
}

const TRAFFIC_LABELS: Record<string, string> = {
  ADVERTISING: "YouTube 広告",
  ANNOTATION: "カード・アノテーション",
  CAMPAIGN_CARD: "キャンペーンカード",
  END_SCREEN: "終了画面",
  EXT_URL: "外部サイト",
  HASHTAGS: "ハッシュタグ",
  LIVE_REDIRECT: "ライブリダイレクト",
  NO_LINK_EMBEDDED: "埋め込み(参照元不明)",
  NO_LINK_OTHER: "直接・不明",
  NOTIFICATION: "通知",
  PLAYLIST: "再生リスト",
  PROMOTED: "プロモーション",
  RELATED_VIDEO: "関連動画",
  SHORTS: "ショートフィード",
  SOUND_PAGE: "サウンドページ",
  SUBSCRIBER: "ブラウジング(ホーム等)",
  VIDEO_REMIXES: "リミックス",
  YT_CHANNEL: "チャンネルページ",
  YT_OTHER_PAGE: "その他の YouTube 機能",
  YT_PLAYLIST_PAGE: "再生リストページ",
  YT_SEARCH: "YouTube 検索",
};

export async function getTrafficSources(account: Account, range: DateRange): Promise<NamedValue[]> {
  const rows = await report(account, range, {
    dimensions: "insightTrafficSourceType",
    metrics: "views",
    sort: "-views",
  });
  return rows
    .map((r) => {
      const key = String(r.insightTrafficSourceType);
      return { key, label: TRAFFIC_LABELS[key] ?? key, value: n(r.views) };
    })
    .filter((r) => r.value > 0);
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  videoOnDemand: "長尺動画",
  VIDEO_ON_DEMAND: "長尺動画",
  shorts: "ショート",
  SHORTS: "ショート",
  liveStream: "ライブ配信",
  LIVE_STREAM: "ライブ配信",
  story: "ストーリー",
  STORY: "ストーリー",
};

/** 長尺・ショート・ライブ別の視聴回数(YouTube 側の正式な区分) */
export async function getContentTypes(account: Account, range: DateRange): Promise<NamedValue[]> {
  const rows = await report(account, range, {
    dimensions: "creatorContentType",
    metrics: "views",
  });
  return rows
    .map((r) => {
      const key = String(r.creatorContentType);
      return { key, label: CONTENT_TYPE_LABELS[key] ?? key, value: n(r.views) };
    })
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
}

const AGE_ORDER = ["age13-17", "age18-24", "age25-34", "age35-44", "age45-54", "age55-64", "age65-"];
const GENDER_LABELS: Record<string, string> = { female: "女性", male: "男性", user_specified: "その他" };

export async function getDemographics(account: Account, range: DateRange): Promise<Demographics> {
  const rows = await report(account, range, {
    dimensions: "ageGroup,gender",
    metrics: "viewerPercentage",
  });
  const ages = new Map<string, number>();
  const genders = new Map<string, number>();
  for (const r of rows) {
    const value = n(r.viewerPercentage);
    ages.set(String(r.ageGroup), (ages.get(String(r.ageGroup)) ?? 0) + value);
    genders.set(String(r.gender), (genders.get(String(r.gender)) ?? 0) + value);
  }
  return {
    ages: AGE_ORDER.filter((key) => ages.has(key)).map((key) => ({
      key,
      label: key === "age65-" ? "65歳以上" : `${key.replace("age", "").replace("-", "–")}歳`,
      value: ages.get(key) ?? 0,
    })),
    genders: [...genders.entries()]
      .map(([key, value]) => ({ key, label: GENDER_LABELS[key] ?? key, value }))
      .sort((a, b) => b.value - a.value),
  };
}

const regionNames = new Intl.DisplayNames(["ja"], { type: "region" });

function countryLabel(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** 視聴回数の多い国 */
export async function getCountries(account: Account, range: DateRange, max = 6): Promise<NamedValue[]> {
  const rows = await report(account, range, {
    dimensions: "country",
    metrics: "views",
    sort: "-views",
    maxResults: String(max),
  });
  return rows.map((r) => ({ key: String(r.country), label: countryLabel(String(r.country)), value: n(r.views) })).filter((r) => r.value > 0);
}

const DEVICE_LABELS: Record<string, string> = {
  MOBILE: "スマホ",
  DESKTOP: "パソコン",
  TABLET: "タブレット",
  TV: "テレビ",
  GAME_CONSOLE: "ゲーム機",
  UNKNOWN_PLATFORM: "不明",
};

/** 視聴に使われた機器 */
export async function getDevices(account: Account, range: DateRange): Promise<NamedValue[]> {
  const rows = await report(account, range, {
    dimensions: "deviceType",
    metrics: "views",
    sort: "-views",
  });
  return rows
    .map((r) => {
      const key = String(r.deviceType);
      return { key, label: DEVICE_LABELS[key] ?? key, value: n(r.views) };
    })
    .filter((r) => r.value > 0);
}

/** 推定収益(円)。収益化していないチャンネルでは取得できずエラーになる。 */
export async function getRevenue(account: Account, range: DateRange): Promise<number> {
  const [row] = await report(account, range, { metrics: "estimatedRevenue", currency: "JPY" });
  return n(row?.estimatedRevenue);
}
