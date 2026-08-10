import type { Metadata } from "next";
import Link from "next/link";
import {
  PublicList,
  PublicPageShell,
  PublicSection,
} from "@/components/marketing/PublicPageShell";
import { PUBLIC_BRAND } from "@/lib/public-brand";

export const metadata: Metadata = {
  title: { absolute: `Terms of Service | ${PUBLIC_BRAND.name}` },
  description: `Terms governing use of the ${PUBLIC_BRAND.serviceName} social media management service.`,
};

export default function TermsPage() {
  return (
    <PublicPageShell
      eyebrow="Legal"
      title="Terms of Service"
      summary={`These Terms govern access to and use of ${PUBLIC_BRAND.name}, including the ${PUBLIC_BRAND.currentProductName} social media management application.`}
      updatedAt={PUBLIC_BRAND.effectiveDate}
    >
      <PublicSection title="1. Agreement and service operator">
        <p>
          By creating an account or using the service, you agree to these Terms. If you use the service for an organization, you confirm that you are authorized to accept these Terms for that organization.
        </p>
        <p>
          The contracting service operator must be inserted before publication:{" "}
          <strong className="font-semibold text-ink">{PUBLIC_BRAND.operatorName}</strong>.
          “Towkn,” “PostFlow,” “we” and “the service” refer to the service operated by that party.
        </p>
      </PublicSection>

      <PublicSection title="2. Service description">
        <p>
          PostFlow is a software service for creating and storing social content, uploading media, coordinating workspace approvals, scheduling posts, connecting supported social accounts, submitting selected content to third-party platforms and viewing publishing history or operational analytics.
        </p>
        <p>
          Features may differ by account, provider, platform permissions or product stage. A feature shown as planned, experimental or “coming soon” is not part of the currently available service.
        </p>
      </PublicSection>

      <PublicSection title="3. Accounts and workspace responsibility">
        <PublicList>
          <li>You must provide accurate account information and keep it current.</li>
          <li>You are responsible for safeguarding your sign-in credentials and connected provider accounts.</li>
          <li>You are responsible for activity performed through your account unless you promptly report unauthorized use.</li>
          <li>Workspace owners and administrators are responsible for assigning suitable roles and removing access when it is no longer required.</li>
          <li>You must have authority to connect every social account, invite team members and act for each workspace you manage.</li>
        </PublicList>
      </PublicSection>

      <PublicSection title="4. Connected third-party platforms">
        <p>
          Connecting a platform authorizes the service to use the permissions you approve through that provider’s OAuth flow. You remain responsible for complying with the provider’s terms, policies, content rules and account requirements.
        </p>
        <p>
          Meta, Google/YouTube, TikTok and other providers are independent services. We do not control their authorization screens, API changes, reviews, outages, content moderation, account restrictions or decisions to accept, reject, remove or alter content.
        </p>
      </PublicSection>

      <PublicSection title="5. Your content and publishing authorization">
        <p>
          You retain ownership of content you create or upload, subject to any rights belonging to other people. You grant us a limited, non-exclusive permission to store, process, format and transmit that content only as reasonably needed to operate the service, support your workspace and publish to destinations you select.
        </p>
        <p>
          When you select a destination and request publishing, you authorize the service to submit the latest eligible saved version of the content to that account. You confirm that you have all permissions, licenses, releases and rights necessary for the content, media, music, names, trademarks and personal information involved.
        </p>
      </PublicSection>

      <PublicSection title="6. Scheduling and publishing">
        <p>
          Scheduling records your requested publication time and queues work according to the service’s available workflow. Scheduled or immediate publishing is not guaranteed to occur at an exact time. Provider downtime, API limits, token expiry, connection changes, media processing, network failures and review requirements may delay or prevent publication.
        </p>
        <p>
          You should review important posts on the destination platform. Do not rely on PostFlow as the only record of time-sensitive, regulated or legally required communications.
        </p>
      </PublicSection>

      <PublicSection title="7. Acceptable use">
        <p>You may not use the service to:</p>
        <PublicList>
          <li>break applicable law or another person’s rights;</li>
          <li>publish content you do not have authority to use;</li>
          <li>send spam, deceptive campaigns, unlawful promotions or abusive content;</li>
          <li>distribute malware, attempt credential theft or compromise accounts;</li>
          <li>evade provider restrictions, rate limits, reviews or access controls;</li>
          <li>probe, disrupt, overload or reverse engineer protected parts of the service, except where applicable law expressly permits it;</li>
          <li>share access in a way that defeats workspace permissions or account limits; or</li>
          <li>use the service in a way that creates unreasonable security, operational or legal risk.</li>
        </PublicList>
      </PublicSection>

      <PublicSection title="8. Suspension and restrictions">
        <p>
          We may restrict or suspend access where reasonably necessary to address suspected unauthorized access, prohibited use, threats to the service or other users, provider requirements, legal obligations, or material breach of these Terms. Where practical, we will provide notice and an opportunity to resolve the issue.
        </p>
        <p>Provider account suspension does not necessarily suspend your PostFlow account, but it may make the affected connection unusable.</p>
      </PublicSection>

      <PublicSection title="9. Our intellectual property">
        <p>
          The service, interface, software, documentation, branding and related materials are owned by the service operator or its licensors. These Terms give you a limited right to use the service; they do not transfer ownership of the service or permit use of our trademarks without permission.
        </p>
        <p>Feedback may be used to improve the service without an obligation to adopt or compensate for it, provided we do not claim ownership of your underlying content.</p>
      </PublicSection>

      <PublicSection title="10. Third-party services and availability">
        <p>
          The service depends on Supabase and third-party social platforms. Their APIs, limits, scopes and terms can change without our control. We may change, limit or remove an integration when needed to comply with provider requirements, protect users or maintain the service.
        </p>
        <p>We do not guarantee uninterrupted operation, permanent availability of any integration, or that every provider will accept or continue displaying submitted content.</p>
      </PublicSection>

      <PublicSection title="11. Disclaimers">
        <p>
          The service is provided on an “as available” basis. To the extent permitted by applicable law, we do not make warranties that the service will be uninterrupted, error-free, secure against every threat, suitable for a particular legal or business purpose, or compatible with every provider change.
        </p>
        <p>Nothing in these Terms excludes warranties or protections that cannot lawfully be excluded.</p>
      </PublicSection>

      <PublicSection title="12. Limitation of liability">
        <p>
          To the extent permitted by applicable law, the service operator will not be responsible for indirect, incidental, special or consequential losses, lost opportunities, lost profits, reputational harm, or losses caused by third-party platform decisions, except where such liability cannot lawfully be limited.
        </p>
        <p>
          Any overall liability limit, governing subscription terms or legally required exceptions should be stated in the applicable order, plan terms or a later owner-approved revision. These Terms do not attempt to waive liability that applicable law does not allow to be waived.
        </p>
      </PublicSection>

      <PublicSection title="13. Service changes">
        <p>
          We may update the service and these Terms as features, providers or operating requirements change. If a change materially affects existing use, we may provide notice through the service or available account contact details. Continued use after revised Terms take effect means you accept them, where permitted by law.
        </p>
      </PublicSection>

      <PublicSection title="14. Termination">
        <p>
          You may stop using the service and request account deletion through the{" "}
          <Link href="/support" className="font-medium text-brand-text underline-offset-4 hover:underline">Support page</Link>.
          You should disconnect provider accounts and export any information you need before termination where export is available.
        </p>
        <p>
          Following termination, access may end and information may be deleted or retained as described in the Privacy Policy. Terms that by their nature should continue—such as ownership, disclaimers, liability limitations and responsibility for prior use—remain applicable.
        </p>
      </PublicSection>

      <PublicSection title="15. Governing terms placeholder">
        <p>
          <strong className="font-semibold text-ink">[Insert the governing law and dispute forum approved by the service owner before publication.]</strong>{" "}
          No jurisdiction has been selected or represented in this draft.
        </p>
      </PublicSection>

      <PublicSection title="16. Contact">
        <p>
          Questions about these Terms may be sent to{" "}
          <a className="font-medium text-brand-text underline-offset-4 hover:underline" href={`mailto:${PUBLIC_BRAND.supportEmail}`}>
            {PUBLIC_BRAND.supportEmail}
          </a>{" "}
          or submitted through the <Link href="/support" className="font-medium text-brand-text underline-offset-4 hover:underline">Support page</Link>.
        </p>
      </PublicSection>
    </PublicPageShell>
  );
}

