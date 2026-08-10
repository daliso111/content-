import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { Tone } from "@/types";

const ICON_TONE: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-muted",
  brand: "bg-brand-soft text-brand-text",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
};

export function MetricCard({
  label,
  value,
  icon: Icon,
  tone = "brand",
  delta,
  hint,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  /** Percentage change vs previous period. */
  delta?: number;
  hint?: string;
}) {
  const positive = (delta ?? 0) > 0;
  const neutral = delta === 0;
  return (
    <Card className="p-5 transition-shadow hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl",
            ICON_TONE[tone],
          )}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </div>
        {typeof delta === "number" && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
              neutral
                ? "bg-surface-muted text-ink-muted"
                : positive
                ? "bg-success-soft text-success"
                : "bg-danger-soft text-danger",
            )}
          >
            {neutral ? (
              <Minus className="h-3 w-3" aria-hidden />
            ) : positive ? (
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            ) : (
              <ArrowDownRight className="h-3 w-3" aria-hidden />
            )}
            {Math.abs(delta)}%
          </span>
        )}
      </div>
      <p className="mt-4 text-2xl font-bold tracking-tight text-ink">{value}</p>
      <p className="mt-1 text-sm text-ink-muted">{label}</p>
      {hint && <p className="mt-2 text-xs text-ink-subtle">{hint}</p>}
    </Card>
  );
}
