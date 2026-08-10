"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusCircle, HelpCircle } from "lucide-react";
import { Logo } from "./Logo";
import { NAV_ITEMS } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * Desktop sidebar. Collapses to an icon rail when `collapsed` is true.
 * The active route is highlighted by matching the current pathname.
 */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "hidden shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 lg:flex",
        collapsed ? "w-[76px]" : "w-64",
      )}
    >
      <div
        className={cn(
          "flex h-16 items-center border-b border-border px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Logo compact={collapsed} />
      </div>

      <div className="px-3 py-4">
        <Link
          href="/dashboard/create"
          className={cn(
            "flex items-center gap-2 rounded-xl bg-brand px-3 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-hover",
            collapsed && "justify-center px-0",
          )}
          title="Create Post"
        >
          <PlusCircle className="h-5 w-5 shrink-0" aria-hidden />
          {!collapsed && "Create Post"}
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={isActive(pathname, item.href)}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <Link
          href="/support"
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink",
            collapsed && "justify-center px-0",
          )}
          title="Help & support"
        >
          <HelpCircle className="h-5 w-5 shrink-0" aria-hidden />
          {!collapsed && "Help & support"}
        </Link>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  active,
  collapsed,
  onClick,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  collapsed?: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
        collapsed && "justify-center px-0",
        active
          ? "bg-brand-soft text-brand-text"
          : "text-ink-muted hover:bg-surface-muted hover:text-ink",
      )}
    >
      <Icon
        className={cn(
          "h-5 w-5 shrink-0",
          active ? "text-brand-text" : "text-ink-subtle group-hover:text-ink",
        )}
        aria-hidden
      />
      {!collapsed && <span className="flex-1">{item.label}</span>}
      {!collapsed && item.badge && (
        <span className="rounded-full bg-warning-soft px-1.5 py-0.5 text-xs font-semibold text-warning">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

/** Overview is only active on an exact match; others match their subtree. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export { NavLink };
