// Plain inline SVG line chart. One y axis only. Sized to the container's real pixel width.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { displayUnit, formatDateTime } from "../format";
import type { Reading, VitalType } from "../vitals";

const HEIGHT = 240;
const M = { top: 16, right: 52, bottom: 28, left: 48 };
const SERIES_VARS = ["var(--series-1)", "var(--series-2)"];
const DAY = 86400000;

function niceTicks(min: number, max: number) {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const rough = (max - min) / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(10)));
  const decimals = step < 1 ? Math.ceil(-Math.log10(step)) : 0;
  return { lo, hi, ticks, decimals };
}

function xLabel(d: Date, spanMs: number): string {
  if (spanMs > 730 * DAY) return String(d.getFullYear());
  if (spanMs > 60 * DAY) return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

interface Props {
  type: VitalType;
  points: Reading[]; // plottable readings, any order
  unit: string;
}

export default function VitalsChart({ type, points: raw, unit }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => setWidth(Math.floor(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = useMemo(() => [...raw].sort((a, b) => a.date!.getTime() - b.date!.getTime()), [raw]);
  useEffect(() => setActive(null), [points]);

  const seriesNames = type.isBP ? ["Systolic", "Diastolic"] : [type.label];
  const u = displayUnit(unit);
  const plotW = Math.max(0, width - M.left - M.right);
  const plotH = HEIGHT - M.top - M.bottom;

  const geo = useMemo(() => {
    let tMin = points[0].date!.getTime();
    let tMax = points[points.length - 1].date!.getTime();
    if (tMin === tMax) {
      tMin -= DAY / 2;
      tMax += DAY / 2;
    }
    const vals = points.flatMap((p) => p.values.filter((v): v is number => v !== null));
    const y = niceTicks(Math.min(...vals), Math.max(...vals));
    const sx = (t: number) => M.left + ((t - tMin) / (tMax - tMin)) * plotW;
    const sy = (v: number) => M.top + plotH - ((v - y.lo) / (y.hi - y.lo)) * plotH;

    const n = Math.max(2, Math.min(6, Math.floor(plotW / 80)));
    const span = tMax - tMin;
    const xTicks: { x: number; label: string }[] = [];
    for (let i = 0; i < n; i++) {
      const t = tMin + (i * span) / (n - 1);
      const label = xLabel(new Date(t), span);
      if (xTicks.some((k) => k.label === label)) continue; // never repeat a label
      xTicks.push({ x: sx(t), label });
    }

    const series = seriesNames.map((_, si) => {
      const segments: string[] = [];
      let cur: string[] = [];
      for (const p of points) {
        const v = p.values[si];
        if (v === null || v === undefined) {
          if (cur.length) segments.push(cur.join(" "));
          cur = [];
          continue;
        }
        cur.push(`${cur.length ? "L" : "M"}${sx(p.date!.getTime()).toFixed(1)},${sy(v).toFixed(1)}`);
      }
      if (cur.length) segments.push(cur.join(" "));
      const markers = points
        .map((p) => (p.values[si] !== null ? { x: sx(p.date!.getTime()), y: sy(p.values[si]!) } : null))
        .filter((m): m is { x: number; y: number } => m !== null);
      let last: { x: number; y: number; v: number } | null = null;
      for (let i = points.length - 1; i >= 0; i--) {
        const v = points[i].values[si];
        if (v !== null) {
          last = { x: sx(points[i].date!.getTime()), y: sy(v), v };
          break;
        }
      }
      return { segments, markers, last };
    });

    const ends = series.map((s) => s.last).filter((l): l is NonNullable<typeof l> => l !== null);
    let showEnds = true;
    for (let i = 0; i < ends.length; i++)
      for (let j = i + 1; j < ends.length; j++) if (Math.abs(ends[i].y - ends[j].y) < 14) showEnds = false;

    return { y, sx, sy, xTicks, series, showEnds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, plotW, plotH, type.isBP]);

  const readout = (i: number) => {
    const p = points[i];
    const parts = seriesNames.map((name, si) => {
      const v = p.values[si];
      const val = v === null ? "Not recorded" : `${v} ${u}`.trim();
      return type.isBP ? `${name} ${val}` : val;
    });
    return `${formatDateTime(p.date)}: ${parts.join(", ")}`;
  };

  const nearest = (clientX: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const x = clientX - rect.left;
    let best = 0;
    let bestD = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(geo.sx(p.date!.getTime()) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  const onKey = (e: React.KeyboardEvent) => {
    const last = points.length - 1;
    const cur = active ?? last;
    let next: number | null = cur;
    if (e.key === "ArrowLeft") next = Math.max(0, cur - 1);
    else if (e.key === "ArrowRight") next = Math.min(last, cur + 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    else if (e.key === "Escape") next = null;
    else return;
    e.preventDefault();
    setActive(next);
  };

  const activeX = active !== null && points[active] ? geo.sx(points[active].date!.getTime()) : null;
  const showMarkers = points.length <= 30;

  return (
    <div className="chart">
      {type.isBP && (
        <div className="legend" aria-hidden="true">
          {seriesNames.map((n, i) => (
            <span key={n} className="legend-item">
              <span className="legend-swatch" style={{ background: SERIES_VARS[i] }} />
              {n}
            </span>
          ))}
        </div>
      )}
      <div
        ref={wrapRef}
        className="chart-wrap"
        tabIndex={0}
        role="group"
        aria-label={`${type.label} graph, ${points.length} readings. Use arrow keys to move between readings.`}
        onFocus={() => setActive(points.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={onKey}
      >
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-hidden="true">
            {geo.y.ticks.map((t) => (
              <g key={t}>
                <line className="grid" x1={M.left} x2={M.left + plotW} y1={geo.sy(t)} y2={geo.sy(t)} />
                <text className="axis-text" x={M.left - 6} y={geo.sy(t)} textAnchor="end" dominantBaseline="middle">
                  {t.toFixed(geo.y.decimals)}
                </text>
              </g>
            ))}
            {geo.xTicks.map((t, i) => (
              <text
                key={t.label}
                className="axis-text"
                x={t.x}
                y={HEIGHT - 8}
                textAnchor={geo.xTicks.length > 1 && i === 0 ? "start" : i === geo.xTicks.length - 1 && i > 0 ? "end" : "middle"}
              >
                {t.label}
              </text>
            ))}
            {geo.series.map((s, si) => (
              <g key={si} style={{ color: SERIES_VARS[si] }}>
                {s.segments.map((d, k) => (
                  <path key={k} d={d} className="line" />
                ))}
                {showMarkers && s.markers.map((m, k) => <circle key={k} cx={m.x} cy={m.y} r={4} className="marker" />)}
                {geo.showEnds && s.last && (
                  <text className="end-label" x={s.last.x + 8} y={s.last.y} dominantBaseline="middle">
                    {s.last.v}
                  </text>
                )}
              </g>
            ))}
            {activeX !== null && <line className="hairline" x1={activeX} x2={activeX} y1={M.top} y2={M.top + plotH} />}
            <rect
              x={M.left}
              y={M.top}
              width={plotW}
              height={plotH}
              fill="transparent"
              onPointerMove={(e) => setActive(nearest(e.clientX))}
              onPointerDown={(e) => setActive(nearest(e.clientX))}
              onPointerLeave={() => setActive(null)}
            />
          </svg>
        )}
        {active !== null && activeX !== null && points[active] && (
          <div
            className="tooltip"
            style={
              activeX > width / 2
                ? { left: activeX - 10, top: M.top, transform: "translateX(-100%)" }
                : { left: activeX + 10, top: M.top }
            }
          >
            <div className="tooltip-date">{formatDateTime(points[active].date)}</div>
            {seriesNames.map((n, si) => (
              <div key={n}>
                {type.isBP && (
                  <>
                    <span className="legend-swatch" style={{ background: SERIES_VARS[si] }} /> {n}:{" "}
                  </>
                )}
                <strong>{points[active].values[si] ?? "Not recorded"}</strong> {u}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="sr-only" aria-live="polite">
        {active !== null && points[active] ? readout(active) : ""}
      </div>
    </div>
  );
}
