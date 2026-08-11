import type { Metadata } from "next";
import Link from "next/link";
import { Cable, FileWarning, Send, ShieldCheck } from "lucide-react";
import {
  PublicList,
  PublicPageShell,
  PublicSection,
} from "@/components/marketing/PublicPageShell";
import { PUBLIC_BRAND } from "@/lib/public-brand";

export const metadata: Metadata = {
  title: { absolute: `Support | ${PUBLIC_BRAND.name}` },
  description: `Get help with ${PUBLIC_BRAND.serviceName} account connections, publishing, privacy requests and account deletion.`,
};

const SUPPORT_AREAS = [
  {
    icon: Cable,
    title: "Account connections",
    body: "Help connecting, refreshing or disconnecting Facebook Pages, Instagram Professional accounts and YouTube channels.",
  },
  {
    icon: Send,
    title: "Publishing",
    body: "Help with drafts, approvals, schedules, queued publishing work and safe provider error messages.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy and deletion",
    body: "Requests to access, correct or delete account information, and questions about provider credentials or retained records.",
  },
];

export default function SupportPage() {
  return (
    <PublicPageShell
      eyebrow="Help"
      title="Support"
      summary={`Get assistance with your ${PUBLIC_BRAND.currentProductName} workspace, connected social accounts, publishing activity, privacy questions or account deletion.`}
    >
      <section className="grid gap-5 sm:grid-cols-3" aria-label="Support topics">
        {SUPPORT_AREAS.map((area) => (
          <div key={area.title} className="rounded-2xl border border-border bg-surface p-5 shadow-card">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
              <area.icon className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-4 text-base font-semibold text-ink">{area.title}</h2>
            <p className="mt-2 text-sm leading-6 text-ink-muted">{area.body}</p>
          </div>
        ))}
      </section>

      <PublicSection title="Contact support">
        <div className="rounded-2xl border border-brand/20 bg-brand-soft/60 p-6 sm:p-8">
          <p className="text-base text-ink">
            Email{" "}
            <a className="font-semibold text-brand-text underline-offset-4 hover:underline" href={`mailto:${PUBLIC_BRAND.supportEmail}`}>
              {PUBLIC_BRAND.supportEmail}
            </a>
          </p>
          <p className="mt-2 text-sm leading-6 text-ink-muted">
            Use the email address associated with your Towkn account when possible. Include your workspace name, the affected platform and a concise description of what happened.
          </p>
        </div>
      </PublicSection>

      <PublicSection title="Information that helps us investigate">
        <PublicList>
          <li>your workspace name and the page or screen where the issue occurred;</li>
          <li>the social platform involved and the visible account or channel name;</li>
          <li>the approximate date and time of the problem, including your timezone;</li>
          <li>the safe error code shown by Towkn, if one appears; and</li>
          <li>the steps you took before the problem occurred.</li>
        </PublicList>
        <div className="flex gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4">
          <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />
          <p className="text-sm leading-6 text-ink-muted">
            Never send passwords, OAuth authorization codes, access tokens, refresh tokens, service-role keys, encryption keys or complete authentication headers. Support does not need them to begin an investigation.
          </p>
        </div>
      </PublicSection>

      <PublicSection title="Account connection help">
        <PublicList>
          <li>Confirm you are signed into the intended provider account and have authority over the Page or channel.</li>
          <li>Open Social Accounts and try Refresh before reconnecting.</li>
          <li>Review the provider’s authorization screen and grant only the permissions required for the features you want to use.</li>
          <li>If you disconnect in Towkn, remember that provider-wide authorization may still need to be revoked separately in the provider’s settings.</li>
        </PublicList>
      </PublicSection>

      <PublicSection title="Publishing help">
        <PublicList>
          <li>Confirm the destination still shows Connected.</li>
          <li>Check that the post meets the selected platform’s media, title and caption requirements.</li>
          <li>Allow queued or scheduled work time to progress before submitting the same post again.</li>
          <li>Check the Posts page for a safe failure message and verify the final result directly on the provider platform.</li>
        </PublicList>
      </PublicSection>

      <PublicSection title="Privacy and account deletion requests">
        <p>
          Email {PUBLIC_BRAND.supportEmail} from the address associated with your account and clearly state whether you are requesting access, correction, account deletion or workspace-related deletion. We may ask you to verify your identity and authority over the affected workspace.
        </p>
        <p>
          Deleting a Towkn account does not automatically remove content already published to Meta, YouTube or another provider. Remove that content through the provider where necessary. See the{" "}
          <Link href="/privacy" className="font-medium text-brand-text underline-offset-4 hover:underline">Privacy Policy</Link>{" "}
          for information about retention and disconnection.
        </p>
      </PublicSection>

      <PublicSection title="Legal information">
        <p>
          Review the <Link href="/privacy" className="font-medium text-brand-text underline-offset-4 hover:underline">Privacy Policy</Link>{" "}
          and <Link href="/terms" className="font-medium text-brand-text underline-offset-4 hover:underline">Terms of Service</Link>{" "}
          for information about data handling, connected providers and use of the service.
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}
