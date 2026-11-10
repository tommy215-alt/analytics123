import { redirect } from "next/navigation";
import { Chips, InsightsCard, VideoItem } from "@/components/ui";
import { getContext, loadUploads } from "@/lib/data";
import { analyzeVideos, filterAndSort, type VideoKind, type VideoSort } from "@/lib/insights";

const KINDS: { value: VideoKind; label: string }[] = [
  { value: "all", label: "すべて" },
  { value: "long", label: "長尺" },
  { value: "short", label: "ショート" },
];

const SORTS: { value: VideoSort; label: string }[] = [
  { value: "new", label: "新しい順" },
  { value: "views", label: "再生数順" },
  { value: "momentum", label: "勢い順" },
  { value: "likeRate", label: "高評価率順" },
];

export default async function VideosPage({ searchParams }: { searchParams: Promise<{ kind?: string; sort?: string }> }) {
  const ctx = await getContext();
  if (!ctx.active) redirect("/");

  const params = await searchParams;
  const kind = KINDS.find((k) => k.value === params.kind)?.value ?? "all";
  const sort = SORTS.find((s) => s.value === params.sort)?.value ?? "new";
  const uploads = await loadUploads(ctx);
  const href = (next: { kind?: string; sort?: string }) => `/videos?kind=${next.kind ?? kind}&sort=${next.sort ?? sort}`;

  if (!uploads.ok) {
    return (
      <>
        <div className="page-title">
          <h1>動画</h1>
        </div>
        <p className="notice error">{uploads.error}</p>
      </>
    );
  }

  const videos = filterAndSort(uploads.data, kind, sort);

  return (
    <>
      <div className="page-title">
        <div>
          <h1>動画</h1>
          <span className="sub">新しい順に最大100本・ショートは3分以下で推定</span>
        </div>
      </div>

      <div className="filters">
        <Chips current={kind} items={KINDS.map((k) => ({ ...k, href: href({ kind: k.value }) }))} />
        <Chips current={sort} items={SORTS.map((s) => ({ ...s, href: href({ sort: s.value }) }))} />
      </div>

      <InsightsCard insights={analyzeVideos(videos)} title="自分の動画の傾向" />

      <section className="card">
        {videos.length === 0 ? (
          <p className="empty">該当する動画がありません。</p>
        ) : (
          <ul className="videos">
            {videos.map((video) => (
              <VideoItem key={video.id} video={video} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
