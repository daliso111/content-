import type { AnalyticsData } from "@/types";

export const analytics: AnalyticsData = {
  summary: {
    totalPosts: 128,
    totalReach: 486_200,
    totalEngagement: 38_940,
    linkClicks: 12_480,
    followersGained: 4_320,
    bestPlatform: "instagram",
    publishingConsistency: 92,
  },
  timeSeries: [
    { label: "Jul 8", reach: 38_200, engagement: 2_940 },
    { label: "Jul 15", reach: 44_800, engagement: 3_610 },
    { label: "Jul 22", reach: 41_300, engagement: 3_120 },
    { label: "Jul 29", reach: 52_600, engagement: 4_480 },
    { label: "Aug 1", reach: 49_900, engagement: 4_010 },
    { label: "Aug 5", reach: 58_400, engagement: 5_220 },
  ],
  byPlatform: [
    { platform: "instagram", posts: 42, reach: 184_000, engagement: 16_200 },
    { platform: "facebook", posts: 31, reach: 96_400, engagement: 6_900 },
    { platform: "linkedin", posts: 24, reach: 71_200, engagement: 5_800 },
    { platform: "tiktok", posts: 18, reach: 98_600, engagement: 7_400 },
    { platform: "x", posts: 9, reach: 24_100, engagement: 1_840 },
    { platform: "youtube", posts: 4, reach: 11_900, engagement: 800 },
  ],
  byContentType: [
    { type: "image", posts: 58 },
    { type: "video", posts: 34 },
    { type: "graphic", posts: 22 },
    { type: "document", posts: 8 },
    { type: "logo", posts: 6 },
  ],
  byDay: [
    { day: "Mon", engagement: 4_200 },
    { day: "Tue", engagement: 5_100 },
    { day: "Wed", engagement: 6_800 },
    { day: "Thu", engagement: 6_200 },
    { day: "Fri", engagement: 7_400 },
    { day: "Sat", engagement: 5_600 },
    { day: "Sun", engagement: 3_640 },
  ],
  publishing: {
    successful: 122,
    failed: 6,
  },
  bestPostId: "post_7",
};
