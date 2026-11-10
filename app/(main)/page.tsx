import Link from "next/link";
import { TrendChart } from "@/components/TrendChart";
import { BarList, Chips, Section, SegmentedBar, StatTile, VideoItem } from "@/components/ui";
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const ctx = await getContext();
  if (!ctx.active) {
    return (
      <section className="card">
        <h2>チャンネルを連携しましょう</h2>
        <p className="sub" style={{ marginBottom: 14 }}>
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
  const compare = `前の${days}日間と比べて`;

  return (
    <>
      <div className="page-title">
        <div>
          <h1>概要</h1>
          <span className="sub">
            {shortDay(d.range.start)}〜{shortDay(d.range.end)}(反映の遅れがあるため2日前まで)
          </span>
        </div>
        <Chips current={String(days)} items={RANGES.map((r) => ({ value: String(r), label: r === 365 ? "1年" : `${r}日`, href: `/?range=${r}` }))} />
      </div>

      {d.channel.ok ? (
        <p className="channel-line">
          <span>
            登録者 <b>{d.channel.data.subscribers === null ? "非公開" : `${num(d.channel.data.subscribers)}人`}</b>
          </span>
          <span>
            総再生 <b>{num(d.channel.data.totalViews)}回</b>
          </span>
          <span>
            動画 <b>{num(d.channel.data.videoCount)}本</b>
          </span>
        </p>
      ) : (
        <p className="notice error">{d.channel.error}</p>
      )}

      {d.totals.ok ? (
        <div className="tiles">
          <StatTile label="視聴回数" value={num(d.totals.data.current.views)} current={d.totals.data.current.views} previous={d.totals.data.previous.views} compareLabel={compare} />
          <StatTile label="総再生時間" value={watchTime(d.totals.data.current.minutes)} current={d.totals.data.current.minutes} previous={d.totals.data.previous.minutes} compareLabel={compare} />
          <StatTile
            label="登録者の増減"
            value={`${d.totals.data.current.subsGained - d.totals.data.current.subsLost >= 0 ? "+" : ""}${num(d.totals.data.current.subsGained - d.totals.data.current.subsLost)}`}
            current={d.totals.data.current.subsGained - d.totals.data.current.subsLost}
            previous={d.totals.data.previous.subsGained - d.totals.data.previous.subsLost}
            compareLabel={compare}
          />
          <StatTile
            label="平均視聴時間"
            value={clock(d.totals.data.current.avgViewDurationSec)}
            current={d.totals.data.current.avgViewDurationSec}
            previous={d.totals.data.previous.avgViewDurationSec}
            compareLabel={compare}
          />
          {d.revenue.ok && (
            <StatTile label="推定収益" value={yen(d.revenue.data.current)} current={d.revenue.data.current} previous={d.revenue.data.previous} compareLabel={compare} />
          )}
          <StatTile label="高評価" value={num(d.totals.data.current.likes)} current={d.totals.data.current.likes} previous={d.totals.data.previous.likes} compareLabel={compare} />
        </div>
      ) : (
        <p className="notice error">{d.totals.error}</p>
      )}

      <Section title="日別の推移" result={d.daily}>
        {(daily) =>
          daily.length === 0 ? (
            <p className="empty">この期間のデータはありません。</p>
          ) : (
            <TrendChart
              dates={daily.map((p) => p.date)}
              metrics={[
                { key: "views", label: "視聴回数", unit: "回", values: daily.map((p) => p.views) },
                { key: "hours", label: "再生時間", unit: "時間", values: daily.map((p) => p.minutes / 60) },
                { key: "subs", label: "登録者の増減", unit: "人", values: daily.map((p) => p.subsGained - p.subsLost) },
              ]}
            />
          )
        }
      </Section>

      <div className="grid-2">
        <Section title="動画の種類別の視聴回数" result={d.contentTypes}>
          {(items) => <SegmentedBar items={foldOthers(items, 3)} />}
        </Section>

        <Section title="視聴者がどこから来たか" sub="視聴回数" result={d.traffic}>
          {(items) => <BarList items={foldOthers(items, 6)} total={items.reduce((sum, i) => sum + i.value, 0)} />}
        </Section>
      </div>

      <div className="grid-2">
        <Section title="視聴者の年齢層" result={d.demographics}>
          {(demo) =>
            demo.ages.length === 0 ? (
              <p className="empty">視聴者数が少ない期間は、年齢層のデータが表示されません。</p>
            ) : (
              <>
                <BarList items={demo.ages} format={(v) => percent(v / 100)} />
                <div className="legend" style={{ marginTop: 14 }}>
                  {demo.genders.map((g) => (
                    <span key={g.key}>
                      {g.label} {percent(g.value / 100)}
                    </span>
                  ))}
                </div>
              </>
            )
          }
        </Section>

        <Section title="よく見られた動画" sub={`直近${days}日間`} result={d.topVideos}>
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
                      extra={
                        <>
                          <span>
                            <b>{num(row.views)}</b> 回視聴
                          </span>
                          <span>
                            平均 {clock(row.avgViewDurationSec)}({Math.round(row.avgViewPercentage)}%)
                          </span>
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
      </div>
    </>
  );
}
