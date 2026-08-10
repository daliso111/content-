"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

/** Compact labelled select used across filter bars. */
export function FilterSelect({
  value,
  onChange,
  options,
  label,
  className,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={cn("relative", className)}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        disabled={disabled}
        className="h-9 cursor-pointer appearance-none rounded-lg border border-border bg-surface pl-3 pr-8 text-sm font-medium text-ink transition-colors hover:bg-surface-muted focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {label ? `${label}: ${o.label}` : o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle"
        aria-hidden
      />
    </div>
  );
}

/** Two-option segmented control (e.g. grid/table view). */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label?: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-border bg-surface-muted p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            aria-label={o.label}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {o.icon}
            {o.label && <span>{o.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
