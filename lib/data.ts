import { unstable_cache } from "next/cache";
import * as analytics from "./analytics.ts";
import { isDemoMode } from "./config.ts";
import * as demo from "./demo.ts";
import { ranges, type DateRange } from "./format.ts";
import { isShort } from "./insights.ts";
import { getActiveId, listAccounts, listRefs } from "./store.ts";
import type { Account, AccountInfo, ChannelSummary, DailyPoint, Demographics, NamedValue, RefChannel, Result, TopVideoRow, Totals, Video } from "./types.ts";
import * as youtube from "./youtube.ts";

/** 画面を描くのに必要な「いま誰のデータを見ているか」 */
export type Context = {
  demo: boolean;
  accounts: AccountInfo[];
  active: AccountInfo | null;
  /** 実データ取得用(デモモードでは null) */
  account: Account | null;
};

const toInfo = ({ refreshToken: _omit, ...info }: Account): AccountInfo => info;

export async function getContext(): Promise<Context> {
  const activeId = await getActiveId();
  if (isDemoMode()) {
    const accounts = demo.DEMO_ACCOUNTS;
    return { demo: true, accounts, active: accounts.find((a) => a.channelId === activeId) ?? accounts[0], account: null };
  }
  const full = await listAccounts();
  const account = full.find((a) => a.channelId === activeId) ?? full[0] ?? null;
  return { demo: false, accounts: full.map(toInfo), active: account ? toInfo(account) : null, account };
}

async function safe<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "取得に失敗しました。" };
  }
}

const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export type Dashboard = {
  range: DateRange;
  channel: Result<ChannelSummary>;
  totals: Result<{ current: Totals; previous: Totals }>;
  daily: Result<DailyPoint[]>;
  topVideos: Result<{ row: TopVideoRow; video: Video | null }[]>;
  traffic: Result<NamedValue[]>;
  contentTypes: Result<NamedValue[]>;
  demographics: Result<Demographics>;
  countries: Result<NamedValue[]>;
  devices: Result<NamedValue[]>;
  /** 新しい順の投稿(最新動画の初速を見るため) */
  uploads: Result<Video[]>;
  /** 収益化していない場合などは取得できない */
  revenue: Result<{ current: number; previous: number }>;
};

export async function loadDashboard(ctx: Context, days: number): Promise<Dashboard> {
  const { current, previous } = ranges(days);
  const info = ctx.active!;

  if (ctx.demo) {
    const top = demo.demoTopVideos(info, current);
    const byId = new Map(top.videos.map((v) => [v.id, v]));
    return {
      range: current,
      channel: ok(demo.demoChannel(info)),
      totals: ok({ current: demo.demoTotals(info, current), previous: demo.demoTotals(info, previous) }),
      daily: ok(demo.demoDaily(info, current)),
      topVideos: ok(top.rows.map((row) => ({ row, video: byId.get(row.videoId) ?? null }))),
      traffic: ok(demo.demoTraffic(info, current)),
      contentTypes: ok(demo.demoContentTypes(info, current)),
      demographics: ok(demo.demoDemographics()),
      countries: ok(demo.demoCountries(info, current)),
      devices: ok(demo.demoDevices(info, current)),
      uploads: ok(demo.demoUploads(info)),
      revenue: ok({ current: demo.demoRevenue(info, current), previous: demo.demoRevenue(info, previous) }),
    };
  }

  const account = ctx.account!;
  const [channel, totals, daily, topVideos, traffic, contentTypes, demographics, countries, devices, uploads, revenue] = await Promise.all([
    safe(() => youtube.getOwnChannel(account)),
    safe(async () => {
      const [cur, prev] = await Promise.all([analytics.getTotals(account, current), analytics.getTotals(account, previous)]);
      return { current: cur, previous: prev };
    }),
    safe(() => analytics.getDaily(account, current)),
    safe(async () => {
      const rows = await analytics.getTopVideos(account, current);
      const videos = rows.length ? await youtube.getVideosByIds(account, rows.map((r) => r.videoId)) : [];
      const byId = new Map(videos.map((v) => [v.id, v]));
      return rows.map((row) => ({ row, video: byId.get(row.videoId) ?? null }));
    }),
    safe(() => analytics.getTrafficSources(account, current)),
    safe(() => analytics.getContentTypes(account, current)),
    safe(() => analytics.getDemographics(account, current)),
    safe(() => analytics.getCountries(account, current)),
    safe(() => analytics.getDevices(account, current)),
    safe(() => youtube.getChannelUploads(account, account.channelId, 50)),
    safe(async () => {
      const [cur, prev] = await Promise.all([analytics.getRevenue(account, current), analytics.getRevenue(account, previous)]);
      return { current: cur, previous: prev };
    }),
  ]);
  return { range: current, channel, totals, daily, topVideos, traffic, contentTypes, demographics, countries, devices, uploads, revenue };
}

export function loadUploads(ctx: Context): Promise<Result<Video[]>> {
  if (ctx.demo) return Promise.resolve(ok(demo.demoUploads(ctx.active!)));
  return safe(() => youtube.getChannelUploads(ctx.account!, ctx.account!.channelId, 100));
}

// ---------- トレンド ----------

export type TrendFormat = "long" | "short";
export type TrendSource = "popular" | "ai" | "search";

export type TrendQuery = {
  source: TrendSource;
  region: string;
  format: TrendFormat;
  /** 急上昇のカテゴリ */
  categoryId: string;
  /** 何日以内に公開された動画か(急上昇の長尺では使わない) */
  days: number;
  /** キーワード検索の語 */
  query: string;
};

const HOUR = 3600;

/**
 * 公開情報の取得結果を1時間使い回す。
 * 検索は1回で API の利用枠を100消費するので、サーバーをまたいで残るキャッシュに置く。
 * (結果は誰の権限で取っても同じなので、キーにアカウントは含めない)
 */
function shared<T>(key: string[], fn: () => Promise<T>): Promise<T> {
  return unstable_cache(fn, ["trend-v1", ...key], { revalidate: HOUR })();
}

async function searchByFormat(account: Account, base: Omit<youtube.SearchOptions, "length">, format: TrendFormat): Promise<Video[]> {
  if (format === "short") {
    const videos = await youtube.searchTopVideos(account, { ...base, length: "short" });
    return videos.filter((v) => isShort(v));
  }
  // 長尺は「4〜20分」と「20分超」の2回に分けて探してまとめる
  const [medium, long] = await Promise.all([
    youtube.searchTopVideos(account, { ...base, length: "medium" }),
    youtube.searchTopVideos(account, { ...base, length: "long" }),
  ]);
  const seen = new Set<string>();
  return [...medium, ...long].filter((v) => !isShort(v) && !seen.has(v.id) && Boolean(seen.add(v.id))).sort((a, b) => b.views - a.views);
}

export function loadTrend(ctx: Context, q: TrendQuery): Promise<Result<Video[]>> {
  if (ctx.demo) {
    return Promise.resolve(
      ok(
        demo.demoTrendVideos(`${q.source}:${q.categoryId}:${q.query}`, {
          days: q.source === "popular" ? 5 : q.days,
          kind: q.format,
          region: q.region,
          ai: q.source === "ai",
        }),
      ),
    );
  }

  const account = ctx.account!;
  const categoryId = q.categoryId || undefined;

  if (q.source === "popular" && q.format === "long") {
    return safe(() =>
      shared(["popular", q.region, q.categoryId], async () => (await youtube.getMostPopular(account, q.region, categoryId)).filter((v) => !isShort(v))),
    );
  }
  if (q.source === "popular") {
    // 急上昇チャートにショートはほぼ載らないので、直近に公開された再生数の多いショートを探す
    return safe(() =>
      shared(["popular-short", q.region, q.categoryId, String(q.days)], () =>
        searchByFormat(account, { region: q.region, query: "", days: q.days, categoryId }, "short"),
      ),
    );
  }
  const query = q.source === "ai" ? youtube.aiQuery(q.region) : q.query;
  return safe(() =>
    shared([q.source, q.region, q.format, String(q.days), query], () => searchByFormat(account, { region: q.region, query, days: q.days }, q.format)),
  );
}

export async function loadRefs(ctx: Context): Promise<RefChannel[]> {
  return ctx.demo ? demo.DEMO_REFS : listRefs();
}

export function loadRefUploads(ctx: Context, ref: RefChannel): Promise<Result<Video[]>> {
  if (ctx.demo) return Promise.resolve(ok(demo.demoRefUploads(ref)));
  return safe(() => youtube.getChannelUploads(ctx.account!, ref.channelId, 50));
}
