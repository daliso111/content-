import { APP_NAME } from "@/lib/constants";

/**
 * Public-facing identity for marketing and legal pages.
 *
 * Keep the current in-app name separate while the product transitions from
 * PostFlow to Towkn. Backend identifiers and provider configuration must not
 * depend on these presentation values.
 */
export const PUBLIC_BRAND = {
  name: "Towkn",
  currentProductName: APP_NAME,
  serviceName: `Towkn / ${APP_NAME}`,
  siteUrl: "https://towkn.com",
  // Confirm that this mailbox is provisioned and monitored before publication.
  supportEmail: "support@towkn.com",
  operatorName: "[Insert the service operator's legal name before publication]",
  effectiveDate: "10 August 2026",
  copyrightYear: 2026,
} as const;
