import Link from "next/link";
import { removeRef } from "@/app/actions";
import { Avatar } from "@/components/ChannelSwitcher";
import { Chips, InsightsCard, VideoItem } from "@/components/ui";
import { getContext, loadRefUploads, loadRefs, loadTrend, type Context, type TrendFormat, type TrendSource } from "@/lib/data";
import { analyzeVideos, filterAndSort, type VideoSort } from "@/lib/insights";
import type { Result, Video } from "@/lib/types";
import { CATEGORIES, REGIONS } from "@/lib/youtube";
import { AddRefForm } from "./AddRefForm";

type Params = { mode?: string; region?: string; fmt?: string; cat?: string; q?: string; days?: string; ref?: string; sort?: string };

const MODES = [
  { value: "popular", label: "急上昇" },
  { value: "ai", label: "AI系" },
  { value: "search", label: "キーワード" },
  { value: "refs", label: "参考チャンネル" },
] as const;

type Mode = (typeof MODES)[number]["value"];

const FORMATS: { value: TrendFormat; label: string }[] = [
  { value: "long", label: "長尺" },
  { value: "short", label: "ショート" },
];

const SORTS: { value: VideoSort; label: string }[] = [
  { value: "views", label: "再生数順" },
  { value: "momentum", label: "勢い順" },
  { value: "new", label: "新しい順" },
];

const DAY_OPTIONS = [7, 30, 90];

type State = { mode: Mode; region: string; fmt: TrendFormat; cat: string; q: string; days: number; ref: string; sort: VideoSort };

/** いまの条件を保ったまま、一部だけ変えたリンクを作る */
function link(state: State, change: Partial<State>): string {
  const next = { ...state, ...change };
  const params = new URLSearchParams({ mode: next.mode, region: next.region, fmt: next.fmt, days: String(next.days), sort: next.sort });
  if (next.cat) params.set("cat", next.cat);
  if (next.q) params.set("q", next.q);
  if (next.ref) params.set("ref", next.ref);
  return `/trends?${params}`;
}

function Results({ result, state }: { result: Result<Video[]>; state: State }) {
  if (!result.ok) return <p className="notice error">{result.error}</p>;
  if (result.data.length === 0) return <p className="empty">該当する動画が見つかりませんでした。条件を変えてみてください。</p>;
  const videos = filterAndSort(result.data, "all", state.sort);
  return (
    <>
      <InsightsCard insights={analyzeVideos(videos)} />
      <section className="card">
        <div className="card-head">
          <h2>ランキング</h2>
          <Chips current={state.sort} items={SORTS.map((s) => ({ ...s, href: link(state, { sort: s.value }) }))} />
        </div>
        <ol className="videos wide">
          {videos.map((video, index) => (
            <VideoItem key={video.id} video={video} rank={index + 1} showChannel={state.mode !== "refs"} />
          ))}
        </ol>
      </section>
    </>
  );
}

function Row({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <div className="filter-row">
      <span className="code">{code}</span>
      {children}
    </div>
  );
}

async function Discover({ ctx, state }: { ctx: Context; state: State }) {
  const source = state.mode as TrendSource;
  // 急上昇の長尺だけは YouTube のチャート(期間の指定なし)。それ以外は期間内の公開分を探す
  const usesChart = source === "popular" && state.fmt === "long";
  const needsKeyword = source === "search" && !state.q;
  const result = needsKeyword
    ? null
    : await loadTrend(ctx, { source, region: state.region, format: state.fmt, categoryId: source === "popular" ? state.cat : "", days: state.days, query: state.q });

  return (
    <>
      <div className="filters">
        <Row code="地域">
          <Chips current={state.region} items={REGIONS.map((r) => ({ value: r.code, label: r.label, href: link(state, { region: r.code }) }))} />
        </Row>
        <Row code="形式">
          <Chips variant="alt" current={state.fmt} items={FORMATS.map((f) => ({ ...f, href: link(state, { fmt: f.value }) }))} />
        </Row>
        {source === "popular" && (
          <Row code="分野">
            <Chips current={state.cat} items={CATEGORIES.map((c) => ({ value: c.id, label: c.label, href: link(state, { cat: c.id }) }))} />
          </Row>
        )}
        {!usesChart && (
          <Row code="期間">
            <Chips current={String(state.days)} items={DAY_OPTIONS.map((d) => ({ value: String(d), label: `直近${d}日に公開`, href: link(state, { days: d }) }))} />
          </Row>
        )}
      </div>

      {source === "search" && (
        <form className="inline-form" action="/trends" method="get">
          <input type="hidden" name="mode" value="search" />
          <input type="hidden" name="region" value={state.region} />
          <input type="hidden" name="fmt" value={state.fmt} />
          <input type="hidden" name="days" value={state.days} />
          <label className="visually-hidden" htmlFor="q">
            キーワード
          </label>
          <input id="q" className="field" type="search" name="q" defaultValue={state.q} placeholder="キーワード(例: 料理、ゲーム実況)" maxLength={80} required />
          <button className="btn primary" type="submit">
            探す
          </button>
        </form>
      )}

      {source === "ai" && (
        <p className="sub">
          タイトルなどに AI 関連の語(生成AI、Sora、Suno など)を含む動画を、再生数の多い順に集めています。AI で作られたかどうかを YouTube が判定した結果ではありません。
        </p>
      )}

      {result ? <Results result={result} state={state} /> : <p className="empty">キーワードを入れると、期間内に公開された動画を再生数の多い順に集めて傾向をまとめます。</p>}
    </>
  );
}

async function Refs({ ctx, state }: { ctx: Context; state: State }) {
  const refs = await loadRefs(ctx);
  const selected = refs.find((r) => r.channelId === state.ref) ?? refs[0];
  const uploads = selected ? await loadRefUploads(ctx, selected) : null;
  const result: Result<Video[]> | null = uploads && uploads.ok ? { ok: true, data: filterAndSort(uploads.data, state.fmt, "views") } : uploads;

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>参考チャンネルを追加</h2>
          <span className="code">{refs.length}/12</span>
        </div>
        <AddRefForm />
      </section>

      {refs.length > 0 && (
        <div className="filters">
          <Row code="対象">
            <Chips current={selected?.channelId ?? ""} items={refs.map((r) => ({ value: r.channelId, label: r.title, href: link(state, { ref: r.channelId }) }))} />
          </Row>
          <Row code="形式">
            <Chips variant="alt" current={state.fmt} items={FORMATS.map((f) => ({ ...f, href: link(state, { fmt: f.value }) }))} />
          </Row>
        </div>
      )}

      {selected && result && (
        <>
          <section className="card">
            <div className="account-row" style={{ padding: 0 }}>
              <Avatar title={selected.title} src={selected.thumbnail} />
              <div className="info">
                <b>{selected.title}</b>
                <span className="sub">{selected.handle ?? ""} 直近の投稿50本から</span>
              </div>
              <form action={removeRef}>
                <input type="hidden" name="channelId" value={selected.channelId} />
                <button className="btn danger" type="submit">
                  外す
                </button>
              </form>
            </div>
          </section>
          <Results result={result} state={state} />
        </>
      )}
    </>
  );
}

export default async function TrendsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const state: State = {
    mode: MODES.find((m) => m.value === params.mode)?.value ?? "popular",
    region: REGIONS.find((r) => r.code === params.region)?.code ?? "JP",
    fmt: FORMATS.find((f) => f.value === params.fmt)?.value ?? "long",
    cat: CATEGORIES.find((c) => c.id === params.cat)?.id ?? "",
    q: (params.q ?? "").trim().slice(0, 80),
    days: DAY_OPTIONS.includes(Number(params.days)) ? Number(params.days) : 7,
    ref: params.ref ?? "",
    sort: SORTS.find((s) => s.value === params.sort)?.value ?? "views",
  };

  return (
    <>
      <div className="page-title">
        <div>
          <h1>トレンド</h1>
          <span className="sub">ショートは3分以下で推定・結果は1時間ごとに更新</span>
        </div>
      </div>

      <Chips variant="major" current={state.mode} items={MODES.map((m) => ({ ...m, href: link(state, { mode: m.value }) }))} />

      {!ctx.demo && !ctx.account ? (
        <section className="card">
          <h2>先にチャンネルを連携してください</h2>
          <p className="sub" style={{ marginBottom: 12 }}>
            トレンドの取得にも、連携した Google アカウントの権限を使います。
          </p>
          <Link className="btn primary" href="/accounts">
            アカウント画面へ
          </Link>
        </section>
      ) : state.mode === "refs" ? (
        <Refs ctx={ctx} state={state} />
      ) : (
        <Discover ctx={ctx} state={state} />
      )}
    </>
  );
}
