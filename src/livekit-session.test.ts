import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectLiveKitSession,
  connectPreviewPublisherSession,
  disconnectLiveKitSession
} from "./livekit-session";

const liveKitHarness = vi.hoisted(() => ({
  failPublish: false,
  rooms: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    emit: (event: string, ...args: unknown[]) => void;
    localParticipant: { publishTrack: ReturnType<typeof vi.fn> };
  }>
}));

vi.mock("livekit-client", () => {
  class Room {
    private handlers = new Map<string, Array<(...args: unknown[]) => void>>();
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
    localParticipant = {
      publishTrack: vi.fn(async () => {
        if (liveKitHarness.failPublish) throw new Error("publish failed");
      })
    };

    constructor() {
      liveKitHarness.rooms.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler]);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? []) handler(...args);
    }
  }

  return {
    Room,
    RoomEvent: {
      Disconnected: "disconnected",
      Reconnected: "reconnected",
      Reconnecting: "reconnecting",
      TrackSubscribed: "trackSubscribed",
      TrackUnsubscribed: "trackUnsubscribed"
    },
    Track: {
      Kind: { Audio: "audio", Video: "video" },
      Source: { Camera: "camera", Microphone: "microphone" }
    }
  };
});

afterEach(() => {
  liveKitHarness.failPublish = false;
  liveKitHarness.rooms.length = 0;
  vi.clearAllMocks();
});

describe("LiveKit browser session", () => {
  it("connects, publishes local camera and microphone, and attaches the remote tracks", async () => {
    const video = document.createElement("video");
    const audio = document.createElement("audio");
    vi.spyOn(audio, "play").mockResolvedValue();
    const localVideo = { kind: "video", readyState: "live" };
    const localAudio = { kind: "audio", readyState: "live" };
    const onRemoteVideoChange = vi.fn();

    const room = await connectLiveKitSession({
      url: "wss://livekit.example.test",
      token: "room-token",
      stream: {
        getTracks: () => [localVideo, localAudio]
      } as unknown as MediaStream,
      elements: { audio, video },
      events: {
        onDisconnected: vi.fn(),
        onReconnected: vi.fn(),
        onReconnecting: vi.fn(),
        onRemoteVideoChange
      }
    });

    const fakeRoom = liveKitHarness.rooms[0];
    expect(fakeRoom.connect).toHaveBeenCalledWith("wss://livekit.example.test", "room-token");
    expect(fakeRoom.localParticipant.publishTrack).toHaveBeenNthCalledWith(1, localVideo, { source: "camera" });
    expect(fakeRoom.localParticipant.publishTrack).toHaveBeenNthCalledWith(2, localAudio, { source: "microphone" });

    const remoteVideo = { kind: "video", attach: vi.fn(), detach: vi.fn() };
    const remoteAudio = { kind: "audio", attach: vi.fn(), detach: vi.fn() };
    fakeRoom.emit("trackSubscribed", remoteVideo);
    fakeRoom.emit("trackSubscribed", remoteAudio);

    expect(remoteVideo.attach).toHaveBeenCalledWith(video);
    expect(remoteAudio.attach).toHaveBeenCalledWith(audio);
    expect(onRemoteVideoChange).toHaveBeenCalledWith(true);

    await disconnectLiveKitSession(room);
    expect(fakeRoom.disconnect).toHaveBeenCalledWith(false);
  });

  it("disconnects a partially connected room when publishing fails", async () => {
    liveKitHarness.failPublish = true;
    const mediaTrack = { kind: "video", readyState: "live" };

    await expect(connectLiveKitSession({
      url: "wss://livekit.example.test",
      token: "room-token",
      stream: { getTracks: () => [mediaTrack] } as unknown as MediaStream,
      elements: { audio: null, video: null },
      events: {
        onDisconnected: vi.fn(),
        onReconnected: vi.fn(),
        onReconnecting: vi.fn(),
        onRemoteVideoChange: vi.fn()
      }
    })).rejects.toThrow("publish failed");
    expect(liveKitHarness.rooms[0].disconnect).toHaveBeenCalledWith(false);
  });

  it("publishes only the camera to the independent presence room", async () => {
    const localVideo = { kind: "video", readyState: "live" };
    const localAudio = { kind: "audio", readyState: "live" };
    await connectPreviewPublisherSession({
      url: "wss://livekit.example.test",
      token: "preview-token",
      stream: {
        getVideoTracks: () => [localVideo],
        getAudioTracks: () => [localAudio]
      } as unknown as MediaStream,
      onDisconnected: vi.fn()
    });

    const fakeRoom = liveKitHarness.rooms[0];
    expect(fakeRoom.connect).toHaveBeenCalledWith("wss://livekit.example.test", "preview-token");
    expect(fakeRoom.localParticipant.publishTrack).toHaveBeenCalledTimes(1);
    expect(fakeRoom.localParticipant.publishTrack).toHaveBeenCalledWith(localVideo, {
      source: "camera",
      simulcast: true
    });
  });
});
