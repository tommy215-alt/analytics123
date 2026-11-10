import * as analytics from "./analytics.ts";
import { isDemoMode } from "./config.ts";
import * as demo from "./demo.ts";
import { ranges, type DateRange } from "./format.ts";
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

export type Dashboard = {
  range: DateRange;
  channel: Result<ChannelSummary>;
  totals: Result<{ current: Totals; previous: Totals }>;
  daily: Result<DailyPoint[]>;
  topVideos: Result<{ row: TopVideoRow; video: Video | null }[]>;
  traffic: Result<NamedValue[]>;
  contentTypes: Result<NamedValue[]>;
  demographics: Result<Demographics>;
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
      channel: { ok: true, data: demo.demoChannel(info) },
      totals: { ok: true, data: { current: demo.demoTotals(info, current), previous: demo.demoTotals(info, previous) } },
      daily: { ok: true, data: demo.demoDaily(info, current) },
      topVideos: { ok: true, data: top.rows.map((row) => ({ row, video: byId.get(row.videoId) ?? null })) },
      traffic: { ok: true, data: demo.demoTraffic(info, current) },
      contentTypes: { ok: true, data: demo.demoContentTypes(info, current) },
      demographics: { ok: true, data: demo.demoDemographics() },
      revenue: { ok: true, data: { current: demo.demoRevenue(info, current), previous: demo.demoRevenue(info, previous) } },
    };
  }

  const account = ctx.account!;
  const [channel, totals, daily, topVideos, traffic, contentTypes, demographics, revenue] = await Promise.all([
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
    safe(async () => {
      const [cur, prev] = await Promise.all([analytics.getRevenue(account, current), analytics.getRevenue(account, previous)]);
      return { current: cur, previous: prev };
    }),
  ]);
  return { range: current, channel, totals, daily, topVideos, traffic, contentTypes, demographics, revenue };
}

export function loadUploads(ctx: Context): Promise<Result<Video[]>> {
  if (ctx.demo) return Promise.resolve({ ok: true, data: demo.demoUploads(ctx.active!) });
  return safe(() => youtube.getChannelUploads(ctx.account!, ctx.account!.channelId, 100));
}

export function loadPopular(ctx: Context, categoryId: string): Promise<Result<Video[]>> {
  if (ctx.demo) return Promise.resolve({ ok: true, data: demo.demoTrendVideos(`popular:${categoryId}`, { days: 4, length: "any" }) });
  return safe(() => youtube.getMostPopular(ctx.account!, categoryId || undefined));
}

export function loadSearch(ctx: Context, options: youtube.SearchOptions): Promise<Result<Video[]>> {
  if (ctx.demo) {
    return Promise.resolve({ ok: true, data: demo.demoTrendVideos(`search:${options.query}`, options) });
  }
  return safe(() => youtube.searchTopVideos(ctx.account!, options));
}

export async function loadRefs(ctx: Context): Promise<RefChannel[]> {
  return ctx.demo ? demo.DEMO_REFS : listRefs();
}

export function loadRefUploads(ctx: Context, ref: RefChannel): Promise<Result<Video[]>> {
  if (ctx.demo) return Promise.resolve({ ok: true, data: demo.demoRefUploads(ref) });
  return safe(() => youtube.getChannelUploads(ctx.account!, ref.channelId, 50));
}
