import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  COMPOSER_DESTINATION_PLATFORMS,
  partitionComposerDestinationIds,
  readTikTokComposerDestinationIds,
  selectableComposerDestinationAccounts,
  withTikTokComposerDestinationIds,
} from "../../../lib/composer-platforms.ts";
import {
  selectableDestinationAccounts,
  validateYouTubePublishing,
} from "../../../lib/youtube-publishing.ts";
import type {
  MediaAssetPresentation,
  SocialAccountView,
} from "../../../types/index.ts";

function account(
  platform: "facebook" | "instagram" | "youtube" | "tiktok",
  workspaceId = "workspace-1",
  status = "connected",
): SocialAccountView {
  return {
    account: {
      id: `${workspaceId}-${platform}-${status}`,
      workspace_id: workspaceId,
      platform,
      connection_status: status,
    },
    connectedByName: null,
  } as SocialAccountView;
}

function media(type: "image" | "video"): MediaAssetPresentation {
  return {
    asset: {
      media_type: type,
      mime_type: type === "video" ? "video/mp4" : "image/jpeg",
    },
    signedUrl: null,
    signedUrlExpiresAt: null,
    uploadedByName: null,
    usedInPosts: 0,
  } as MediaAssetPresentation;
}

Deno.test("connected YouTube destinations appear while disconnected accounts and other workspaces do not", () => {
  const result = selectableDestinationAccounts([
    account("facebook"),
    account("instagram"),
    account("youtube"),
    account("youtube", "workspace-1", "reconnect_required"),
    account("youtube", "workspace-2"),
  ], "workspace-1");
  assertEquals(result.map(({ account: item }) => item.platform), [
    "facebook",
    "instagram",
    "youtube",
  ]);
});

Deno.test("YouTube requires exactly one video and an explicit valid title", () => {
  assertEquals(validateYouTubePublishing([], "Title", "", "private"), "YOUTUBE_VIDEO_REQUIRED");
  assertEquals(validateYouTubePublishing([media("image")], "Title", "", "private"), "YOUTUBE_VIDEO_REQUIRED");
  assertEquals(validateYouTubePublishing([media("video")], "", "", "private"), "YOUTUBE_TITLE_REQUIRED");
  assertEquals(validateYouTubePublishing([media("video")], "Title", "Description", "private"), null);
});

Deno.test("mixed Meta and YouTube destinations remain independently selectable", () => {
  const result = selectableDestinationAccounts([
    account("facebook"),
    account("instagram"),
    account("youtube"),
  ], "workspace-1");
  assertEquals(result.length, 3);
  assertEquals(result.every(({ account: item }) => item.connection_status === "connected"), true);
});

Deno.test("connected TikTok accounts are publishing destinations", () => {
  const result = selectableDestinationAccounts([
    account("facebook"),
    account("tiktok"),
  ], "workspace-1");
  assertEquals(result.map(({ account: item }) => item.platform), ["facebook", "tiktok"]);
});

Deno.test("composer shows Facebook, Instagram, TikTok, and YouTube in intentional order", () => {
  assertEquals(COMPOSER_DESTINATION_PLATFORMS, [
    "facebook",
    "instagram",
    "tiktok",
    "youtube",
  ]);

  const result = selectableComposerDestinationAccounts([
    account("facebook"),
    account("instagram"),
    account("tiktok"),
    account("youtube"),
    account("tiktok", "workspace-1", "reconnect_required"),
    account("tiktok", "workspace-2"),
  ], "workspace-1");

  assertEquals(result.map(({ account: item }) => item.platform), [
    "facebook",
    "instagram",
    "tiktok",
    "youtube",
  ]);
});

Deno.test("TikTok and existing platforms remain independently publishable", () => {
  const views = [
    account("facebook"),
    account("instagram"),
    account("tiktok"),
    account("youtube"),
  ];
  const ids = views.map(({ account: item }) => item.id);
  const result = partitionComposerDestinationIds(views, ids);

  assertEquals(result.publishableIds, ids);
  assertEquals(result.composerOnlyIds, []);
});

Deno.test("TikTok composer destination selection round-trips through safe platform settings", () => {
  const settings = withTikTokComposerDestinationIds(
    { existingSetting: true },
    ["real-tiktok-account-id"],
  );
  assertEquals(readTikTokComposerDestinationIds(settings), [
    "real-tiktok-account-id",
  ]);
  assertEquals(
    (settings as Record<string, unknown>).existingSetting,
    true,
  );
});

Deno.test("Create Post renders real TikTok destinations with targeted validation", async () => {
  const page = await Deno.readTextFile(
    new URL("../../../app/dashboard/create/page.tsx", import.meta.url),
  );

  assertStringIncludes(page, "COMPOSER_DESTINATION_PLATFORMS");
  assertStringIncludes(page, "selectableComposerDestinationAccounts");
  assertStringIncludes(page, "account.account_name");
  assertStringIncludes(page, "account.username");
  assertStringIncludes(page, "TikTok publishing enabled");
  assertStringIncludes(page, "validateTikTokPublishing");
  assertStringIncludes(page, "normalizeTikTokPublishingSettings(settings)");
  assertStringIncludes(
    page,
    "destinationAccountIds: destinationCapabilities.publishableIds",
  );
  assertEquals(page.toLowerCase().includes("ithacadigitalsolutions"), false);

  const validationBlock = page.indexOf("validateTikTokPublishing(");
  const scheduledPersist = page.indexOf('persistPost("scheduled")');
  const publishRequest = page.indexOf("await requestPublishNow");
  assert(validationBlock >= 0);
  assert(scheduledPersist > validationBlock);
  assert(publishRequest > validationBlock);
});
