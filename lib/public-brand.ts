import { APP_NAME } from "@/lib/constants";

/**
 * Public-facing identity for marketing and legal pages.
 *
 * Backend identifiers and provider configuration must not depend on these
 * presentation values.
 */
export const PUBLIC_BRAND = {
  name: APP_NAME,
  currentProductName: APP_NAME,
  serviceName: APP_NAME,
  siteUrl: "https://towkn.com",
  // Confirm that this mailbox is provisioned and monitored before publication.
  supportEmail: "support@towkn.com",
  operatorName: "[Insert the service operator's legal name before publication]",
  effectiveDate: "10 August 2026",
  copyrightYear: 2026,
} as const;
