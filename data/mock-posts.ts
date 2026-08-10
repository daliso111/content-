import type { SocialPost } from "@/types";
import { memberById } from "./mock-team";
import { mediaById } from "./mock-media";

/**
 * A spread of posts across every status and a range of dates (relative to the
 * 2026-08 mock "today") so the calendar, posts table and dashboard all populate.
 */
export const posts: SocialPost[] = [
  {
    id: "post_1",
    caption:
      "Summer is here ☀️ Our biggest launch yet drops this Friday. Get ready for something special — early access opens for subscribers first. #SummerLaunch #NewDrop",
    platforms: ["instagram", "facebook", "x"],
    media: [mediaById.md_1],
    status: "scheduled",
    scheduledAt: "2026-08-07T14:00:00Z",
    createdAt: "2026-08-01T10:00:00Z",
    updatedAt: "2026-08-02T09:00:00Z",
    createdBy: memberById.tm_3,
    campaign: "Summer Launch",
  },
  {
    id: "post_2",
    caption:
      "Behind the scenes of this month's product demo. Swipe to see how it all came together 🎬",
    platformCaptions: {
      linkedin:
        "A look behind the scenes of our latest product demo. Our team spent three weeks refining every detail — here's how it came together.",
    },
    platforms: ["instagram", "linkedin"],
    media: [mediaById.md_2],
    status: "pending_approval",
    scheduledAt: "2026-08-09T09:30:00Z",
    createdAt: "2026-08-03T11:20:00Z",
    updatedAt: "2026-08-04T08:10:00Z",
    createdBy: memberById.tm_4,
    campaign: "Product Demo",
  },
  {
    id: "post_3",
    caption:
      "We're hiring! Join our growing team of creatives and strategists. Link in bio to apply. 🚀",
    platforms: ["linkedin", "x"],
    media: [],
    status: "draft",
    createdAt: "2026-08-04T14:00:00Z",
    updatedAt: "2026-08-04T14:30:00Z",
    createdBy: memberById.tm_2,
    campaign: "Recruiting",
  },
  {
    id: "post_4",
    caption:
      "Flash sale 🔥 48 hours only — 30% off everything storewide. Don't miss out!",
    platforms: ["facebook", "instagram", "tiktok"],
    media: [mediaById.md_9, mediaById.md_4],
    status: "approved",
    scheduledAt: "2026-08-11T12:00:00Z",
    createdAt: "2026-08-02T16:00:00Z",
    updatedAt: "2026-08-05T07:45:00Z",
    createdBy: memberById.tm_3,
    campaign: "Flash Sale",
  },
  {
    id: "post_5",
    caption:
      "Our founder sat down to share the story behind the brand and where we're headed next. Full interview on YouTube.",
    platforms: ["youtube", "linkedin"],
    media: [mediaById.md_10],
    status: "scheduled",
    scheduledAt: "2026-08-13T17:00:00Z",
    createdAt: "2026-08-01T09:00:00Z",
    updatedAt: "2026-08-03T10:00:00Z",
    createdBy: memberById.tm_1,
    campaign: "Founder Story",
  },
  {
    id: "post_6",
    caption:
      "Thank you to everyone who joined our webinar yesterday! 🙌 The recording is now available for all registrants.",
    platforms: ["linkedin", "facebook"],
    media: [mediaById.md_6],
    status: "published",
    scheduledAt: "2026-07-31T15:00:00Z",
    publishedAt: "2026-07-31T15:00:00Z",
    createdAt: "2026-07-28T10:00:00Z",
    updatedAt: "2026-07-31T15:05:00Z",
    createdBy: memberById.tm_3,
    campaign: "Webinar",
    metrics: { reach: 18_400, likes: 642, comments: 88, shares: 41, clicks: 310 },
  },
  {
    id: "post_7",
    caption:
      "Customer spotlight 💜 See how Bloom & Co. grew their audience by 3x in ninety days.",
    platforms: ["instagram", "x", "facebook"],
    media: [mediaById.md_5],
    status: "published",
    scheduledAt: "2026-07-29T11:00:00Z",
    publishedAt: "2026-07-29T11:00:00Z",
    createdAt: "2026-07-25T09:00:00Z",
    updatedAt: "2026-07-29T11:02:00Z",
    createdBy: memberById.tm_4,
    campaign: "Customer Stories",
    metrics: { reach: 24_900, likes: 1_204, comments: 132, shares: 96, clicks: 540 },
  },
  {
    id: "post_8",
    caption:
      "Weekend inspo: five content ideas you can create in under ten minutes. Save this for later 📌",
    platforms: ["instagram", "tiktok"],
    media: [mediaById.md_4],
    status: "failed",
    scheduledAt: "2026-08-02T10:00:00Z",
    createdAt: "2026-07-30T14:00:00Z",
    updatedAt: "2026-08-02T10:01:00Z",
    createdBy: memberById.tm_3,
    campaign: "Content Tips",
    failureReason: "Instagram token expired — reconnect the account and retry.",
  },
  {
    id: "post_9",
    caption:
      "Big news coming next week 👀 Any guesses? Drop them in the comments.",
    platforms: ["x", "instagram"],
    media: [],
    status: "scheduled",
    scheduledAt: "2026-08-06T13:00:00Z",
    createdAt: "2026-08-04T09:00:00Z",
    updatedAt: "2026-08-04T09:15:00Z",
    createdBy: memberById.tm_2,
    campaign: "Teaser",
  },
  {
    id: "post_10",
    caption:
      "Our 2026 media kit is live 📄 Everything you need to partner with us in one place. Download link below.",
    platforms: ["linkedin"],
    media: [mediaById.md_7],
    status: "pending_approval",
    scheduledAt: "2026-08-10T08:00:00Z",
    createdAt: "2026-08-03T15:30:00Z",
    updatedAt: "2026-08-04T11:00:00Z",
    createdBy: memberById.tm_4,
    campaign: "Partnerships",
  },
  {
    id: "post_11",
    caption:
      "Recap of last week's team offsite 🌟 Grateful for this crew and everything we're building together.",
    platforms: ["instagram", "facebook", "linkedin"],
    media: [mediaById.md_8],
    status: "published",
    scheduledAt: "2026-07-26T18:00:00Z",
    publishedAt: "2026-07-26T18:00:00Z",
    createdAt: "2026-07-24T10:00:00Z",
    updatedAt: "2026-07-26T18:03:00Z",
    createdBy: memberById.tm_1,
    campaign: "Culture",
    metrics: { reach: 12_100, likes: 890, comments: 54, shares: 22, clicks: 78 },
  },
  {
    id: "post_12",
    caption:
      "New reel just dropped 🎥 Watch how we plan a full month of content in one afternoon.",
    platforms: ["tiktok", "instagram", "youtube"],
    media: [mediaById.md_12],
    status: "draft",
    createdAt: "2026-08-05T08:00:00Z",
    updatedAt: "2026-08-05T08:20:00Z",
    createdBy: memberById.tm_4,
    campaign: "Content Tips",
  },
  {
    id: "post_13",
    caption:
      "Q3 campaign is officially in motion 📈 Here's a first look at the creative direction.",
    platforms: ["instagram", "linkedin", "facebook"],
    media: [mediaById.md_4, mediaById.md_1],
    status: "approved",
    scheduledAt: "2026-08-14T10:00:00Z",
    createdAt: "2026-08-02T13:00:00Z",
    updatedAt: "2026-08-05T06:30:00Z",
    createdBy: memberById.tm_3,
    campaign: "Q3 Campaign",
  },
  {
    id: "post_14",
    caption:
      "It's #FollowFriday! Tag a business you love and we'll feature our favourites in our stories.",
    platforms: ["instagram", "x"],
    media: [],
    status: "scheduled",
    scheduledAt: "2026-08-08T16:00:00Z",
    createdAt: "2026-08-04T12:00:00Z",
    updatedAt: "2026-08-04T12:10:00Z",
    createdBy: memberById.tm_2,
    campaign: "Community",
  },
];

export const postById = Object.fromEntries(
  posts.map((p) => [p.id, p]),
) as Record<string, SocialPost>;

/** Distinct campaign names for filter dropdowns. */
export const campaigns = Array.from(
  new Set(posts.map((p) => p.campaign).filter(Boolean)),
) as string[];
