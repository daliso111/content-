export interface BrowserMediaMetadata {
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
}

export async function extractMediaMetadata(
  file: File,
): Promise<BrowserMediaMetadata> {
  if (file.type === "application/pdf") {
    return { width: null, height: null, durationSeconds: null };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    if (file.type.startsWith("image/")) return await readImage(objectUrl);
    if (file.type.startsWith("video/")) return await readVideo(objectUrl);
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

function readVideo(objectUrl: string): Promise<BrowserMediaMetadata> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      resolve({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationSeconds: Number.isFinite(video.duration) ? video.duration : null,
      });
    video.onerror = () => reject(new Error("The video file could not be read."));
    video.src = objectUrl;
  });
}
