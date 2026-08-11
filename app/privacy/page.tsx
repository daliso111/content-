import type { Metadata } from "next";
import Link from "next/link";
import {
  PublicList,
  PublicPageShell,
  PublicSection,
} from "@/components/marketing/PublicPageShell";
import { PUBLIC_BRAND } from "@/lib/public-brand";

export const metadata: Metadata = {
  title: { absolute: `Privacy Policy | ${PUBLIC_BRAND.name}` },
  description: `How ${PUBLIC_BRAND.serviceName} collects, uses and protects information for its social media management service.`,
};

export default function PrivacyPage() {
  return (
    <PublicPageShell
      eyebrow="Legal"
      title="Privacy Policy"
      summary={`This policy explains how ${PUBLIC_BRAND.currentProductName} handles information when you use the social media management service.`}
      updatedAt={PUBLIC_BRAND.effectiveDate}
    >
      <PublicSection title="1. Scope and service operator">
        <p>
          This Privacy Policy applies to the website at {PUBLIC_BRAND.siteUrl}, the
          Towkn application, and related support interactions. In this policy,
          “Towkn,” “we,” “us” and “the service” refer to that service.
        </p>
        <p>
          The service operator is currently identified for publication as{" "}
          <strong className="font-semibold text-ink">{PUBLIC_BRAND.operatorName}</strong>.
          The owner must replace this placeholder before publishing the policy.
        </p>
      </PublicSection>

      <PublicSection title="2. Information we handle">
        <p>Depending on how you use the service, we may handle the following categories of information:</p>
        <PublicList>
          <li>
            <strong className="font-semibold text-ink">Account registration data:</strong>{" "}
            your name, email address, profile details, authentication records and information needed to maintain your session.
          </li>
          <li>
            <strong className="font-semibold text-ink">Workspace and team information:</strong>{" "}
            workspace names, memberships, roles, invitations, approval assignments, comments and team activity.
          </li>
          <li>
            <strong className="font-semibold text-ink">Connected social accounts:</strong>{" "}
            provider account identifiers, Page or channel names, usernames, profile images, account types, connection status and the relationship between linked accounts, such as an Instagram Professional account linked to a Facebook Page.
          </li>
          <li>
            <strong className="font-semibold text-ink">OAuth permissions:</strong>{" "}
            the permissions granted through Meta, Google/YouTube or another supported provider, together with token type and expiry information where supplied by that provider.
          </li>
          <li>
            <strong className="font-semibold text-ink">Content and media:</strong>{" "}
            captions, titles, platform settings, drafts, uploaded images and videos, scheduled publishing times, approval state and selected destinations.
          </li>
          <li>
            <strong className="font-semibold text-ink">Publishing and operational records:</strong>{" "}
            publishing jobs, attempts, provider identifiers, success or failure status, safe error codes, scheduling history and operational analytics derived from Towkn activity.
          </li>
          <li>
            <strong className="font-semibold text-ink">Support and technical information:</strong>{" "}
            messages you send to support and limited technical, diagnostic or security information needed to operate and troubleshoot the service.
          </li>
        </PublicList>
      </PublicSection>

      <PublicSection title="3. How we use information">
        <p>We use information to provide and operate the features you request, including to:</p>
        <PublicList>
          <li>create accounts, workspaces and team memberships;</li>
          <li>connect and refresh selected social media accounts;</li>
          <li>store drafts and media, coordinate approvals, and schedule or publish selected content;</li>
          <li>maintain publishing history and show operational analytics;</li>
          <li>protect workspaces, enforce access controls, investigate failures and prevent misuse;</li>
          <li>respond to support, privacy and deletion requests; and</li>
          <li>maintain and improve the reliability and usability of the service.</li>
        </PublicList>
        <p>
          We do not use provider access merely because an account exists. Provider requests are made to support account discovery, refresh, publishing or another feature initiated or configured through the service.
        </p>
      </PublicSection>

      <PublicSection title="4. OAuth permissions and provider credentials">
        <p>
          When you connect a social account, the provider presents its own authorization screen. The permissions displayed there control what Towkn may request through that provider’s API. You should review those permissions before approving them.
        </p>
        <p>
          Access tokens, refresh tokens and similar provider credentials may be stored in encrypted form so the service can maintain a connection and carry out authorized publishing. Credential decryption and provider API calls are designed to occur in Supabase Edge Functions or other server-side service components. Provider credentials, service-role keys and encryption keys are not intentionally returned to browser-facing account responses.
        </p>
        <p>
          No security measure is infallible. If you believe a connection or account has been compromised, disconnect it in Towkn, review the provider’s own security settings and contact support.
        </p>
      </PublicSection>

      <PublicSection title="5. Infrastructure and third-party platforms">
        <p>We rely on service providers and social platforms to operate Towkn:</p>
        <PublicList>
          <li>
            <strong className="font-semibold text-ink">Supabase</strong> provides application infrastructure used for authentication, database storage, media storage and server-side Edge Functions.
          </li>
          <li>
            <strong className="font-semibold text-ink">Meta</strong> provides APIs for supported Facebook Pages and Instagram Professional accounts.
          </li>
          <li>
            <strong className="font-semibold text-ink">Google and YouTube</strong> provide OAuth, channel discovery and YouTube publishing APIs.
          </li>
          <li>
            <strong className="font-semibold text-ink">TikTok and other platforms</strong> may process information if a related integration becomes available and you choose to connect or publish through it.
          </li>
        </PublicList>
        <p>
          These providers process information under their own terms and privacy policies. Content selected for publishing, account identifiers and necessary API request data are sent to the relevant provider. Provider availability and handling are outside our direct control.
        </p>
      </PublicSection>

      <PublicSection title="6. Storage and retention">
        <p>
          Account, workspace, content, media, scheduling and publishing records are generally retained while they are needed to operate the service, preserve workspace history, address security or support issues, and meet legitimate legal or operational needs. Different records may be retained for different periods. We do not state a fixed retention period because one has not yet been formally adopted for every category.
        </p>
        <p>
          Deleted information may remain temporarily in backups, logs or systems operated by service providers. Content already sent to a social platform is governed by that platform and is not removed from the platform merely because it is deleted from Towkn.
        </p>
      </PublicSection>

      <PublicSection title="7. Disconnecting social accounts">
        <p>
          Disconnecting a social account removes Towkn’s stored connection credential and prevents that account from being used for new publishing through the workspace. Existing drafts, media, publishing history and operational records may remain so the workspace retains an accurate record of prior activity.
        </p>
        <p>
          Disconnecting inside Towkn may not revoke provider-wide authorization. Where needed, you can also revoke the application through the security or connected-app settings offered by Meta, Google/YouTube or the relevant provider.
        </p>
      </PublicSection>

      <PublicSection title="8. Deletion, access and correction requests">
        <p>
          You may request access to, correction of or deletion of information associated with your account by visiting the{" "}
          <Link href="/support" className="font-medium text-brand-text underline-offset-4 hover:underline">Support page</Link>{" "}
          and contacting us from the email address associated with your account. We may need to verify your identity and workspace authority before acting on a request.
        </p>
        <p>
          Some information may need to be retained where deletion would affect another workspace member’s records, compromise security or publishing history, or conflict with an applicable legal obligation. We will explain material limitations that apply to a request rather than promising deletion that the service cannot safely perform.
        </p>
      </PublicSection>

      <PublicSection title="9. Security practices">
        <p>
          Towkn uses measures intended to reduce unauthorized access, including encrypted provider credentials, private credential storage, server-side service-role access, workspace-based authorization, row-level security policies and restricted provider operations. We also limit browser-facing account data so credentials are not intentionally included.
        </p>
        <p>
          These practices reduce risk but do not guarantee absolute security, uninterrupted availability or protection against every threat. Users are responsible for protecting their passwords, email accounts and connected provider accounts.
        </p>
      </PublicSection>

      <PublicSection title="10. Your choices and rights">
        <p>
          Depending on your location and applicable law, you may have rights concerning access, correction, deletion, restriction, objection or portability. The availability and scope of those rights vary. You may also disconnect provider accounts, change workspace permissions, remove content you control and revoke OAuth access through the provider.
        </p>
        <p>Contact support to make a request. We will assess it based on the account, workspace context and applicable requirements.</p>
      </PublicSection>

      <PublicSection title="11. Changes to this policy">
        <p>
          We may update this policy as the product, providers or handling practices change. The effective date at the top will be updated when a revised version is published. Material changes may also be communicated in the application or through available account contact details where appropriate.
        </p>
      </PublicSection>

      <PublicSection title="12. Contact">
        <p>
          For privacy questions, account deletion requests or concerns about connected social accounts, email{" "}
          <a className="font-medium text-brand-text underline-offset-4 hover:underline" href={`mailto:${PUBLIC_BRAND.supportEmail}`}>
            {PUBLIC_BRAND.supportEmail}
          </a>{" "}
          or use the <Link href="/support" className="font-medium text-brand-text underline-offset-4 hover:underline">Support page</Link>.
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}
