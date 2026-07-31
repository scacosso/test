import type { Room as LiveKitRoom } from "livekit-client";

type MediaElements = {
  audio: HTMLAudioElement | null;
  video: HTMLVideoElement | null;
};

type SessionEvents = {
  onDisconnected: () => void;
  onReconnected: () => void;
  onReconnecting: () => void;
  onRemoteVideoChange: (active: boolean) => void;
};

type ConnectOptions = {
  elements: MediaElements;
  events: SessionEvents;
  stream: MediaStream;
  token: string;
  url: string;
};

type PreviewPublisherOptions = {
  onDisconnected: () => void;
  stream: MediaStream;
  token: string;
  url: string;
};

export async function connectLiveKitSession({
  elements,
  events,
  stream,
  token,
  url
}: ConnectOptions): Promise<LiveKitRoom> {
  const { Room, RoomEvent, Track } = await import("livekit-client");
  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    stopLocalTrackOnUnpublish: false
  });

  room.on(RoomEvent.TrackSubscribed, (track) => {
    if (track.kind === Track.Kind.Video && elements.video) {
      track.attach(elements.video);
      events.onRemoteVideoChange(true);
    }
    if (track.kind === Track.Kind.Audio && elements.audio) {
      track.attach(elements.audio);
      void elements.audio.play().catch(() => undefined);
    }
  });
  room.on(RoomEvent.TrackUnsubscribed, (track) => {
    if (track.kind === Track.Kind.Video && elements.video) {
      track.detach(elements.video);
      elements.video.srcObject = null;
      events.onRemoteVideoChange(false);
    }
    if (track.kind === Track.Kind.Audio && elements.audio) {
      track.detach(elements.audio);
      elements.audio.srcObject = null;
    }
  });
  room.on(RoomEvent.Reconnecting, events.onReconnecting);
  room.on(RoomEvent.Reconnected, events.onReconnected);
  room.on(RoomEvent.Disconnected, events.onDisconnected);

  try {
    await room.connect(url, token);
    await Promise.all(
      stream.getTracks()
        .filter((mediaTrack) => mediaTrack.readyState === "live")
        .map((mediaTrack) =>
          room.localParticipant.publishTrack(mediaTrack, {
            source: mediaTrack.kind === "video" ? Track.Source.Camera : Track.Source.Microphone
          })
        )
    );
    return room;
  } catch (error) {
    await room.disconnect(false);
    throw error;
  }
}

export async function disconnectLiveKitSession(room: LiveKitRoom | null) {
  if (room) await room.disconnect(false);
}

export async function connectPreviewPublisherSession({
  onDisconnected,
  stream,
  token,
  url
}: PreviewPublisherOptions): Promise<LiveKitRoom> {
  const { Room, RoomEvent, Track } = await import("livekit-client");
  const room = new Room({
    adaptiveStream: false,
    dynacast: true,
    stopLocalTrackOnUnpublish: false
  });
  room.on(RoomEvent.Disconnected, onDisconnected);
  try {
    await room.connect(url, token);
    const cameraTrack = stream.getVideoTracks().find((track) => track.readyState === "live");
    if (!cameraTrack) throw new Error("Camera track is not available for preview.");
    await room.localParticipant.publishTrack(cameraTrack, {
      source: Track.Source.Camera,
      simulcast: true
    });
    return room;
  } catch (error) {
    await room.disconnect(false);
    throw error;
  }
}
