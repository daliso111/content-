import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  validatePublishingMediaForPlatform,
  validatePublishingMediaForPlatforms,
} from "../lib/publishing-media-validation";
import type { MediaAssetPresentation, MediaType } from "../types";

function media(
  mediaType: MediaType,
  mimeType: string,
  overrides: Record<string, unknown> = {},
): MediaAssetPresentation {
  return {
    asset: {
      media_type: mediaType,
      mime_type: mimeType,
      file_size: 1_048_576,
      width: mediaType === "video" ? 1080 : 1200,
      height: mediaType === "video" ? 1920 : 1200,
      duration_seconds: mediaType === "video" ? 30 : null,
      ...overrides,
    },
  } as MediaAssetPresentation;
}

const image = () => media("image", "image/jpeg");
const video = () => media("video", "video/mp4");

test("Facebook accepts text-only content and its supported single-media operations", () => {
  assert.equal(validatePublishingMediaForPlatform("facebook", []), null);
  assert.equal(validatePublishingMediaForPlatform("facebook", [image()]), null);
  assert.equal(validatePublishingMediaForPlatform("facebook", [video()]), null);
});

test("Instagram reports missing required media", () => {
  assert.equal(
    validatePublishingMediaForPlatform("instagram", []),
    "INSTAGRAM_MEDIA_REQUIRED",
  );
});

test("TikTok reports no video before settings or provider validation", () => {
  assert.equal(
    validatePublishingMediaForPlatform("tiktok", []),
    "TIKTOK_VIDEO_REQUIRED",
  );
});

test("TikTok accepts exactly one supported video", () => {
  assert.equal(validatePublishingMediaForPlatform("tiktok", [video()]), null);
});

test("TikTok distinguishes multiple videos from unsupported mixed media", () => {
  assert.equal(
    validatePublishingMediaForPlatform("tiktok", [video(), video()]),
    "TIKTOK_SINGLE_VIDEO_REQUIRED",
  );
  assert.equal(
    validatePublishingMediaForPlatform("tiktok", [video(), image()]),
    "TIKTOK_MEDIA_UNSUPPORTED",
  );
});

test("YouTube rejects an invalid media combination", () => {
  assert.equal(
    validatePublishingMediaForPlatform("youtube", [image()]),
    "YOUTUBE_VIDEO_REQUIRED",
  );
  assert.equal(
    validatePublishingMediaForPlatform("youtube", [media("video", "video/avi")]),
    "YOUTUBE_VIDEO_REQUIRED",
  );
});

test("mixed Facebook and Instagram validation identifies Instagram", () => {
  assert.equal(
    validatePublishingMediaForPlatforms(["facebook", "instagram"], []),
    "INSTAGRAM_MEDIA_REQUIRED",
  );
});

test("mixed Facebook and TikTok validation identifies TikTok", () => {
  assert.equal(
    validatePublishingMediaForPlatforms(["facebook", "tiktok"], []),
    "TIKTOK_VIDEO_REQUIRED",
  );
});
