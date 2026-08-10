"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, PlusCircle } from "lucide-react";
import { Logo } from "./Logo";
import { NAV_ITEMS } from "@/lib/navigation";
import { isActive } from "./Sidebar";
import { cn } from "@/lib/utils";

/** Slide-in navigation drawer for mobile/tablet. */
export function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-ink/40 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-pop animate-slide-in-right">
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Logo />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation"
            className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="p-3">
          <Link
            href="/dashboard/create"
            onClick={onClose}
            className="flex items-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-medium text-white"
          >
            <PlusCircle className="h-5 w-5" aria-hidden /> Create Post
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Main">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-soft text-brand-text"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-warning">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
