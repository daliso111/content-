import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  selectableDestinationAccounts,
  validateYouTubePublishing,
} from "../../../lib/youtube-publishing.ts";
import type {
  MediaAssetPresentation,
  SocialAccountView,
} from "../../../types/index.ts";

function account(
  platform: "facebook" | "instagram" | "youtube",
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
    asset: { media_type: type },
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
