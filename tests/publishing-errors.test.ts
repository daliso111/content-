import { test } from "node:test";
import * as assert from "node:assert/strict";
import {
  mapPublishingError,
  mapPublishingRequestError,
} from "../lib/publishing-errors";

test("UNSUPPORTED_MEDIA_COMBINATION from PostgREST never becomes a Meta outage", () => {
  const error = mapPublishingRequestError({
    code: "22023",
    message: "UNSUPPORTED_MEDIA_COMBINATION",
  });
  assert.equal(error.code, "UNSUPPORTED_MEDIA_COMBINATION");
  assert.equal(
    error.message,
    "The selected platforms do not support this media combination.",
  );
  assert.equal(error.message.includes("Meta"), false);
});

test("platform validation errors map from plain Supabase error objects", () => {
  assert.equal(
    mapPublishingRequestError({ code: "22023", message: "TIKTOK_VIDEO_REQUIRED" }).message,
    "TikTok requires one video for this post.",
  );
  assert.equal(
    mapPublishingRequestError({ code: "22023", message: "INSTAGRAM_MEDIA_REQUIRED" }).message,
    "Add supported media before publishing to Instagram.",
  );
});

test("unknown request_publish_now errors use a queue-validation fallback", () => {
  const error = mapPublishingRequestError({
    code: "22023",
    message: "SOME_NEW_DATABASE_VALIDATION",
  });
  assert.equal(error.code, "PUBLISH_REQUEST_FAILED");
  assert.equal(
    error.message,
    "Publishing could not be queued. Review the post settings and try again.",
  );
});

test("an actual Meta provider temporary error keeps its provider wording", () => {
  const error = mapPublishingError(new Error("PROVIDER_TEMPORARY_ERROR"));
  assert.equal(error.code, "PROVIDER_TEMPORARY_ERROR");
  assert.equal(
    error.message,
    "Meta is temporarily unavailable. PostFlow will retry safely.",
  );
});
