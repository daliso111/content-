import {
  CalendarClock,
  CheckCircle2,
  Send,
  TrendingUp,
} from "lucide-react";
import { PlatformGlyph } from "@/components/ui/PlatformIcon";
import { PLATFORMS } from "@/lib/constants";
import { PUBLIC_BRAND } from "@/lib/public-brand";

/** A lightweight, non-interactive mock of the product UI for the hero. */
export function DashboardPreview() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-pop">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-muted px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-danger/60" />
        <span className="h-3 w-3 rounded-full bg-warning/60" />
        <span className="h-3 w-3 rounded-full bg-success/60" />
        <span className="ml-3 hidden text-xs text-ink-subtle sm:block">
          towkn.com/dashboard
        </span>
      </div>
      <div className="flex">
        {/* mini sidebar */}
        <div className="hidden w-40 shrink-0 border-r border-border p-3 sm:block">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-white">
              <Send className="h-4 w-4 -rotate-12" aria-hidden />
            </span>
            <span className="text-sm font-bold text-ink">{PUBLIC_BRAND.name}</span>
          </div>
          {["Overview", "Create Post", "Calendar", "Approvals", "Analytics"].map(
            (item, i) => (
              <div
                key={item}
                className={`mb-1 rounded-lg px-2.5 py-2 text-xs font-medium ${
                  i === 0
                    ? "bg-brand-soft text-brand-text"
                    : "text-ink-muted"
                }`}
              >
                {item}
              </div>
            ),
          )}
        </div>
        {/* content */}
        <div className="min-w-0 flex-1 p-4">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat icon={<CalendarClock className="h-4 w-4" />} label="Scheduled" value="24" tone="brand" />
            <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Published" value="128" tone="success" />
            <Stat icon={<TrendingUp className="h-4 w-4" />} label="Reach" value="486K" tone="info" />
          </div>
          <div className="rounded-xl border border-border p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold text-ink">
                Upcoming posts
              </span>
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-[10px] font-semibold text-brand-text">
                This week
              </span>
            </div>
            <div className="space-y-2">
              {[
                { p: "instagram" as const, t: "Summer launch teaser" },
                { p: "linkedin" as const, t: "Founder story interview" },
                { p: "tiktok" as const, t: "Monthly content plan reel" },
              ].map((row) => (
                <div key={row.t} className="flex items-center gap-2.5">
                  <span
                    className="flex h-7 w-7 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: PLATFORMS[row.p].color }}
                  >
                    <PlatformGlyph platform={row.p} size="sm" />
                  </span>
                  <span className="flex-1 truncate text-xs text-ink">
                    {row.t}
                  </span>
                  <span className="h-1.5 w-16 rounded-full bg-surface-muted">
                    <span className="block h-full w-2/3 rounded-full bg-brand" />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "brand" | "success" | "info";
}) {
  const toneClass = {
    brand: "bg-brand-soft text-brand-text",
    success: "bg-success-soft text-success",
    info: "bg-info-soft text-info",
  }[tone];
  return (
    <div className="rounded-xl border border-border p-2.5">
      <span className={`inline-flex rounded-lg p-1.5 ${toneClass}`}>{icon}</span>
      <p className="mt-2 text-base font-bold text-ink">{value}</p>
      <p className="text-[10px] text-ink-muted">{label}</p>
    </div>
  );
}
