const JPEG_DATA_URL_PREFIX = "data:image/jpeg;base64,";
export const MAX_PRESENCE_SNAPSHOT_BYTES = 128 * 1024;

export type PresenceSnapshot = {
  capturedAt: string;
  image: Buffer;
};

export function decodePresenceSnapshot(dataUrl: string, capturedAt = new Date()): PresenceSnapshot {
  if (!dataUrl.startsWith(JPEG_DATA_URL_PREFIX)) throw new Error("Invalid presence snapshot format.");
  const image = Buffer.from(dataUrl.slice(JPEG_DATA_URL_PREFIX.length), "base64");
  if (
    image.length < 4
    || image.length > MAX_PRESENCE_SNAPSHOT_BYTES
    || image[0] !== 0xff
    || image[1] !== 0xd8
    || image[2] !== 0xff
  ) {
    throw new Error("Invalid presence snapshot image.");
  }
  return { image, capturedAt: capturedAt.toISOString() };
}
