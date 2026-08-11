import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/layout/Logo";

/** Split-screen shell shared by the sign-in and sign-up pages. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  const highlights = [
    "Plan a whole month of content in one view",
    "Approve posts before they ever go live",
    "Publish to six platforms from one place",
  ];
  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Form side */}
      <div className="flex flex-1 flex-col px-4 py-8 sm:px-6">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          <Logo />
          <div className="flex flex-1 flex-col justify-center py-10">
            <h1 className="text-2xl font-bold tracking-tight text-ink">
              {title}
            </h1>
            <p className="mt-2 text-sm text-ink-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
          <p className="text-center text-xs text-ink-subtle">
            © 2026 Towkn · Demo build with sample data
          </p>
        </div>
      </div>

      {/* Brand side */}
      <div className="relative hidden w-1/2 max-w-2xl overflow-hidden bg-brand lg:block">
        <div className="absolute inset-0 bg-gradient-to-br from-brand to-brand-hover" />
        <div className="relative flex h-full flex-col justify-center px-14 text-white">
          <blockquote className="text-2xl font-semibold leading-snug">
            “Towkn replaced three tools and a very messy spreadsheet. Our
            approvals finally happen on time.”
          </blockquote>
          <p className="mt-5 text-sm text-white/70">
            Amara O. · Founder, Northwind Agency
          </p>
          <ul className="mt-12 space-y-4">
            {highlights.map((h) => (
              <li key={h} className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-white/90" aria-hidden />
                <span className="text-white/90">{h}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/"
            className="mt-14 text-sm text-white/70 underline-offset-4 hover:text-white hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Disabled placeholder retained until OAuth is implemented in a later stage. */
export function GoogleButton({ label }: { label?: string }) {
  return (
    <button
      type="button"
      disabled
      aria-describedby="google-auth-status"
      className="flex w-full cursor-not-allowed items-center justify-center gap-3 rounded-lg border border-border-strong bg-surface-muted px-4 py-2.5 text-sm font-medium text-ink-subtle opacity-75"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
        />
      </svg>
      {label ?? "Google sign-in coming soon"}
      <span id="google-auth-status" className="sr-only">
        Google authentication is not available yet.
      </span>
    </button>
  );
}
