import Link from "next/link";
import { TrendChart } from "@/components/TrendChart";
import { BarList, Chips, LatestVideo, Section, SegmentedBar, StatTile, VideoItem } from "@/components/ui";
import { getContext, loadDashboard } from "@/lib/data";
import { clock, num, percent, shortDay, watchTime, yen } from "@/lib/format";
import type { NamedValue } from "@/lib/types";

const RANGES = [7, 28, 90, 365];

/** 上位 max 件を残し、残りを「その他」にまとめる */
function foldOthers(items: NamedValue[], max: number): NamedValue[] {
  if (items.length <= max) return items;
  const rest = items.slice(max - 1).reduce((sum, i) => sum + i.value, 0);
  return [...items.slice(0, max - 1), { key: "other", label: "その他", value: rest }];
}

const sumOf = (items: NamedValue[]): number => items.reduce((sum, i) => sum + i.value, 0);

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const ctx = await getContext();
  if (!ctx.active) {
    return (
      <section className="card">
        <h2>チャンネルを連携しましょう</h2>
        <p className="sub" style={{ marginBottom: 12 }}>
          まだチャンネルが登録されていません。Google アカウントでログインすると、分析データを表示できます。
        </p>
        <Link className="btn primary" href="/accounts">
          アカウント画面へ
        </Link>
      </section>
    );
  }

  const requested = Number((await searchParams).range);
  const days = RANGES.includes(requested) ? requested : 28;
  const d = await loadDashboard(ctx, days);
  const daily = d.daily.ok ? d.daily.data : [];
  const t = d.totals.ok ? d.totals.data : null;
  const net = (x: { subsGained: number; subsLost: number }) => x.subsGained - x.subsLost;

  return (
    <>
      <div className="page-title">
        <div>
          <h1>概要</h1>
          <span className="sub">
            {shortDay(d.range.start)}–{shortDay(d.range.end)}・増減は前の{days}日間との比較
          </span>
        </div>
        <Chips current={String(days)} items={RANGES.map((r) => ({ value: String(r), label: r === 365 ? "1年" : `${r}日`, href: `/?range=${r}` }))} />
      </div>

      {d.channel.ok ? (
        <p className="channel-line">
          <span>
            登録者 <b>{d.channel.data.subscribers === null ? "非公開" : num(d.channel.data.subscribers)}</b>
          </span>
          <span>
            総再生 <b>{num(d.channel.data.totalViews)}</b>
          </span>
          <span>
            動画 <b>{num(d.channel.data.videoCount)}</b>
          </span>
        </p>
      ) : (
        <p className="notice error">{d.channel.error}</p>
      )}

      {t ? (
        <div className="tiles">
          <StatTile label="視聴回数" value={num(t.current.views)} current={t.current.views} previous={t.previous.views} trend={daily.map((p) => p.views)} />
          <StatTile label="総再生時間" value={watchTime(t.current.minutes)} current={t.current.minutes} previous={t.previous.minutes} trend={daily.map((p) => p.minutes)} />
          <StatTile
            label="登録者の増減"
            value={`${net(t.current) >= 0 ? "+" : ""}${num(net(t.current))}`}
            current={net(t.current)}
            previous={net(t.previous)}
            trend={daily.map((p) => net(p))}
          />
          {d.revenue.ok && <StatTile label="推定収益" value={yen(d.revenue.data.current)} current={d.revenue.data.current} previous={d.revenue.data.previous} />}
          <StatTile
            label="平均視聴時間"
            value={clock(t.current.avgViewDurationSec)}
            current={t.current.avgViewDurationSec}
            previous={t.previous.avgViewDurationSec}
            trend={daily.map((p) => p.avgViewDurationSec)}
          />
          <StatTile label="高評価" value={num(t.current.likes)} current={t.current.likes} previous={t.previous.likes} trend={daily.map((p) => p.likes)} />
          <StatTile label="コメント" value={num(t.current.comments)} current={t.current.comments} previous={t.previous.comments} />
          <StatTile label="共有" value={num(t.current.shares)} current={t.current.shares} previous={t.previous.shares} />
          <StatTile label="新規登録" value={`+${num(t.current.subsGained)}`} current={t.current.subsGained} previous={t.previous.subsGained} />
        </div>
      ) : (
        d.totals.ok === false && <p className="notice error">{d.totals.error}</p>
      )}

      <div className="dash">
        <Section title="日別の推移" code="DAILY" className="span-7" result={d.daily}>
          {(points) =>
            points.length === 0 ? (
              <p className="empty">この期間のデータはありません。</p>
            ) : (
              <TrendChart
                dates={points.map((p) => p.date)}
                metrics={[
                  { key: "views", label: "視聴回数", unit: "回", values: points.map((p) => p.views) },
                  { key: "hours", label: "再生時間", unit: "時間", values: points.map((p) => p.minutes / 60) },
                  { key: "subs", label: "登録者", unit: "人", values: points.map((p) => net(p)) },
                  { key: "likes", label: "高評価", unit: "件", values: points.map((p) => p.likes) },
                  { key: "avd", label: "平均視聴", unit: "秒", values: points.map((p) => p.avgViewDurationSec) },
                ]}
              />
            )
          }
        </Section>

        <div className="stack span-5">
          <Section title="最新の投稿" code="LATEST" result={d.uploads}>
            {(uploads) => <LatestVideo uploads={uploads} />}
          </Section>
          <Section title="動画の種類別" sub="視聴回数" result={d.contentTypes}>
            {(items) => <SegmentedBar items={foldOthers(items, 3)} />}
          </Section>
        </div>

        <Section title="よく見られた動画" sub={`直近${days}日`} className="span-5" result={d.topVideos}>
          {(rows) =>
            rows.length === 0 ? (
              <p className="empty">この期間のデータはありません。</p>
            ) : (
              <ol className="videos">
                {rows.map(({ row, video }, index) =>
                  video ? (
                    <VideoItem
                      key={row.videoId}
                      video={video}
                      rank={index + 1}
                      compact
                      extra={
                        <>
                          <span>
                            <b>{num(row.views)}</b>回
                          </span>
                          <span>
                            維持 <b>{Math.round(row.avgViewPercentage)}%</b>
                          </span>
                          <span>平均 {clock(row.avgViewDurationSec)}</span>
                          <span>登録 +{num(row.subsGained)}</span>
                        </>
                      }
                    />
                  ) : null,
                )}
              </ol>
            )
          }
        </Section>

        <div className="stack span-7">
          <div className="cols-2">
            <Section title="流入元" code="SOURCE" result={d.traffic}>
              {(items) => <BarList items={foldOthers(items, 6)} total={sumOf(items)} />}
            </Section>
            <Section title="年齢層" code="AGE" result={d.demographics}>
              {(demo) =>
                demo.ages.length === 0 ? (
                  <p className="empty">視聴者数が少ない期間は表示されません。</p>
                ) : (
                  <>
                    <BarList items={demo.ages} format={(v) => percent(v / 100)} />
                    <div className="legend">
                      {demo.genders.map((g) => (
                        <span key={g.key}>
                          {g.label} <span className="num">{percent(g.value / 100)}</span>
                        </span>
                      ))}
                    </div>
                  </>
                )
              }
            </Section>
          </div>
          <div className="cols-2">
            <Section title="視聴者の国" code="GEO" result={d.countries}>
              {(items) => <BarList items={items} total={t ? t.current.views : sumOf(items)} />}
            </Section>
            <Section title="視聴機器" code="DEVICE" result={d.devices}>
              {(items) => <BarList items={foldOthers(items, 5)} total={sumOf(items)} />}
            </Section>
          </div>
        </div>
      </div>
    </>
  );
}
