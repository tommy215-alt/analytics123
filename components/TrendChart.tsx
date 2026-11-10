"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { num, numFull, shortDay } from "@/lib/format";

export type ChartMetric = {
  key: string;
  label: string;
  unit: string;
  values: number[];
};

const HEIGHT = 168;
const M = { top: 10, right: 8, bottom: 20, left: 40 };

/** 0 を含む、切りのよい目盛り */
function niceTicks(min: number, max: number, target = 4): number[] {
  if (max === min) max = min + 1;
  const rawStep = (max - min) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? rawStep;
  const ticks: number[] = [];
  for (let t = Math.floor(min / step) * step; t <= max + step * 0.999; t += step) ticks.push(Number(t.toFixed(6)));
  return ticks;
}

export function TrendChart({ dates, metrics }: { dates: string[]; metrics: ChartMetric[] }) {
  const [metricKey, setMetricKey] = useState(metrics[0]?.key);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];

  const geometry = useMemo(() => {
    if (!metric || width === 0 || dates.length === 0) return null;
    const values = metric.values;
    const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
    const lo = ticks[0];
    const hi = ticks[ticks.length - 1];
    const innerW = width - M.left - M.right;
    const innerH = HEIGHT - M.top - M.bottom;
    const x = (i: number) => M.left + (dates.length === 1 ? innerW / 2 : (i / (dates.length - 1)) * innerW);
    const y = (v: number) => M.top + (1 - (v - lo) / (hi - lo)) * innerH;
    const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
    const area = `${line}L${x(values.length - 1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
    return { ticks, x, y, line, area, innerW };
  }, [metric, width, dates]);

  if (!metric) return null;

  const xLabels = dates.length <= 1 ? [0] : [0, Math.floor((dates.length - 1) / 2), dates.length - 1];

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!geometry) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left - M.left) / geometry.innerW;
    setHover(Math.max(0, Math.min(dates.length - 1, Math.round(ratio * (dates.length - 1)))));
  };

  return (
    <div>
      <div className="chips" role="group" aria-label="グラフに表示する指標" style={{ marginBottom: 8 }}>
        {metrics.map((m) => (
          <button key={m.key} type="button" className="chip" aria-pressed={m.key === metric.key} onClick={() => setMetricKey(m.key)}>
            {m.label}
          </button>
        ))}
      </div>

      <div className="chart" ref={box} style={{ height: HEIGHT }}>
        {geometry && (
          <>
            <svg
              height={HEIGHT}
              role="img"
              aria-label={`${metric.label}の日別推移(${dates[0]}〜${dates[dates.length - 1]})`}
              onPointerMove={onMove}
              onPointerDown={onMove}
              onPointerLeave={() => setHover(null)}
            >
              {geometry.ticks.map((t) => (
                <g key={t}>
                  <line x1={M.left} x2={width - M.right} y1={geometry.y(t)} y2={geometry.y(t)} stroke={t === 0 ? "var(--axis)" : "var(--grid)"} strokeWidth="1" />
                  <text x={M.left - 8} y={geometry.y(t)} textAnchor="end" dominantBaseline="middle">
                    {num(t)}
                  </text>
                </g>
              ))}
              {xLabels.map((i, n) => (
                <text key={i} x={geometry.x(i)} y={HEIGHT - 6} textAnchor={xLabels.length === 1 ? "middle" : n === 0 ? "start" : n === xLabels.length - 1 ? "end" : "middle"}>
                  {shortDay(dates[i])}
                </text>
              ))}
              <path d={geometry.area} fill="var(--series-1)" opacity="0.12" />
              <path className="line" d={geometry.line} fill="none" stroke="var(--series-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {hover !== null && (
                <>
                  <line x1={geometry.x(hover)} x2={geometry.x(hover)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--axis)" strokeWidth="1" />
                  <circle cx={geometry.x(hover)} cy={geometry.y(metric.values[hover])} r="5" fill="var(--series-1)" stroke="var(--surface)" strokeWidth="2" />
                </>
              )}
            </svg>
            {hover !== null && (
              <div className="chart-tip" style={{ left: Math.max(60, Math.min(width - 60, geometry.x(hover))) }}>
                {shortDay(dates[hover])} <b>{numFull(Math.round(metric.values[hover]))}</b>
                {metric.unit}
              </div>
            )}
          </>
        )}
      </div>

      <details className="table-view">
        <summary>表で見る</summary>
        <div className="table-scroll">
          <table className="plain">
            <thead>
              <tr>
                <th>日付</th>
                {metrics.map((m) => (
                  <th key={m.key}>
                    {m.label}
                    {m.unit ? `(${m.unit})` : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates
                .map((date, i) => (
                  <tr key={date}>
                    <td>{date}</td>
                    {metrics.map((m) => (
                      <td key={m.key}>{numFull(Math.round(m.values[i]))}</td>
                    ))}
                  </tr>
                ))
                .reverse()}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
