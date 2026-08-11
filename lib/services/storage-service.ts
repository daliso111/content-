import * as tus from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/types/database.generated";
import type {
  MediaAssetPresentation,
  MediaItem,
  MediaType,
} from "@/types";
import { getCurrentMembership } from "@/lib/services/database-service";
import {
  getSupabaseClient,
  getSupabaseConfigurationError,
  getSupabaseResumableUploadEndpoint,
} from "@/lib/supabase/client";
import {
  createMediaObjectPath,
  MEDIA_BUCKET,
  mediaTypeForMime,
  STANDARD_UPLOAD_LIMIT,
  validateMediaBatch,
  validateMediaClassification,
  validateMediaFile,
} from "@/lib/media-validation";
import { extractMediaMetadata } from "@/lib/media-metadata";
import {
  mapStorageError,
  StorageServiceError,
} from "@/lib/storage-errors";

export interface ListMediaOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  mediaType?: MediaType | "all";
  uploadedAfter?: string | null;
}

export interface MediaPage {
  items: MediaAssetPresentation[];
  page: number;
  pageSize: number;
  total: number;
}

export interface UploadMediaOptions {
  uploadId?: string;
  mediaType?: MediaType;
  altText?: string | null;
  onProgress?: (progress: number) => void;
}

export interface MediaUploadResult {
  file: File;
  asset: MediaAssetPresentation | null;
  error: StorageServiceError | null;
}

export interface WorkspaceMediaUsage {
  bytes: number;
  itemCount: number;
}

const DEFAULT_SIGNED_URL_EXPIRY = 3600;
const activeUploads = new Map<string, () => Promise<void>>();
const cancelledUploads = new Set<string>();

function requireClient(): SupabaseClient<Database> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error(getSupabaseConfigurationError() ?? "Supabase is not configured.");
  }
  return client;
}

async function requireUser(client: SupabaseClient<Database>) {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new StorageServiceError("session_expired");
  return data.user;
}

async function presentAssets(
  client: SupabaseClient<Database>,
  assets: Tables<"media_assets">[],
  expiresIn = DEFAULT_SIGNED_URL_EXPIRY,
): Promise<MediaAssetPresentation[]> {
  if (!assets.length) return [];
  const [signed, links, profiles] = await Promise.all([
    createMediaSignedUrls(assets, expiresIn),
    client
      .from("post_media")
      .select("media_asset_id")
      .in("media_asset_id", assets.map((asset) => asset.id)),
    client
      .from("profiles")
      .select("id, full_name")
      .in("id", [...new Set(assets.map((asset) => asset.uploaded_by))]),
  ]);

  const useCount = new Map<string, number>();
  for (const link of links.data ?? []) {
    useCount.set(link.media_asset_id, (useCount.get(link.media_asset_id) ?? 0) + 1);
  }
  const names = new Map(
    (profiles.data ?? []).map((profile) => [profile.id, profile.full_name]),
  );
  const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  return assets.map((asset) => ({
    asset,
    signedUrl: signed.get(asset.storage_path) ?? null,
    signedUrlExpiresAt: signed.has(asset.storage_path) ? expiresAt : null,
    uploadedByName: names.get(asset.uploaded_by) ?? null,
    usedInPosts: useCount.get(asset.id) ?? 0,
  }));
}

export async function presentMediaAssets(
  assets: Tables<"media_assets">[],
  expiresIn = DEFAULT_SIGNED_URL_EXPIRY,
): Promise<MediaAssetPresentation[]> {
  return presentAssets(requireClient(), assets, expiresIn);
}

export async function listMediaAssets(
  workspaceId: string,
  options: ListMediaOptions = {},
): Promise<MediaPage> {
  const client = requireClient();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, options.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  let query = client
    .from("media_assets")
    .select("*", { count: "exact" })
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .range(from, from + pageSize - 1);

  if (options.search?.trim()) query = query.ilike("file_name", `%${options.search.trim()}%`);
  if (options.mediaType && options.mediaType !== "all") {
    query = query.eq("media_type", options.mediaType);
  }
  if (options.uploadedAfter) query = query.gte("created_at", options.uploadedAfter);

  const { data, error, count } = await query;
  if (error) throw mapStorageError(error);
  return {
    items: await presentAssets(client, data ?? []),
    page,
    pageSize,
    total: count ?? 0,
  };
}

export async function getMediaAsset(
  assetId: string,
): Promise<MediaAssetPresentation | null> {
  const client = requireClient();
  const { data, error } = await client
    .from("media_assets")
    .select("*")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw mapStorageError(error);
  return data ? (await presentAssets(client, [data]))[0] : null;
}

export async function createMediaSignedUrl(
  asset: Tables<"media_assets">,
  expiresIn = DEFAULT_SIGNED_URL_EXPIRY,
): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUrl(asset.storage_path, expiresIn);
  if (error || !data?.signedUrl) throw mapStorageError(error, "signed_url_failed");
  return data.signedUrl;
}

export async function createMediaSignedUrls(
  assets: Tables<"media_assets">[],
  expiresIn = DEFAULT_SIGNED_URL_EXPIRY,
): Promise<Map<string, string>> {
  const client = requireClient();
  if (!assets.length) return new Map();
  const { data, error } = await client.storage
    .from(MEDIA_BUCKET)
    .createSignedUrls(assets.map((asset) => asset.storage_path), expiresIn);
  if (error) return new Map();
  return new Map(
    (data ?? []).flatMap((item) =>
      item.path && item.signedUrl ? [[item.path, item.signedUrl] as const] : [],
    ),
  );
}

export async function uploadMediaFiles(
  workspaceId: string,
  files: File[],
  options: Omit<UploadMediaOptions, "uploadId"> = {},
): Promise<MediaUploadResult[]> {
  validateMediaBatch(files);
  return Promise.all(
    files.map(async (file) => {
      try {
        const asset = await uploadMediaFile(workspaceId, file, {
          ...options,
          uploadId: crypto.randomUUID(),
        });
        return { file, asset, error: null };
      } catch (error) {
        return { file, asset: null, error: mapStorageError(error) };
      }
    }),
  );
}

export async function uploadMediaFile(
  workspaceId: string,
  file: File,
  options: UploadMediaOptions = {},
): Promise<MediaAssetPresentation> {
  validateMediaFile(file);
  const mediaType = options.mediaType ?? mediaTypeForMime(file.type);
  validateMediaClassification(file.type, mediaType);
  const client = requireClient();
  const user = await requireUser(client);
  const uploadId = options.uploadId ?? crypto.randomUUID();
  let path = createMediaObjectPath(workspaceId, user.id, file.name);

  options.onProgress?.(0);
  try {
    if (file.size <= STANDARD_UPLOAD_LIMIT) {
      await uploadStandard(client, uploadId, path, file);
      options.onProgress?.(100);
    } else {
      path = await uploadResumable(client, uploadId, path, file, options.onProgress);
    }

    if (cancelledUploads.has(uploadId)) {
      await client.storage.from(MEDIA_BUCKET).remove([path]);
      throw new StorageServiceError("upload_cancelled");
    }

    let metadata;
    try {
      metadata = await extractMediaMetadata(file);
    } catch {
      await client.storage.from(MEDIA_BUCKET).remove([path]);
      throw new StorageServiceError(
        "metadata_failed",
        `${file.name} appears to be unreadable or corrupt.`,
      );
    }

    const { data, error } = await client
      .from("media_assets")
      .insert({
        workspace_id: workspaceId,
        uploaded_by: user.id,
        media_type: mediaType,
        file_name: file.name.split(/[\\/]/).pop() ?? "file",
        storage_bucket: MEDIA_BUCKET,
        storage_path: path,
        mime_type: file.type,
        file_size: file.size,
        width: metadata.width,
        height: metadata.height,
        duration_seconds: metadata.durationSeconds,
        alt_text: options.altText?.trim() || null,
        metadata: { upload_strategy: file.size <= STANDARD_UPLOAD_LIMIT ? "standard" : "resumable" },
      })
      .select("*")
      .single();

    if (error || !data) {
      const cleanup = await client.storage.from(MEDIA_BUCKET).remove([path]);
      if (cleanup.error && process.env.NODE_ENV === "development") {
        console.warn("Towkn could not clean up an object after a media record failure.");
      }
      throw new StorageServiceError("metadata_failed");
    }

    return (await presentAssets(client, [data]))[0];
  } catch (error) {
    throw mapStorageError(error);
  } finally {
    activeUploads.delete(uploadId);
    cancelledUploads.delete(uploadId);
  }
}

async function uploadStandard(
  client: SupabaseClient<Database>,
  uploadId: string,
  path: string,
  file: File,
): Promise<void> {
  activeUploads.set(uploadId, async () => {
    cancelledUploads.add(uploadId);
  });
  const { error } = await client.storage.from(MEDIA_BUCKET).upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
}

async function uploadResumable(
  client: SupabaseClient<Database>,
  uploadId: string,
  path: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) throw new StorageServiceError("session_expired");

  return new Promise<string>((resolve, reject) => {
    let completedPath = path;
    const pathSegments = path.split("/");
    const requiredPrefix = `${pathSegments[0]}/${pathSegments[1]}/`;
    const upload = new tus.Upload(file, {
      endpoint: getSupabaseResumableUploadEndpoint(),
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${data.session.access_token}` },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName: MEDIA_BUCKET,
        objectName: path,
        contentType: file.type,
        cacheControl: "3600",
      },
      onError: reject,
      onProgress: (uploaded, total) => {
        onProgress?.(total > 0 ? Math.round((uploaded / total) * 100) : 0);
      },
      onSuccess: () => resolve(completedPath),
    });

    activeUploads.set(uploadId, async () => {
      cancelledUploads.add(uploadId);
      await upload.abort(true);
      reject(new StorageServiceError("upload_cancelled"));
    });
    void upload
      .findPreviousUploads()
      .then((previous) => {
        const resumable = previous.find((candidate) => {
          const previousPath = candidate.metadata?.objectName;
          return (
            typeof previousPath === "string" &&
            previousPath.startsWith(requiredPrefix) &&
            !previousPath.includes("..")
          );
        });
        if (resumable) {
          completedPath = resumable.metadata!.objectName;
          upload.resumeFromPreviousUpload(resumable);
        }
        upload.start();
      })
      .catch(reject);
  });
}

export async function cancelUpload(uploadId: string): Promise<boolean> {
  const cancel = activeUploads.get(uploadId);
  if (!cancel) return false;
  await cancel();
  return true;
}

export async function getMediaPostLinks(assetId: string): Promise<string[]> {
  const client = requireClient();
  const { data, error } = await client
    .from("post_media")
    .select("post_id")
    .eq("media_asset_id", assetId);
  if (error) throw mapStorageError(error);
  return [...new Set((data ?? []).map((link) => link.post_id))];
}

export async function deleteMediaAsset(
  asset: Tables<"media_assets">,
): Promise<void> {
  const client = requireClient();
  const user = await requireUser(client);
  const membership = await getCurrentMembership(asset.workspace_id);
  const managers = ["owner", "administrator", "content_manager"];
  const canDelete =
    !!membership &&
    (managers.includes(membership.role) ||
      (membership.role === "designer" && asset.uploaded_by === user.id));
  if (!canDelete) throw new StorageServiceError("delete_denied");

  const links = await getMediaPostLinks(asset.id);
  if (links.length) {
    throw new StorageServiceError(
      "media_in_use",
      `This media item is used by ${links.length} post${links.length === 1 ? "" : "s"} and cannot be deleted.`,
    );
  }

  const storageResult = await client.storage.from(MEDIA_BUCKET).remove([asset.storage_path]);
  if (storageResult.error) throw mapStorageError(storageResult.error, "delete_denied");
  const metadataResult = await client.from("media_assets").delete().eq("id", asset.id);
  if (metadataResult.error) {
    throw new StorageServiceError(
      "metadata_failed",
      "The file was removed, but its media record remains. Refresh and contact an administrator.",
    );
  }
}

export async function getWorkspaceMediaUsage(
  workspaceId: string,
): Promise<WorkspaceMediaUsage> {
  const client = requireClient();
  let bytes = 0;
  let itemCount = 0;
  let from = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await client
      .from("media_assets")
      .select("file_size")
      .eq("workspace_id", workspaceId)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw mapStorageError(error);
    const rows = data ?? [];
    bytes += rows.reduce((sum, row) => sum + (row.file_size ?? 0), 0);
    itemCount += rows.length;
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return { bytes, itemCount };
}

export function toMediaItem(item: MediaAssetPresentation): MediaItem {
  const extension = item.asset.file_name.split(".").pop()?.toLowerCase() ?? "file";
  return {
    id: item.asset.id,
    name: item.asset.file_name,
    type: item.asset.media_type,
    format: extension,
    size: item.asset.file_size ?? 0,
    thumbnailColor: "linear-gradient(135deg, #475569, #0f766e)",
    thumbnailUrl: item.signedUrl ?? undefined,
    width: item.asset.width ?? undefined,
    height: item.asset.height ?? undefined,
    durationSeconds: item.asset.duration_seconds ?? undefined,
    uploadedAt: item.asset.created_at,
    usedInPosts: item.usedInPosts,
  };
}
