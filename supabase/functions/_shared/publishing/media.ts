import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { PublishingError } from "./errors.ts";
import type { SnapshotMedia } from "./types.ts";

function ttl(name: string, fallback: number): number {
  const parsed = Number(Deno.env.get(name));
  return Number.isInteger(parsed) && parsed >= 300 && parsed <= 86400
    ? parsed
    : fallback;
}

export async function signedMediaUrl(
  client: SupabaseClient,
  media: SnapshotMedia,
  workspaceId: string,
): Promise<string> {
  const { data: asset, error: assetError } = await client.from("media_assets")
    .select("id,workspace_id,storage_bucket,storage_path,mime_type")
    .eq("id", media.mediaAssetId).eq("workspace_id", workspaceId).maybeSingle();
  if (
    assetError || !asset || asset.storage_bucket !== media.storageBucket ||
    asset.storage_path !== media.storagePath
  ) {
    throw new PublishingError(
      "MEDIA_NOT_FOUND",
      "The selected media is no longer available.",
    );
  }
  const slash = media.storagePath.lastIndexOf("/");
  const folder = slash >= 0 ? media.storagePath.slice(0, slash) : "";
  const fileName = slash >= 0
    ? media.storagePath.slice(slash + 1)
    : media.storagePath;
  const { data: objects, error: listError } = await client.storage.from(
    media.storageBucket,
  )
    .list(folder, { search: fileName, limit: 2 });
  if (listError || !objects?.some((object) => object.name === fileName)) {
    throw new PublishingError(
      "MEDIA_NOT_FOUND",
      "The selected media object is no longer available.",
    );
  }
  const seconds = media.mediaType === "video"
    ? ttl("PUBLISHING_VIDEO_URL_TTL_SECONDS", 21600)
    : ttl("PUBLISHING_IMAGE_URL_TTL_SECONDS", 3600);
  const { data, error } = await client.storage.from(media.storageBucket)
    .createSignedUrl(media.storagePath, seconds);
  if (error || !data?.signedUrl) {
    throw new PublishingError(
      "MEDIA_URL_CREATION_FAILED",
      "A temporary media URL could not be created.",
      true,
    );
  }
  return data.signedUrl;
}
