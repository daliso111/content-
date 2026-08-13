export interface BrowserMediaMetadata {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

const VIDEO_METADATA_TIMEOUT_MS = 10_000;
const EMPTY_VIDEO_METADATA: BrowserMediaMetadata = {
  width: null,
  height: null,
  durationSeconds: null,
};

export async function extractMediaMetadata(
  file: File,
): Promise<BrowserMediaMetadata> {
  if (file.type === "application/pdf") {
    return { width: null, height: null, durationSeconds: null };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) return await readImage(objectUrl);
    if (file.type.startsWith("video/")) return await readVideo(objectUrl, file.type);
    throw new Error("Unsupported media metadata type.");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function readImage(objectUrl: string): Promise<BrowserMediaMetadata> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({
        width: image.naturalWidth || null,
        height: image.naturalHeight || null,
        durationSeconds: null,
      });
    image.onerror = () => reject(new Error("The image file could not be read."));
    image.src = objectUrl;
  });
}

function readVideo(
  objectUrl: string,
  mimeType: string,
): Promise<BrowserMediaMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    let settled = false;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      try {
        video.load();
      } catch {
        // Some browsers can throw while tearing down an unsupported media source.
      }
    };

    const complete = (metadata: BrowserMediaMetadata) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();
      resolve(metadata);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      cleanup();

      // Chrome cannot reliably decode metadata for every QuickTime codec even
      // though the connected publishing providers can accept video/quicktime.
      // Do not leave an otherwise completed upload stuck forever in that case.
      if (mimeType === "video/quicktime") {
        resolve(EMPTY_VIDEO_METADATA);
        return;
      }

      reject(new Error(message));
    };

    const timeoutId = window.setTimeout(
      () => fail("The video metadata could not be read in time."),
      VIDEO_METADATA_TIMEOUT_MS,
    );

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () =>
      complete({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
      });
    video.onerror = () => fail("The video file could not be read.");
    video.src = objectUrl;
    video.load();
  });
}
