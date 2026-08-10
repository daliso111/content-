import { cn } from "@/lib/utils";
import { initials } from "@/lib/utils";

type AvatarSize = "xs" | "sm" | "md" | "lg";

const SIZES: Record<AvatarSize, string> = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base",
};

export function Avatar({
  name,
  color,
  size = "md",
  className,
}: {
  name: string;
  color: string;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white",
        SIZES[size],
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/** Overlapping stack of avatars for compact team displays. */
export function AvatarStack({
  people,
  max = 4,
  size = "sm",
}: {
  people: { name: string; avatarColor: string }[];
  max?: number;
  size?: AvatarSize;
}) {
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className="flex items-center -space-x-2">
      {shown.map((p, i) => (
        <Avatar
          key={i}
          name={p.name}
          color={p.avatarColor}
          size={size}
          className="ring-2 ring-surface"
        />
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-surface-muted font-medium text-ink-muted ring-2 ring-surface",
            SIZES[size],
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
