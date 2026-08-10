import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  LayoutDashboard,
  PenSquare,
  Sparkles,
  Users,
  ShieldCheck,
  BarChart3,
} from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { DashboardPreview } from "@/components/marketing/DashboardPreview";
import { Button } from "@/components/ui/Button";
import { PlatformGlyph } from "@/components/ui/PlatformIcon";
import { PLATFORM_LIST } from "@/lib/constants";
import { PUBLIC_BRAND } from "@/lib/public-brand";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-canvas">
      <MarketingNav />
      <Hero />
      <PlatformStrip />
      <Features />
      <HowItWorks />
      <AgencySection />
      <CtaSection />
      <MarketingFooter />
    </div>
  );
}

/* ----------------------------------------------------------------- Hero */
function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-b from-brand-soft/70 to-transparent"
        aria-hidden
      />
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-ink-muted shadow-sm">
            <Sparkles className="h-3.5 w-3.5 text-brand-text" aria-hidden />
            One workspace for your whole social workflow
          </span>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-ink sm:text-5xl md:text-6xl">
            Plan, approve and publish your social content from one place.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-ink-muted">
            Create content, organise campaigns and schedule posts across multiple
            social-media platforms using one simple workspace.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/dashboard/create">
              <Button size="lg">
                Start Creating
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </Link>
            <Link href="/dashboard">
              <Button size="lg" variant="outline">
                <LayoutDashboard className="h-4 w-4" aria-hidden />
                View Dashboard
              </Button>
            </Link>
          </div>
          <p className="mt-4 text-sm text-ink-subtle">
            No credit card required · Free 14-day trial
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-4xl">
          <DashboardPreview />
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- Platform strip */
function PlatformStrip() {
  return (
    <section className="border-y border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <p className="text-center text-sm font-medium text-ink-subtle">
          Publish everywhere your audience is
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          {PLATFORM_LIST.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-2 text-ink-muted transition-colors hover:text-ink"
            >
              <span style={{ color: p.color }}>
                <PlatformGlyph platform={p.id} size="lg" />
              </span>
              <span className="text-sm font-semibold">{p.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- Features */
const FEATURES = [
  {
    icon: PenSquare,
    title: "Compose once, tailor everywhere",
    body: "Write a single caption, then fine-tune it per platform with live previews for Instagram, Facebook, LinkedIn, TikTok and X.",
  },
  {
    icon: CalendarCheck,
    title: "Visual scheduling calendar",
    body: "Drag your month into shape. See every draft, scheduled and published post across platforms in one colour-coded calendar.",
  },
  {
    icon: ShieldCheck,
    title: "Built-in approval flows",
    body: "Send content for review, collect feedback and approve with a click. Nothing goes live until the right people sign off.",
  },
  {
    icon: Users,
    title: "Team roles & permissions",
    body: "Owners, managers, designers, approvers and viewers each get exactly the access they need — nothing more.",
  },
  {
    icon: BarChart3,
    title: "Clear performance analytics",
    body: "Track reach, engagement and growth over time, and learn which platforms and content types actually perform.",
  },
  {
    icon: Sparkles,
    title: "AI assist (coming soon)",
    body: "Generate caption ideas, hashtags and variations in seconds — a placeholder today, ready for real AI later.",
  },
];

function Features() {
  return (
    <section id="features" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="Features"
          title="Everything you need to run social content"
          subtitle={`From first draft to published post, ${PUBLIC_BRAND.name} keeps your whole team moving in one organised workspace.`}
        />
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-surface p-6 shadow-card transition-shadow hover:shadow-card-hover"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
                <f.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold text-ink">
                {f.title}
              </h3>
              <p className="mt-2 text-sm text-ink-muted">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- How it works */
const STEPS = [
  {
    title: "Create & organise",
    body: "Draft posts, upload media and group everything into campaigns. Tailor each caption per platform with live previews.",
  },
  {
    title: "Review & approve",
    body: "Submit content for approval, leave feedback and sign off — so every post is on-brand before it ships.",
  },
  {
    title: "Schedule & publish",
    body: `Drop approved posts onto the calendar, pick the perfect time and let ${PUBLIC_BRAND.name} handle publishing across platforms.`,
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-16 bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="How it works"
          title="From idea to published in three steps"
          subtitle="A calm, repeatable workflow your whole team can follow."
        />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="relative rounded-2xl border border-border bg-canvas p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-base font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-4 text-base font-semibold text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-sm text-ink-muted">{step.body}</p>
              {i < STEPS.length - 1 && (
                <ArrowRight
                  className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 text-border-strong md:block"
                  aria-hidden
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------- Agency section */
function AgencySection() {
  const points = [
    "Manage unlimited client workspaces from one login",
    "Give clients a clean approval experience — no logins to juggle",
    "Assign roles so designers, managers and clients see the right view",
    "Report on performance per client with white-label-ready analytics",
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="grid items-center gap-12 lg:grid-cols-2">
        <div>
          <span className="text-sm font-semibold text-brand-text">
            For agencies
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Built for agencies managing many brands
          </h2>
          <p className="mt-4 text-lg text-ink-muted">
            Keep every client organised, keep approvals moving, and give your team
            a single source of truth for social — however many brands you run.
          </p>
          <ul className="mt-6 space-y-3">
            {points.map((p) => (
              <li key={p} className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-success"
                  aria-hidden
                />
                <span className="text-sm text-ink">{p}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Link href="/sign-up">
              <Button size="lg">
                Start free trial
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </Link>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-gradient-to-br from-brand-soft to-surface p-8 shadow-card">
          <div className="grid grid-cols-2 gap-4">
            {[
              { k: "3", v: "Client workspaces" },
              { k: "128", v: "Posts published" },
              { k: "92%", v: "On-time rate" },
              { k: "6", v: "Team members" },
            ].map((stat) => (
              <div
                key={stat.v}
                className="rounded-xl border border-border bg-surface p-5 text-center shadow-sm"
              >
                <p className="text-3xl font-bold text-ink">{stat.k}</p>
                <p className="mt-1 text-xs text-ink-muted">{stat.v}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- CTA */
function CtaSection() {
  return (
    <section id="pricing" className="scroll-mt-16 px-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-3xl bg-brand px-6 py-16 text-center shadow-pop sm:px-12">
        <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ready to bring order to your social content?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
          Start free today. Simple, transparent pricing arrives soon — for now,
          explore the full workspace with realistic sample data.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/sign-up">
            <Button
              size="lg"
              className="bg-white text-brand-text hover:bg-white/90"
            >
              Start Free
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-white hover:bg-white/10"
            >
              View Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- shared bits */
function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-sm font-semibold text-brand-text">{eyebrow}</span>
      <h2 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-lg text-ink-muted">{subtitle}</p>
    </div>
  );
}
