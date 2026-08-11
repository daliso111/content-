import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  buildLivePreviewDestinations,
  findYouTubePreviewVideo,
  LIVE_PREVIEW_EMPTY_MESSAGE,
  resolveLivePreviewContent,
  YOUTUBE_VIDEO_PREVIEW_MESSAGE,
  type LivePreviewAccount,
} from "../lib/live-preview";

function account(
  id: string,
  platform: LivePreviewAccount["platform"],
  name: string,
  username: string | null = null,
  profileImageUrl: string | null = null,
): LivePreviewAccount {
  return {
    id,
    platform,
    account_name: name,
    username,
    profile_image_url: profileImageUrl,
    connection_status: "connected",
  };
}

const instagram = account(
  "instagram-1",
  "instagram",
  "Ithaca Studio",
  "@ithaca.studio",
  "https://cdn.example.com/instagram.jpg",
);
const facebook = account(
  "facebook-1",
  "facebook",
  "Ithaca",
  null,
  "https://cdn.example.com/facebook.jpg",
);
const youtube = account(
  "youtube-1",
  "youtube",
  "Ithaca Video",
  "Ithaca-q3z",
  "https://cdn.example.com/youtube.jpg",
);
const tiktok = account(
  "tiktok-1",
  "tiktok",
  "Towkn Creator",
  "@towkn.creator",
  "https://cdn.example.com/tiktok.jpg",
);
const accounts = [facebook, youtube, instagram, tiktok];

test("builds a Facebook-only preview", () => {
  assert.deepEqual(
    buildLivePreviewDestinations(accounts, [facebook.id]).map((item) => item.platform),
    ["facebook"],
  );
});

test("builds an Instagram-only preview", () => {
  assert.deepEqual(
    buildLivePreviewDestinations(accounts, [instagram.id]).map((item) => item.platform),
    ["instagram"],
  );
});

test("builds a YouTube-only preview", () => {
  assert.deepEqual(
    buildLivePreviewDestinations(accounts, [youtube.id]).map((item) => item.platform),
    ["youtube"],
  );
});

test("builds a TikTok preview from the real selected account metadata", () => {
  assert.deepEqual(
    buildLivePreviewDestinations(accounts, [tiktok.id]),
    [{
      id: "tiktok-1",
      platform: "tiktok",
      accountName: "Towkn Creator",
      handle: "towkn.creator",
      avatarUrl: "https://cdn.example.com/tiktok.jpg",
      connectionStatus: "connected",
    }],
  );
});

test("builds Facebook and Instagram previews in display order", () => {
  assert.deepEqual(
    buildLivePreviewDestinations(accounts, [facebook.id, instagram.id]).map((item) => item.platform),
    ["instagram", "facebook"],
  );
});

test("builds Facebook and YouTube previews", () => {
  assert.deepEqual(
    buildLivePreviewDestinations(accounts, [youtube.id, facebook.id]).map((item) => item.platform),
    ["facebook", "youtube"],
  );
});

test("builds all composer previews while preserving the established provider order", () => {
  assert.deepEqual(
    buildLivePreviewDestinations(accounts, accounts.map((item) => item.id)).map((item) => item.platform),
    ["instagram", "facebook", "tiktok", "youtube"],
  );
});

test("destination selection changes the available tabs", () => {
  const before = buildLivePreviewDestinations(accounts, [instagram.id, facebook.id]);
  const after = buildLivePreviewDestinations(accounts, [youtube.id]);
  assert.deepEqual(before.map((item) => item.id), [instagram.id, facebook.id]);
  assert.deepEqual(after.map((item) => item.id), [youtube.id]);
});

test("uses actual account identity and avatar metadata", () => {
  const [destination] = buildLivePreviewDestinations(accounts, [instagram.id]);
  assert.equal(destination.accountName, "Ithaca Studio");
  assert.equal(destination.handle, "ithaca.studio");
  assert.equal(destination.avatarUrl, "https://cdn.example.com/instagram.jpg");
});

test("keeps multiple accounts on the same platform distinct", () => {
  const secondPage = account("facebook-2", "facebook", "Ithaca Support");
  const destinations = buildLivePreviewDestinations(
    [...accounts, secondPage],
    [secondPage.id, facebook.id],
  );
  assert.deepEqual(destinations.map((item) => item.id), [secondPage.id, facebook.id]);
  assert.deepEqual(destinations.map((item) => item.accountName), ["Ithaca Support", "Ithaca"]);
});

test("media and generic caption changes flow into preview content", () => {
  const initialMedia = [{ id: "image-1", type: "image" }];
  const updatedMedia = [{ id: "video-1", type: "video" }];
  const initial = resolveLivePreviewContent({
    platform: "facebook",
    caption: "Initial caption",
    customiseCaptions: false,
    platformCaptions: {},
    media: initialMedia,
    youtubeTitle: "",
    youtubePrivacyStatus: "private",
  });
  const updated = resolveLivePreviewContent({
    platform: "facebook",
    caption: "Updated caption",
    customiseCaptions: false,
    platformCaptions: {},
    media: updatedMedia,
    youtubeTitle: "",
    youtubePrivacyStatus: "private",
  });
  assert.equal(initial.caption, "Initial caption");
  assert.equal(updated.caption, "Updated caption");
  assert.equal(updated.media, updatedMedia);
});

test("platform-specific caption overrides the generic caption only when enabled", () => {
  const customised = resolveLivePreviewContent({
    platform: "instagram",
    caption: "Generic caption",
    customiseCaptions: true,
    platformCaptions: { instagram: "Instagram caption" },
    media: [],
    youtubeTitle: "",
    youtubePrivacyStatus: "private",
  });
  const generic = resolveLivePreviewContent({
    platform: "instagram",
    caption: "Generic caption",
    customiseCaptions: false,
    platformCaptions: { instagram: "Instagram caption" },
    media: [],
    youtubeTitle: "",
    youtubePrivacyStatus: "private",
  });
  assert.equal(customised.caption, "Instagram caption");
  assert.equal(generic.caption, "Generic caption");
});

test("YouTube title, description, privacy, and video update together", () => {
  const video = [{ id: "video-1", type: "video" }];
  const preview = resolveLivePreviewContent({
    platform: "youtube",
    caption: "Generic description",
    customiseCaptions: true,
    platformCaptions: { youtube: "YouTube description" },
    media: video,
    youtubeTitle: "Construction update",
    youtubePrivacyStatus: "public",
  });
  assert.deepEqual(preview, {
    caption: "YouTube description",
    media: video,
    title: "Construction update",
    privacyStatus: "public",
  });
});

test("YouTube without a video uses the intentional validation preview state", () => {
  assert.equal(findYouTubePreviewVideo([{ type: "image" }]), undefined);
  assert.equal(
    YOUTUBE_VIDEO_PREVIEW_MESSAGE,
    "Add a video to preview your YouTube post.",
  );
});

test("no destination has the required clean empty state", () => {
  assert.deepEqual(buildLivePreviewDestinations(accounts, []), []);
  assert.equal(LIVE_PREVIEW_EMPTY_MESSAGE, "Select a destination to preview your post.");
});
