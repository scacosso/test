import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRESENCE_SNAPSHOT_INTERVAL_MS,
  capturePresenceSnapshot
} from "./presence-snapshot";

afterEach(() => vi.restoreAllMocks());

describe("presence snapshot capture", () => {
  it("creates a compressed 480px JPEG without changing the camera stream", () => {
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/jpeg;base64,photo");
    const video = document.createElement("video");
    Object.defineProperties(video, {
      readyState: { value: 2 },
      videoWidth: { value: 1280 },
      videoHeight: { value: 720 }
    });

    expect(capturePresenceSnapshot(video)).toBe("data:image/jpeg;base64,photo");
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 480, 270);
    expect(PRESENCE_SNAPSHOT_INTERVAL_MS).toBe(10_000);
  });

  it("does not emit an image before the camera has a frame", () => {
    expect(capturePresenceSnapshot(document.createElement("video"))).toBeNull();
  });
});
