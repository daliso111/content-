import { cn } from "@/lib/utils";

/** Shimmering placeholder block used for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-border/70",
        className,
      )}
      aria-hidden
    />
  );
}

/** A card-shaped skeleton used on list/grid pages while data "loads". */
export function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <Skeleton className="mb-4 h-32 w-full rounded-xl" />
      <Skeleton className="mb-2 h-3.5 w-3/4" />
      <Skeleton className="mb-4 h-3.5 w-1/2" />
      <div className="flex gap-2">
        <Skeleton className="h-6 w-6 rounded-lg" />
        <Skeleton className="h-6 w-6 rounded-lg" />
      </div>
    </div>
  );
}
