import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  normalizeTikTokPublishingSettings,
  readTikTokPublishingSettings,
  validateTikTokPublishing,
} from "../lib/tiktok-publishing";
import type { MediaAssetPresentation, TikTokCreatorInfoResult } from "../types";

const creator: TikTokCreatorInfoResult = {
  accountId: "account-1",
  creatorUsername: "towkn.creator",
  creatorNickname: "Towkn Creator",
  creatorAvatarUrl: null,
  privacyLevelOptions: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"],
  commentDisabled: false,
  duetDisabled: true,
  stitchDisabled: false,
  maxVideoPostDurationSec: 60,
};

function video(duration = 30, size = 1024): MediaAssetPresentation {
  return {
    asset: {
      media_type: "video",
      mime_type: "video/mp4",
      file_size: size,
      duration_seconds: duration,
    },
  } as MediaAssetPresentation;
}

const validSettings = readTikTokPublishingSettings({
  privacyLevel: "SELF_ONLY",
  disableComment: true,
  disableDuet: true,
  disableStitch: true,
  brandContentToggle: false,
  brandOrganicToggle: false,
  publishConsent: true,
  creatorMaxVideoPostDurationSec: 60,
});

test("TikTok privacy and explicit confirmation are required", () => {
  assert.equal(validateTikTokPublishing([video()], creator, { ...validSettings, privacyLevel: "" }, true), "TIKTOK_PRIVACY_REQUIRED");
  assert.equal(validateTikTokPublishing([video()], creator, { ...validSettings, publishConsent: false }, true), "TIKTOK_CONSENT_REQUIRED");
});

test("TikTok requires exactly one supported non-empty video", () => {
  assert.equal(validateTikTokPublishing([], creator, validSettings, true), "TIKTOK_VIDEO_REQUIRED");
  assert.equal(validateTikTokPublishing([video(), video()], creator, validSettings, true), "TIKTOK_SINGLE_VIDEO_REQUIRED");
  assert.equal(validateTikTokPublishing([video(30, 0)], creator, validSettings, true), "TIKTOK_VIDEO_EMPTY");
});

test("TikTok uses Creator Info duration and privacy limits", () => {
  assert.equal(validateTikTokPublishing([video(61)], creator, validSettings, true), "TIKTOK_VIDEO_TOO_LONG");
  assert.equal(validateTikTokPublishing([video()], creator, { ...validSettings, privacyLevel: "FRIENDS" }, true), "TIKTOK_PRIVACY_INVALID");
  assert.equal(validateTikTokPublishing([video()], creator, validSettings, true), null);
});

test("TikTok interaction restrictions are represented as disable flags", () => {
  const settings = readTikTokPublishingSettings({});
  assert.equal(settings.disableComment, true);
  assert.equal(settings.disableDuet, true);
  assert.equal(settings.disableStitch, true);
});

test("legacy null and missing TikTok commercial flags normalize to false", () => {
  const missing = readTikTokPublishingSettings({});
  const legacyNull = readTikTokPublishingSettings({
    brandContentToggle: null,
    brandOrganicToggle: null,
  });
  assert.equal(missing.brandContentToggle, false);
  assert.equal(missing.brandOrganicToggle, false);
  assert.equal(legacyNull.brandContentToggle, false);
  assert.equal(legacyNull.brandOrganicToggle, false);
});

for (const [brandContentToggle, brandOrganicToggle] of [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
] as const) {
  test(`TikTok persistence writes explicit commercial booleans ${brandContentToggle}/${brandOrganicToggle}`, () => {
    const normalized = normalizeTikTokPublishingSettings({
      ...validSettings,
      brandContentToggle,
      brandOrganicToggle,
    }) as Record<string, unknown>;
    assert.equal(normalized.brandContentToggle, brandContentToggle);
    assert.equal(normalized.brandOrganicToggle, brandOrganicToggle);
    assert.equal(typeof normalized.brandContentToggle, "boolean");
    assert.equal(typeof normalized.brandOrganicToggle, "boolean");
  });
}

test("unaudited Creator Info choices reject public and accept SELF_ONLY locally", () => {
  const unauditedCreator = { ...creator, privacyLevelOptions: ["SELF_ONLY"] };
  assert.equal(
    validateTikTokPublishing(
      [video()],
      unauditedCreator,
      { ...validSettings, privacyLevel: "PUBLIC_TO_EVERYONE" },
      true,
    ),
    "TIKTOK_PRIVACY_INVALID",
  );
  assert.equal(validateTikTokPublishing([video()], unauditedCreator, validSettings, true), null);
});
