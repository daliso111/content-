import { cn } from "@/lib/utils";
import type { Tone } from "@/types";

const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink-muted border-border",
  brand: "bg-brand-soft text-brand-text border-brand/20",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  info: "bg-info-soft text-info border-info/20",
};

export interface BadgeProps {
  children: React.ReactNode;
  tone?: Tone;
  /** Show a small leading dot. */
  dot?: boolean;
  className?: string;
}

export function Badge({
  children,
  tone = "neutral",
  dot = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-current"
          aria-hidden
        />
      )}
      {children}
    </span>
  );
}
