import Link from "next/link";
import { removeRef } from "@/app/actions";
import { Avatar } from "@/components/ChannelSwitcher";
import { Chips, InsightsCard, VideoItem } from "@/components/ui";
import { getContext, loadPopular, loadRefUploads, loadRefs, loadSearch, type Context } from "@/lib/data";
import { analyzeVideos, filterAndSort, type VideoSort } from "@/lib/insights";
import type { Result, Video } from "@/lib/types";
import { CATEGORIES } from "@/lib/youtube";
import { AddRefForm } from "./AddRefForm";

type Params = { mode?: string; cat?: string; q?: string; days?: string; length?: string; ref?: string; sort?: string; go?: string };

const MODES = [
  { value: "popular", label: "急上昇" },
  { value: "search", label: "伸びている動画を探す" },
  { value: "refs", label: "参考チャンネル" },
];

const SORTS: { value: VideoSort; label: string }[] = [
  { value: "views", label: "再生数順" },
  { value: "momentum", label: "勢い順" },
  { value: "new", label: "新しい順" },
];

const DAY_OPTIONS = [7, 30, 90];
const LENGTHS = [
  { value: "any", label: "すべての長さ" },
  { value: "short", label: "4分未満(ショート含む)" },
  { value: "medium", label: "4〜20分" },
  { value: "long", label: "20分超" },
] as const;

function Results({ result, sort, sortHref, showChannel }: { result: Result<Video[]>; sort: VideoSort; sortHref: (sort: string) => string; showChannel: boolean }) {
  if (!result.ok) return <p className="notice error">{result.error}</p>;
  if (result.data.length === 0) return <p className="empty">該当する動画が見つかりませんでした。</p>;
  const videos = filterAndSort(result.data, "all", sort);
  return (
    <>
      <InsightsCard insights={analyzeVideos(videos)} />
      <Chips current={sort} items={SORTS.map((s) => ({ ...s, href: sortHref(s.value) }))} />
      <section className="card">
        <ol className="videos">
          {videos.map((video, index) => (
            <VideoItem key={video.id} video={video} rank={index + 1} showChannel={showChannel} />
          ))}
        </ol>
      </section>
    </>
  );
}

async function Popular({ ctx, params, sort }: { ctx: Context; params: Params; sort: VideoSort }) {
  const cat = CATEGORIES.find((c) => c.id === params.cat)?.id ?? "";
  const result = await loadPopular(ctx, cat);
  return (
    <>
      <Chips current={cat} items={CATEGORIES.map((c) => ({ value: c.id, label: c.label, href: `/trends?mode=popular&cat=${c.id}&sort=${sort}` }))} />
      <Results result={result} sort={sort} sortHref={(s) => `/trends?mode=popular&cat=${cat}&sort=${s}`} showChannel />
    </>
  );
}

async function Search({ ctx, params, sort }: { ctx: Context; params: Params; sort: VideoSort }) {
  const query = (params.q ?? "").trim().slice(0, 80);
  const days = DAY_OPTIONS.includes(Number(params.days)) ? Number(params.days) : 7;
  const length = LENGTHS.find((l) => l.value === params.length)?.value ?? "any";
  // 検索は API の利用枠を多く使うため、ボタンを押したときだけ実行する
  const submitted = params.go === "1";
  const result = submitted ? await loadSearch(ctx, { query, days, length }) : null;
  const base = `/trends?mode=search&go=1&q=${encodeURIComponent(query)}&days=${days}&length=${length}`;

  return (
    <>
      <section className="card">
        <form className="search-form" action="/trends" method="get">
          <input type="hidden" name="mode" value="search" />
          <input type="hidden" name="go" value="1" />
          <label className="visually-hidden" htmlFor="q">
            キーワード
          </label>
          <input id="q" className="field" type="search" name="q" defaultValue={query} placeholder="キーワード(空欄なら全ジャンル)" maxLength={80} />
          <div className="row">
            <select className="field" name="days" defaultValue={String(days)} aria-label="公開された時期">
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  直近{d}日に公開
                </option>
              ))}
            </select>
            <select className="field" name="length" defaultValue={length} aria-label="動画の長さ">
              {LENGTHS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn primary" type="submit">
            再生数の多い動画を探す
          </button>
        </form>
      </section>
      {result ? (
        <Results result={result} sort={sort} sortHref={(s) => `${base}&sort=${s}`} showChannel />
      ) : (
        <p className="empty">期間内に公開された国内向け動画を、再生数の多い順に最大50本集めて傾向をまとめます。</p>
      )}
    </>
  );
}

async function Refs({ ctx, params, sort }: { ctx: Context; params: Params; sort: VideoSort }) {
  const refs = await loadRefs(ctx);
  const selected = refs.find((r) => r.channelId === params.ref) ?? refs[0];
  const result = selected ? await loadRefUploads(ctx, selected) : null;

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>参考チャンネルを追加</h2>
          <span className="sub">{refs.length}/12</span>
        </div>
        <AddRefForm />
      </section>

      {refs.length > 0 && (
        <Chips current={selected?.channelId ?? ""} items={refs.map((r) => ({ value: r.channelId, label: r.title, href: `/trends?mode=refs&ref=${r.channelId}&sort=${sort}` }))} />
      )}

      {selected && result && (
        <>
          <section className="card">
            <div className="account-row">
              <Avatar title={selected.title} src={selected.thumbnail} />
              <div className="info">
                <b>{selected.title}</b>
                <span className="sub">{selected.handle ?? ""} 直近の投稿50本</span>
              </div>
              <form action={removeRef}>
                <input type="hidden" name="channelId" value={selected.channelId} />
                <button className="btn danger" type="submit">
                  外す
                </button>
              </form>
            </div>
          </section>
          <Results result={result} sort={sort} sortHref={(s) => `/trends?mode=refs&ref=${selected.channelId}&sort=${s}`} showChannel={false} />
        </>
      )}
    </>
  );
}

export default async function TrendsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await getContext();
  const params = await searchParams;
  const mode = MODES.find((m) => m.value === params.mode)?.value ?? "popular";
  const sort = SORTS.find((s) => s.value === params.sort)?.value ?? "views";

  return (
    <>
      <div className="page-title">
        <div>
          <h1>トレンド</h1>
          <span className="sub">国内で伸びている動画の傾向・ショートは3分以下で推定</span>
        </div>
      </div>

      <Chips current={mode} items={MODES.map((m) => ({ ...m, href: `/trends?mode=${m.value}` }))} />

      {!ctx.demo && !ctx.account ? (
        <section className="card">
          <h2>先にチャンネルを連携してください</h2>
          <p className="sub" style={{ marginBottom: 14 }}>
            トレンドの取得にも、連携した Google アカウントの権限を使います。
          </p>
          <Link className="btn primary" href="/accounts">
            アカウント画面へ
          </Link>
        </section>
      ) : mode === "popular" ? (
        <Popular ctx={ctx} params={params} sort={sort} />
      ) : mode === "search" ? (
        <Search ctx={ctx} params={params} sort={sort} />
      ) : (
        <Refs ctx={ctx} params={params} sort={sort} />
      )}
    </>
  );
}
