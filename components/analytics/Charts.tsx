"use client";

import { useId } from "react";
import { formatCompact } from "@/lib/utils";
import { cn } from "@/lib/utils";

/*
 * Lightweight, dependency-free SVG charts.
 * Design choices follow the dataviz method:
 *  - Operational time series use focused single-series charts so each measure
 *    keeps an honest, readable scale.
 *  - Every categorical chart carries a direct text label, so identity/value is
 *    never conveyed by colour alone (secondary encoding for CVD).
 *  - Sequential magnitude uses a single brand hue; status uses reserved tones.
 */

const BRAND = "rgb(79 70 229)";

function finiteValue(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function EmptyChart({ message = "No activity in this period" }: { message?: string }) {
  return (
    <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-border bg-surface-muted/40 px-4 text-center text-sm text-ink-muted">
      {message}
    </div>
  );
}

function chartSummary(data: { label: string; value: number }[]) {
  return data.map((item) => `${item.label}: ${formatCompact(item.value)}`).join(", ");
}

/* ---------------------------------------------------------------- Area chart */
export function AreaChart({
  data,
  color = BRAND,
  ariaLabel,
  height = 200,
}: {
  data: { label: string; value: number }[];
  color?: string;
  ariaLabel: string;
  height?: number;
}) {
  const gradientId = useId();
  if (data.length === 0) return <EmptyChart />;
  const width = 640;
  const padX = 8;
  const padY = 16;
  const safeData = data.map((item) => ({ ...item, value: finiteValue(item.value) }));
  const values = safeData.map((d) => d.value);
  const max = Math.max(1, ...values) * 1.15;
  const min = 0;
  const stepX = safeData.length > 1 ? (width - padX * 2) / (safeData.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = safeData.length === 1 ? width / 2 : padX + i * stepX;
    const y =
      padY + (1 - (v - min) / (max - min || 1)) * (height - padY * 2);
    return [x, y] as const;
  });

  const line = points.map(([x, y]) => `${x},${y}`).join(" ");
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;

  return (
    <figure className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full"
        role="img"
        aria-label={`${ariaLabel}. ${chartSummary(safeData)}`}
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* recessive gridlines */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={padX}
            x2={width - padX}
            y1={padY + f * (height - padY * 2)}
            y2={padY + f * (height - padY * 2)}
            stroke="rgb(229 232 238)"
            strokeWidth="1"
          />
        ))}
        <polygon points={area} fill={`url(#${gradientId})`} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="3.5" fill={color} />
        ))}
      </svg>
      <div
        className="mt-2 grid gap-1 px-1 text-center text-xs text-ink-subtle"
        style={{ gridTemplateColumns: `repeat(${safeData.length}, minmax(0, 1fr))` }}
      >
        {safeData.map((d, index) => (
          <span key={`${d.label}-${index}`} className="truncate" title={d.label}>{d.label}</span>
        ))}
      </div>
      <figcaption className="sr-only">{chartSummary(safeData)}</figcaption>
    </figure>
  );
}

/* --------------------------------------------------------- Vertical bar chart */
export function BarChart({
  data,
  color = BRAND,
  ariaLabel,
  height = 200,
}: {
  data: { label: string; value: number }[];
  color?: string;
  ariaLabel: string;
  height?: number;
}) {
  if (data.length === 0) return <EmptyChart />;
  const safeData = data.map((item) => ({ ...item, value: finiteValue(item.value) }));
  const max = Math.max(1, ...safeData.map((d) => d.value)) * 1.1;
  return (
    <figure className="w-full" aria-label={ariaLabel}>
      <div
        className="flex items-end justify-between gap-2"
        style={{ height }}
      >
        {safeData.map((d, index) => (
          <div
            key={`${d.label}-${index}`}
            className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
            role="img"
            aria-label={`${d.label}: ${formatCompact(d.value)}`}
            tabIndex={0}
          >
            <span className="text-xs font-medium text-ink-muted">
              {formatCompact(d.value)}
            </span>
            <div
              className="w-full rounded-t-md transition-opacity hover:opacity-80"
              style={{
                height: `${(d.value / max) * 100}%`,
                backgroundColor: color,
                minHeight: d.value > 0 ? 4 : 0,
              }}
              title={`${d.label}: ${formatCompact(d.value)}`}
            />
            <span className="text-xs text-ink-subtle">{d.label}</span>
          </div>
        ))}
      </div>
      <figcaption className="sr-only">{chartSummary(safeData)}</figcaption>
    </figure>
  );
}

/* ------------------------------------------------ Horizontal labelled bars */
export function HorizontalBars({
  data,
  ariaLabel,
}: {
  data: { label: string; value: number; color?: string; icon?: React.ReactNode }[];
  ariaLabel: string;
}) {
  if (data.length === 0) return <EmptyChart />;
  const safeData = data.map((item) => ({ ...item, value: finiteValue(item.value) }));
  const max = Math.max(1, ...safeData.map((d) => d.value));
  return (
    <ul className="space-y-3" aria-label={ariaLabel}>
      {safeData.map((d, index) => (
        <li key={`${d.label}-${index}`} className="flex items-center gap-3">
          <div className="flex w-28 shrink-0 items-center gap-2 text-sm text-ink-muted">
            {d.icon}
            <span className="truncate">{d.label}</span>
          </div>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full transition-all"
              role="img"
              aria-label={`${d.label}: ${formatCompact(d.value)}`}
              tabIndex={0}
              style={{
                width: d.value > 0 ? `${Math.max((d.value / max) * 100, 3)}%` : "0%",
                backgroundColor: d.color ?? BRAND,
              }}
            />
          </div>
          <span className="w-14 shrink-0 text-right text-sm font-medium text-ink">
            {formatCompact(d.value)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------- Donut / ring */
export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  ariaLabel,
}: {
  segments: { label: string; value: number; color: string }[];
  centerLabel: string;
  centerValue: string;
  ariaLabel: string;
}) {
  const safeSegments = segments.map((segment) => ({
    ...segment,
    value: finiteValue(segment.value),
  }));
  const actualTotal = safeSegments.reduce((sum, segment) => sum + segment.value, 0);
  const total = actualTotal || 1;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div
      className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8"
      role="img"
      aria-label={ariaLabel}
    >
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0 -rotate-90">
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="rgb(229 232 238)"
          strokeWidth="16"
        />
        {safeSegments.map((seg) => {
          const length = (seg.value / total) * circumference;
          const el = (
            <circle
              key={seg.label}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="16"
              strokeDasharray={`${length} ${circumference - length}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += length;
          return el;
        })}
      </svg>
      <div className="space-y-2.5">
        <div className="mb-3 sm:hidden" />
        {safeSegments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2.5 text-sm">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: seg.color }}
              aria-hidden
            />
            <span className="text-ink-muted">{seg.label}</span>
            <span className="ml-auto font-semibold text-ink">
              {actualTotal === 0 ? "—" : `${Math.round((seg.value / total) * 100)}%`}
            </span>
          </div>
        ))}
      </div>
      {/* Centre readout via absolute overlay */}
      <span className="sr-only">
        {centerLabel}: {centerValue}
      </span>
    </div>
  );
}

/* Donut with a value in the middle (used for success rate). */
export function GaugeDonut({
  value,
  total,
  label,
  color = "rgb(22 163 74)",
  trackColor = "rgb(229 232 238)",
}: {
  value: number;
  total: number;
  label: string;
  color?: string;
  trackColor?: string;
}) {
  const safeTotal = finiteValue(total);
  const pct = safeTotal > 0
    ? Math.min(100, Math.round((finiteValue(value) / safeTotal) * 100))
    : null;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const dash = ((pct ?? 0) / 100) * circumference;
  return (
    <div
      className="relative inline-flex"
      role="img"
      aria-label={pct === null ? `${label}: no completed results` : `${label}: ${pct}%`}
    >
      <svg viewBox="0 0 160 160" className="h-44 w-44 -rotate-90">
        <circle cx="80" cy="80" r={radius} fill="none" stroke={trackColor} strokeWidth="14" />
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeDasharray={`${dash} ${circumference - dash}`}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-ink">{pct === null ? "—" : `${pct}%`}</span>
        <span className="mt-0.5 text-xs text-ink-muted">{label}</span>
      </div>
    </div>
  );
}

/* Tiny inline sparkline for metric cards. */
export function Sparkline({
  values,
  color = BRAND,
  className,
}: {
  values: number[];
  color?: string;
  className?: string;
}) {
  const safeValues = values.map(finiteValue);
  if (safeValues.length === 0) {
    return <span className={cn("block h-8 w-full", className)} aria-hidden />;
  }
  const max = Math.max(...safeValues);
  const min = Math.min(...safeValues);
  const w = 100;
  const h = 32;
  const step = safeValues.length > 1 ? w / (safeValues.length - 1) : 0;
  const pts = safeValues
    .map((v, i) => {
      const x = safeValues.length === 1 ? w / 2 : i * step;
      const y = h - ((v - min) / (max - min || 1)) * h;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={cn("h-8 w-full", className)}
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {safeValues.length === 1 && <circle cx={w / 2} cy={h} r="2" fill={color} />}
    </svg>
  );
}
