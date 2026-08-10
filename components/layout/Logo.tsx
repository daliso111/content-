import Link from "next/link";
import { Send } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Product logo — swap the mark and {APP_NAME} here to rebrand everywhere.
 */
export function Logo({
  href = "/",
  className,
  compact = false,
  brandName = APP_NAME,
}: {
  href?: string;
  className?: string;
  compact?: boolean;
  brandName?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2.5", className)}
      aria-label={`${brandName} home`}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-white shadow-sm">
        <Send className="h-5 w-5 -rotate-12" aria-hidden />
      </span>
      {!compact && (
        <span className="text-lg font-bold tracking-tight text-ink">
          {brandName}
        </span>
      )}
    </Link>
  );
}
