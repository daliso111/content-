import type {
  ApprovalState,
  ConnectionStatus,
  MediaType,
  PostStatus,
  SocialPlatform,
  TeamRole,
  Tone,
} from "@/types";

/* ------------------------------------------------------------------ */
/* Product identity — change these two values to rebrand the product.  */
/* ------------------------------------------------------------------ */
export const APP_NAME = "PostFlow";
export const APP_TAGLINE =
  "Plan, approve and publish your social content from one place.";

/* ------------------------------------------------------------------ */
/* Platform metadata                                                   */
/* ------------------------------------------------------------------ */
export interface PlatformMeta {
  id: SocialPlatform;
  label: string;
  /** Brand colour used for icons/accents. */
  color: string;
  /** Soft background tint for chips. */
  soft: string;
  charLimit: number;
  handlePrefix: string;
}

export const PLATFORMS: Record<SocialPlatform, PlatformMeta> = {
  facebook: {
    id: "facebook",
    label: "Facebook",
    color: "#1877F2",
    soft: "#E8F1FE",
    charLimit: 63206,
    handlePrefix: "",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    color: "#E4405F",
    soft: "#FDECF1",
    charLimit: 2200,
    handlePrefix: "@",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    color: "#0A66C2",
    soft: "#E7F0F9",
    charLimit: 3000,
    handlePrefix: "",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    color: "#111827",
    soft: "#EEF0F3",
    charLimit: 2200,
    handlePrefix: "@",
  },
  youtube: {
    id: "youtube",
    label: "YouTube",
    color: "#FF0000",
    soft: "#FDEAEA",
    charLimit: 5000,
    handlePrefix: "@",
  },
  x: {
    id: "x",
    label: "X",
    color: "#111827",
    soft: "#EEF0F3",
    charLimit: 280,
    handlePrefix: "@",
  },
};

export const PLATFORM_LIST: PlatformMeta[] = Object.values(PLATFORMS);

/* ------------------------------------------------------------------ */
/* Status metadata                                                     */
/* ------------------------------------------------------------------ */
export const POST_STATUS_META: Record<
  PostStatus,
  { label: string; tone: Tone }
> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending Approval", tone: "warning" },
  approved: { label: "Approved", tone: "info" },
  scheduled: { label: "Scheduled", tone: "brand" },
  publishing: { label: "Publishing", tone: "info" },
  published: { label: "Published", tone: "success" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const APPROVAL_STATE_META: Record<
  ApprovalState,
  { label: string; tone: Tone }
> = {
  awaiting: { label: "Awaiting Approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  changes_requested: { label: "Changes Requested", tone: "info" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const CONNECTION_STATUS_META: Record<
  ConnectionStatus,
  { label: string; tone: Tone }
> = {
  connected: { label: "Connected", tone: "success" },
  disconnected: { label: "Not connected", tone: "neutral" },
  pending: { label: "Pending", tone: "info" },
  reconnect_required: { label: "Needs reconnect", tone: "warning" },
  expired: { label: "Expired", tone: "danger" },
  error: { label: "Connection error", tone: "danger" },
};

export const MEDIA_TYPE_META: Record<MediaType, { label: string }> = {
  image: { label: "Images" },
  video: { label: "Videos" },
  graphic: { label: "Graphics" },
  logo: { label: "Logos" },
  document: { label: "Documents" },
};

/* ------------------------------------------------------------------ */
/* Team roles                                                          */
/* ------------------------------------------------------------------ */
export const ROLE_META: Record<
  TeamRole,
  { label: string; tone: Tone; description: string }
> = {
  owner: {
    label: "Owner",
    tone: "brand",
    description: "Full access, billing and workspace control.",
  },
  administrator: {
    label: "Administrator",
    tone: "info",
    description: "Manage members, accounts and settings.",
  },
  content_manager: {
    label: "Content Manager",
    tone: "success",
    description: "Create, schedule and publish content.",
  },
  designer: {
    label: "Designer",
    tone: "neutral",
    description: "Create drafts and manage media.",
  },
  approver: {
    label: "Approver",
    tone: "warning",
    description: "Review and approve submitted content.",
  },
  viewer: {
    label: "Viewer",
    tone: "neutral",
    description: "Read-only access to content and analytics.",
  },
};

/* ------------------------------------------------------------------ */
/* Misc option lists                                                   */
/* ------------------------------------------------------------------ */
export const TIMEZONES = [
  "Africa/Nairobi (GMT+3)",
  "Africa/Lagos (GMT+1)",
  "Europe/London (GMT+0)",
  "Europe/Berlin (GMT+1)",
  "America/New_York (GMT-5)",
  "America/Los_Angeles (GMT-8)",
  "Asia/Dubai (GMT+4)",
  "Asia/Singapore (GMT+8)",
  "Australia/Sydney (GMT+11)",
];

export const INDUSTRIES = [
  "Marketing Agency",
  "E-commerce",
  "SaaS / Technology",
  "Hospitality",
  "Real Estate",
  "Health & Wellness",
  "Education",
  "Non-profit",
  "Other",
];

export const COUNTRIES = [
  "Kenya",
  "Nigeria",
  "South Africa",
  "United Kingdom",
  "United States",
  "Germany",
  "United Arab Emirates",
  "Singapore",
  "Australia",
];

export const LANGUAGES = ["English", "French", "Spanish", "Swahili", "German"];
