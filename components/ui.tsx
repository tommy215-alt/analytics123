import Link from "next/link";
import type { ReactNode } from "react";
import { ago, changeRatio, clock, num, percent, signedPercent } from "@/lib/format";
import { isShort, likeRate, median, viewsPerDay, viewsPerHour, type TrendInsights } from "@/lib/insights";
import type { NamedValue, Result, Video } from "@/lib/types";

/** 「20.7万」「8,331時間」を、数字部分と単位部分に分ける */
function splitUnit(text: string): [string, string] {
  const match = /^([+\-−¥]?[\d.,:]+)(.*)$/.exec(text);
  return match ? [match[1], match[2]] : [text, ""];
}

/** タイルの背景に薄く敷く小さな推移線 */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${((i / (values.length - 1)) * 100).toFixed(1)},${(27 - ((v - min) / span) * 24).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke="var(--series-1)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
    </svg>
  );
}

export function StatTile({
  label,
  value,
  current,
  previous,
  trend,
}: {
  label: string;
  value: string;
  current?: number;
  previous?: number;
  trend?: number[];
}) {
  const ratio = current !== undefined && previous !== undefined ? changeRatio(current, previous) : null;
  const [figure, unit] = splitUnit(value);
  return (
    <div className="tile">
      {trend && <Sparkline values={trend} />}
      <div className="label">{label}</div>
      <div className="value">
        {figure}
        {unit && <small>{unit}</small>}
      </div>
      {current !== undefined && (
        <div className="delta">
          {ratio === null ? (
            "–"
          ) : (
            <span className={ratio > 0 ? "up" : ratio < 0 ? "down" : undefined}>
              {ratio > 0 ? "▲" : ratio < 0 ? "▼" : "■"} {signedPercent(ratio)}
            </span>
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
  code,
  className,
  result,
  children,
}: {
  title: string;
  sub?: string;
  code?: string;
  className?: string;
  result: Result<T>;
  children: (data: T) => ReactNode;
}) {
  return (
    <section className={className ? `card ${className}` : "card"}>
      <div className="card-head">
        <h2>{title}</h2>
        {sub ? <span className="sub">{sub}</span> : code ? <span className="code">{code}</span> : null}
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
        <div key={item.key} title={`${item.label}: ${format(item.value)}`}>
          <div className="row-head">
            <span>{item.label}</span>
            <span>{total ? percent(item.value / total) : format(item.value)}</span>
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
              {share >= 0.16 ? percent(share) : ""}
            </div>
          );
        })}
      </div>
      <div className="legend">
        {items.map((item, index) => (
          <span key={item.key}>
            <i style={{ background: SEG_COLORS[index % SEG_COLORS.length] }} />
            {item.label} <span className="num">{num(item.value)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Chips({
  items,
  current,
  variant,
}: {
  items: { href: string; label: string; value: string }[];
  current: string;
  variant?: "major" | "alt";
}) {
  return (
    <div className={variant ? `chips ${variant}` : "chips"}>
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

export function Thumb({ video }: { video: Video }) {
  const url = videoUrl(video);
  const inner = (
    <div className="thumb">
      {video.thumbnail && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={video.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
      )}
      {video.durationSec > 0 && <span className="dur">{clock(video.durationSec)}</span>}
    </div>
  );
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" aria-label={`${video.title} を YouTube で開く`}>
      {inner}
    </a>
  ) : (
    inner
  );
}

export function VideoTags({ video }: { video: Video }) {
  return (
    <>
      {isShort(video) && <span className="tag">SHORT</span>}
      {video.isLive && <span className="tag">LIVE</span>}
      {video.synthetic ? (
        <span className="tag ai" title="投稿者が「改変・合成コンテンツ」と申告しています">
          合成表示
        </span>
      ) : video.aiRelated ? (
        <span className="tag ai" title="タイトル・タグ・説明文に AI 関連の語があります">
          AI
        </span>
      ) : null}
    </>
  );
}

export function VideoItem({
  video,
  rank,
  showChannel,
  compact,
  extra,
}: {
  video: Video;
  rank?: number;
  showChannel?: boolean;
  compact?: boolean;
  extra?: ReactNode;
}) {
  const rate = likeRate(video);
  return (
    <li className={compact ? "video compact" : rank ? "video ranked" : "video"}>
      {rank && <span className="rank">{String(rank).padStart(2, "0")}</span>}
      <Thumb video={video} />
      <div>
        <div className="title">
          <VideoTags video={video} />
          {video.title}
        </div>
        {!compact && (
          <div className="meta">
            {showChannel && video.channelTitle ? `${video.channelTitle}・` : ""}
            {video.publishedAt ? ago(video.publishedAt) : ""}
          </div>
        )}
        <div className="stats">
          {extra ?? (
            <>
              <span>
                <b>{num(video.views)}</b>回
              </span>
              <span>
                <b>{num(Math.round(viewsPerDay(video)))}</b>/日
              </span>
              {video.likes !== null && <span>高評価率 {percent(rate, 1)}</span>}
              {video.comments !== null && <span>コメント {num(video.comments)}</span>}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** いちばん新しい投稿の初速。比較用に、同じ種類の直近10本の中央値を添える */
export function LatestVideo({ uploads }: { uploads: Video[] }) {
  const latest = uploads[0];
  if (!latest) return <p className="empty">まだ投稿がありません。</p>;
  const peers = uploads.slice(1).filter((v) => isShort(v) === isShort(latest)).slice(0, 10);
  const peerMedian = median(peers.map((v) => v.views));
  return (
    <div>
      <div className="latest">
        <Thumb video={latest} />
        <div>
          <div className="title">
            <VideoTags video={latest} />
            {latest.title}
          </div>
          <div className="sub">{ago(latest.publishedAt)}に公開</div>
        </div>
      </div>
      <div className="kv">
        <div>
          <div className="k">視聴回数</div>
          <div className="v">{num(latest.views)}</div>
        </div>
        <div>
          <div className="k">1時間あたり</div>
          <div className="v">{num(Math.round(viewsPerHour(latest)))}</div>
        </div>
        <div>
          <div className="k">高評価率</div>
          <div className="v">{latest.likes === null ? "–" : percent(likeRate(latest), 1)}</div>
        </div>
        <div>
          <div className="k" title="同じ種類(長尺/ショート)の直近10本の、現在の再生数の中央値">
            10本中央値
          </div>
          <div className="v">{peers.length ? num(Math.round(peerMedian)) : "–"}</div>
        </div>
      </div>
    </div>
  );
}

export function InsightsCard({ insights, title = "傾向まとめ", className }: { insights: TrendInsights; title?: string; className?: string }) {
  if (insights.count === 0) return null;
  return (
    <section className={className ? `card ${className}` : "card"}>
      <div className="card-head">
        <h2>{title}</h2>
        <span className="code">N={insights.count}</span>
      </div>
      <div className="facts">
        <div className="fact">
          <div className="label">再生数 中央値</div>
          <div className="value">{num(Math.round(insights.medianViews))}</div>
        </div>
        <div className="fact">
          <div className="label">伸び/時 中央値</div>
          <div className="value">{num(Math.round(insights.medianViewsPerHour))}</div>
        </div>
        <div className="fact">
          <div className="label">長さ 中央値</div>
          <div className="value">
            {insights.shortShare >= 0.5
              ? `${Math.round(insights.medianShortSec)}秒`
              : insights.medianLongSec > 0
                ? clock(insights.medianLongSec)
                : "–"}
          </div>
        </div>
        <div className="fact">
          <div className="label">題名 平均</div>
          <div className="value">{Math.round(insights.avgTitleLength)}字</div>
        </div>
      </div>

      <div className="insight-grid">
        <div className="insight-block">
          <h3>公開が多いタイミング(日本時間)</h3>
          <div className="words">
            {[...insights.timeSlots, ...insights.weekdays].map((s) => (
              <span className="word" key={s.label}>
                {s.label}
                <small>{s.count}</small>
              </span>
            ))}
          </div>
        </div>

        <div className="insight-block">
          <h3>タイトルの付け方</h3>
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
      </div>
    </section>
  );
}
