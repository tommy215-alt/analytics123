const compact = new Intl.NumberFormat("ja-JP", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });

/** 12,345 → 1.2万 のように短くする。1万未満はそのまま。 */
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return Math.abs(n) < 10000 ? full.format(n) : compact.format(n);
}

export function numFull(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "–";
  return full.format(n);
}

/** 秒 → 1:02:03 / 4:05 */
export function clock(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
}

/** 分 → 「1,234時間」または「45分」 */
export function watchTime(minutes: number): string {
  if (minutes < 60) return `${full.format(minutes)}分`;
  return `${num(Math.round(minutes / 60))}時間`;
}

export function yen(n: number): string {
  return `¥${num(Math.round(n))}`;
}

/** ISO 8601 の長さ表記(PT1H2M3S)を秒にする */
export function parseIsoDuration(iso: string | undefined): number {
  if (!iso) return 0;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

/** 前期間比。前期間が0なら比較できないので null */
export function changeRatio(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

export function percent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function signedPercent(ratio: number): string {
  const p = ratio * 100;
  const text = Math.abs(p) >= 100 ? p.toFixed(0) : p.toFixed(1);
  return `${p > 0 ? "+" : ""}${text}%`;
}

const JST = "Asia/Tokyo";
const dateFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: JST, year: "numeric", month: "numeric", day: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("ja-JP", { timeZone: JST, month: "numeric", day: "numeric" });

export function dateJa(iso: string): string {
  return dateFmt.format(new Date(iso));
}

/** "2026-11-08" のような日付文字列を 11/8 にする(タイムゾーン変換なし) */
export function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${Number(m)}/${Number(d)}`;
}

export function shortDateJa(iso: string): string {
  return shortDateFmt.format(new Date(iso));
}

export function ago(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const hours = diff / 3600_000;
  if (hours < 1) return "1時間以内";
  if (hours < 24) return `${Math.floor(hours)}時間前`;
  const days = hours / 24;
  if (days < 30) return `${Math.floor(days)}日前`;
  if (days < 365) return `${Math.floor(days / 30)}か月前`;
  return `${Math.floor(days / 365)}年前`;
}

/** UTC基準で n 日前の日付(YYYY-MM-DD) */
export function dayOffset(daysAgo: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
  return d.toISOString().slice(0, 10);
}

export type DateRange = { start: string; end: string; days: number };

/**
 * 直近 n 日と、その直前の n 日。
 * YouTube アナリティクスは反映に2日ほどかかるので、終わりを2日前にする。
 */
export function ranges(days: number, now = new Date()): { current: DateRange; previous: DateRange } {
  const lag = 2;
  return {
    current: { start: dayOffset(lag + days - 1, now), end: dayOffset(lag, now), days },
    previous: { start: dayOffset(lag + days * 2 - 1, now), end: dayOffset(lag + days, now), days },
  };
}
