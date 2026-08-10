"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Pagination({
  page,
  pageCount,
  onPageChange,
  totalItems,
  pageSize,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  totalItems?: number;
  pageSize?: number;
}) {
  if (pageCount <= 1 && !totalItems) return null;

  const pages = getPageRange(page, pageCount);
  const from = totalItems && pageSize ? (page - 1) * pageSize + 1 : null;
  const to =
    totalItems && pageSize ? Math.min(page * pageSize, totalItems) : null;

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      {totalItems != null && from != null && (
        <p className="text-sm text-ink-muted">
          Showing <span className="font-medium text-ink">{from}</span>–
          <span className="font-medium text-ink">{to}</span> of{" "}
          <span className="font-medium text-ink">{totalItems}</span>
        </p>
      )}
      <div className="flex items-center gap-1">
        <PageButton
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </PageButton>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`gap-${i}`} className="px-2 text-sm text-ink-subtle">
              …
            </span>
          ) : (
            <PageButton
              key={p}
              onClick={() => onPageChange(p)}
              active={p === page}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
            >
              {p}
            </PageButton>
          ),
        )}
        <PageButton
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-brand bg-brand text-white"
          : "border-border bg-surface text-ink-muted hover:bg-surface-muted hover:text-ink",
        className,
      )}
      {...props}
    />
  );
}

function getPageRange(page: number, count: number): (number | "…")[] {
  if (count <= 7)
    return Array.from({ length: count }, (_, i) => i + 1);
  const range: (number | "…")[] = [1];
  if (page > 3) range.push("…");
  for (let i = Math.max(2, page - 1); i <= Math.min(count - 1, page + 1); i++) {
    range.push(i);
  }
  if (page < count - 2) range.push("…");
  range.push(count);
  return range;
}
