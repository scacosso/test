export const PRESENCE_SNAPSHOT_INTERVAL_MS = 10_000;
export const PRESENCE_SNAPSHOT_MAX_WIDTH = 480;

export function capturePresenceSnapshot(video: HTMLVideoElement | null) {
  if (!video || video.readyState < 2 || video.videoWidth <= 0 || video.videoHeight <= 0) return null;
  const scale = Math.min(1, PRESENCE_SNAPSHOT_MAX_WIDTH / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return null;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.55);
    return image.length <= 180_000 ? image : null;
  } catch {
    return null;
  }
}
