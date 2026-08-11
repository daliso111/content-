import Link from "next/link";
import { Send } from "lucide-react";
import { Logo } from "@/components/layout/Logo";
import { PUBLIC_BRAND } from "@/lib/public-brand";

const PRODUCT_LINKS = [
  { label: "Features", href: "/#features" },
  { label: "How It Works", href: "/#how-it-works" },
  { label: "Pricing", href: "/#pricing" },
  { label: "Dashboard", href: "/dashboard" },
];

const PUBLIC_LINKS = [
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Support", href: "/support" },
];

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Logo brandName={PUBLIC_BRAND.name} />
            <p className="mt-3 max-w-md text-sm text-ink-muted">
              The calm social workspace for planning, approvals, scheduling and
              publishing.
            </p>
          </div>
          <FooterColumn title="Product" links={PRODUCT_LINKS} />
          <FooterColumn title="Legal & support" links={PUBLIC_LINKS} />
        </div>
        <div className="mt-10 flex flex-col justify-between gap-3 border-t border-border pt-6 sm:flex-row sm:items-center">
          <p className="flex items-center gap-1.5 text-sm text-ink-subtle">
            <Send className="h-4 w-4" aria-hidden /> © {PUBLIC_BRAND.copyrightYear} {PUBLIC_BRAND.name}.
            All rights reserved.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-subtle">
            {PUBLIC_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-ink">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: ReadonlyArray<{ label: string; href: string }>;
}) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="text-sm text-ink-muted transition-colors hover:text-ink">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
