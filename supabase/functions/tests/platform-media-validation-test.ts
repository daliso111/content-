import {
  assert,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260811140000_fix_platform_media_validation.sql",
    import.meta.url,
  ),
);

Deno.test("platform media migration exposes specific pre-queue validation errors", () => {
  for (const code of [
    "FACEBOOK_MEDIA_UNSUPPORTED",
    "INSTAGRAM_MEDIA_REQUIRED",
    "INSTAGRAM_MEDIA_UNSUPPORTED",
    "YOUTUBE_VIDEO_REQUIRED",
    "TIKTOK_VIDEO_REQUIRED",
    "TIKTOK_SINGLE_VIDEO_REQUIRED",
    "TIKTOK_MEDIA_UNSUPPORTED",
  ]) {
    assertStringIncludes(migration, `raise exception '${code}'`);
  }
  assertStringIncludes(migration, "return 'facebook_text'::public.publishing_operation");
});

Deno.test("mixed destination validation completes before create_publishing_jobs inserts", async () => {
  const createJobsMigration = await Deno.readTextFile(
    new URL(
      "../../migrations/20260811130000_fix_tiktok_direct_post_settings.sql",
      import.meta.url,
    ),
  );
  const validation = createJobsMigration.indexOf(
    "perform private.validate_publishing_post(target_post.id)",
  );
  const insertion = createJobsMigration.indexOf("insert into public.publishing_jobs");
  assert(validation >= 0);
  assert(insertion > validation);
  assertStringIncludes(migration, "when 'instagram' then 1");
  assertStringIncludes(migration, "when 'tiktok' then 2");
});
