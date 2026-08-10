import type { ReactNode } from "react";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingNav } from "@/components/marketing/MarketingNav";

export function PublicPageShell({
  eyebrow,
  title,
  summary,
  updatedAt,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: string;
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <MarketingNav />
      <main>
        <header className="border-b border-border bg-surface">
          <div className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
            <p className="text-sm font-semibold text-brand-text">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-5xl">{title}</h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-ink-muted sm:text-lg">{summary}</p>
            {updatedAt && <p className="mt-4 text-sm text-ink-subtle">Effective date: {updatedAt}</p>}
          </div>
        </header>
        <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
          <article className="space-y-10 text-[15px] leading-7 text-ink-muted">{children}</article>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

export function PublicSection({
  title,
  children,
  id,
}: {
  title: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h2>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

export function PublicList({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-2 pl-6 marker:text-brand-text">{children}</ul>;
}
