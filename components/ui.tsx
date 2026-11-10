import Link from "next/link";
import type { ReactNode } from "react";
import { ago, changeRatio, clock, num, percent, signedPercent } from "@/lib/format";
import { isShort, viewsPerDay, type TrendInsights } from "@/lib/insights";
import type { NamedValue, Result, Video } from "@/lib/types";

export function StatTile({
  label,
  value,
  current,
  previous,
  compareLabel,
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number;
  compareLabel?: string;
}) {
  const ratio = current !== undefined && previous !== undefined ? changeRatio(current, previous) : null;
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {compareLabel && (
        <div className="delta">
          {ratio === null ? (
            "前の期間のデータなし"
          ) : (
            <>
              <b className={ratio > 0 ? "up" : ratio < 0 ? "down" : undefined}>
                {ratio > 0 ? "▲" : ratio < 0 ? "▼" : ""} {signedPercent(ratio)}
              </b>{" "}
              {compareLabel}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 取得に失敗した区画だけエラーを出し、他の区画はそのまま表示する */
export function Section<T>({
  title,
  sub,
  result,
  children,
}: {
  title: string;
  sub?: string;
  result: Result<T>;
  children: (data: T) => ReactNode;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        {sub && <span className="sub">{sub}</span>}
      </div>
      {result.ok ? children(result.data) : <p className="notice error">{result.error}</p>}
    </section>
  );
}

export function BarList({ items, total, format = num }: { items: NamedValue[]; total?: number; format?: (n: number) => string }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  if (items.length === 0) return <p className="empty">この期間のデータはありません。</p>;
  return (
    <div className="barlist">
      {items.map((item) => (
        <div key={item.key}>
          <div className="row-head">
            <span>{item.label}</span>
            <span>
              {format(item.value)}
              {total ? `(${percent(item.value / total)})` : ""}
            </span>
          </div>
          <div className="track">
            <div className="fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const SEG_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];

/** 全体に占める内訳(最大3区分。4つ目以降は「その他」にまとめて渡すこと) */
export function SegmentedBar({ items }: { items: NamedValue[] }) {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  if (total === 0) return <p className="empty">この期間のデータはありません。</p>;
  const summary = items.map((i) => `${i.label} ${percent(i.value / total)}`).join("、");
  return (
    <div>
      <div className="segbar" role="img" aria-label={summary}>
        {items.map((item, index) => {
          const share = item.value / total;
          return (
            <div key={item.key} className="seg" style={{ flex: `${share} 1 0`, background: SEG_COLORS[index % SEG_COLORS.length] }} title={`${item.label}: ${num(item.value)}回(${percent(share)})`}>
              {share >= 0.14 ? percent(share) : ""}
            </div>
          );
        })}
      </div>
      <div className="legend">
        {items.map((item, index) => (
          <span key={item.key}>
            <i style={{ background: SEG_COLORS[index % SEG_COLORS.length] }} />
            {item.label} {num(item.value)}回
          </span>
        ))}
      </div>
    </div>
  );
}

export function Chips({ items, current }: { items: { href: string; label: string; value: string }[]; current: string }) {
  return (
    <div className="chips">
      {items.map((item) => (
        <Link key={item.value} href={item.href} className="chip" aria-current={item.value === current ? "true" : undefined} scroll={false}>
          {item.label}
        </Link>
      ))}
    </div>
  );
}

function videoUrl(video: Video): string | null {
  return video.id.startsWith("demo-") ? null : `https://www.youtube.com/watch?v=${video.id}`;
}

export function VideoItem({
  video,
  rank,
  showChannel,
  extra,
}: {
  video: Video;
  rank?: number;
  showChannel?: boolean;
  extra?: ReactNode;
}) {
  const url = videoUrl(video);
  const thumb = (
    <div className="thumb">
      {video.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
      )}
      {video.durationSec > 0 && <span className="dur">{clock(video.durationSec)}</span>}
    </div>
  );
  return (
    <li className={rank ? "video ranked" : "video"}>
      {rank && <span className="rank">{rank}</span>}
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" aria-label={`${video.title} を YouTube で開く`}>
          {thumb}
        </a>
      ) : (
        thumb
      )}
      <div>
        <div className="title">
          {isShort(video) && <span className="tag">ショート</span>}
          {video.isLive && <span className="tag">ライブ</span>}
          {video.title}
        </div>
        <div className="meta">
          {showChannel && video.channelTitle ? `${video.channelTitle}・` : ""}
          {video.publishedAt ? ago(video.publishedAt) : ""}
        </div>
        <div className="stats">
          {extra ?? (
            <>
              <span>
                <b>{num(video.views)}</b> 回視聴
              </span>
              <span>1日あたり {num(Math.round(viewsPerDay(video)))}</span>
              {video.likes !== null && <span>高評価 {num(video.likes)}</span>}
              {video.comments !== null && <span>コメント {num(video.comments)}</span>}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

export function InsightsCard({ insights, title = "傾向まとめ" }: { insights: TrendInsights; title?: string }) {
  if (insights.count === 0) return null;
  return (
    <section className="card">
      <div className="card-head">
        <h2>{title}</h2>
        <span className="sub">{insights.count}本を集計</span>
      </div>
      <div className="facts">
        <div className="fact">
          <div className="label">再生数の中央値</div>
          <div className="value">{num(Math.round(insights.medianViews))}</div>
        </div>
        <div className="fact">
          <div className="label">1時間あたりの伸び(中央値)</div>
          <div className="value">{num(Math.round(insights.medianViewsPerHour))}</div>
        </div>
        <div className="fact">
          <div className="label">ショートの割合(推定)</div>
          <div className="value">{percent(insights.shortShare)}</div>
        </div>
        <div className="fact">
          <div className="label">長さの中央値</div>
          <div className="value" style={{ fontSize: 15 }}>
            {insights.medianLongSec > 0 && <>長尺 {clock(insights.medianLongSec)}</>}
            {insights.medianLongSec > 0 && insights.medianShortSec > 0 && " / "}
            {insights.medianShortSec > 0 && <>ショート {Math.round(insights.medianShortSec)}秒</>}
          </div>
        </div>
      </div>

      <div className="insight-block">
        <h3>公開が多いタイミング(日本時間)</h3>
        <div className="words">
          {insights.timeSlots.map((s) => (
            <span className="word" key={s.label}>
              {s.label}
              <small>{s.count}本</small>
            </span>
          ))}
          {insights.weekdays.map((s) => (
            <span className="word" key={s.label}>
              {s.label}
              <small>{s.count}本</small>
            </span>
          ))}
        </div>
      </div>

      <div className="insight-block">
        <h3>タイトルの付け方(平均 {Math.round(insights.avgTitleLength)} 文字)</h3>
        <div className="words">
          {insights.titlePatterns.map((p) => (
            <span className="word" key={p.label}>
              {p.label}
              <small>{percent(p.share)}</small>
            </span>
          ))}
        </div>
      </div>

      {insights.words.length > 0 && (
        <div className="insight-block">
          <h3>タイトルによく出る言葉</h3>
          <div className="words">
            {insights.words.map((w) => (
              <span className="word" key={w.label}>
                {w.label}
                <small>{w.count}</small>
              </span>
            ))}
          </div>
        </div>
      )}

      {insights.tags.length > 0 && (
        <div className="insight-block">
          <h3>よく使われているタグ</h3>
          <div className="words">
            {insights.tags.map((w) => (
              <span className="word" key={w.label}>
                {w.label}
                <small>{w.count}</small>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
