import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { config } from "./config.js";

const roomService = config.livekitApiKey && config.livekitApiSecret
  ? new RoomServiceClient(config.livekitInternalUrl.replace(/^ws/, "http"), config.livekitApiKey, config.livekitApiSecret)
  : null;

export type LiveReviewMode = "observe" | "connect";

export function userPreviewPublisherGrant(roomName: string) {
  return {
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishSources: [TrackSource.CAMERA],
    canSubscribe: false,
    canPublishData: false,
    hidden: false
  };
}

export function userPreviewSubscriberGrant(roomName: string) {
  return {
    room: roomName,
    roomJoin: true,
    canPublish: false,
    canSubscribe: true,
    canPublishData: false,
    hidden: true
  };
}

export function liveReviewGrant(mode: LiveReviewMode, roomName: string) {
  const interactive = mode === "connect";
  return {
    room: roomName,
    roomJoin: true,
    canPublish: interactive,
    canSubscribe: true,
    canPublishData: interactive,
    hidden: !interactive
  };
}

export async function prepareRoom(roomName: string, identities: string[]) {
  if (!config.livekitApiKey || !config.livekitApiSecret) {
    return identities.map((identity) => ({ identity, token: `demo-${identity}` }));
  }
  await roomService?.createRoom({ name: roomName, maxParticipants: 4, emptyTimeout: 60 });
  return Promise.all(identities.map(async (identity) => {
    const token = new AccessToken(config.livekitApiKey!, config.livekitApiSecret!, {
      identity,
      ttl: "5m"
    });
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });
    return { identity, token: await token.toJwt() };
  }));
}

export async function prepareUserPreviewRoom(roomName: string, userId: string) {
  if (!config.livekitApiKey || !config.livekitApiSecret) {
    return { roomName, token: `demo-preview-${userId}` };
  }
  await roomService?.createRoom({ name: roomName, maxParticipants: 4, emptyTimeout: 60 });
  const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity: userId,
    name: "NexoCam camera preview",
    metadata: JSON.stringify({ service: "user-preview", userId }),
    ttl: "30m"
  });
  token.addGrant(userPreviewPublisherGrant(roomName));
  return { roomName, token: await token.toJwt() };
}

export async function createUserPreviewSubscriberToken(
  roomName: string,
  identity: string,
  targetUserId: string
) {
  if (!config.livekitApiKey || !config.livekitApiSecret) {
    throw new Error("LiveKit credentials are required for camera preview.");
  }
  const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity,
    name: "NexoCam super admin preview",
    metadata: JSON.stringify({ service: "admin-user-preview", targetUserId }),
    ttl: "90s"
  });
  token.addGrant(userPreviewSubscriberGrant(roomName));
  return token.toJwt();
}

export async function createLiveReviewToken(
  roomName: string,
  identity: string,
  mode: LiveReviewMode,
  targetUserId: string
) {
  if (!config.livekitApiKey || !config.livekitApiSecret) {
    throw new Error("LiveKit credentials are required for live review.");
  }
  const token = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
    identity,
    name: mode === "connect" ? "NexoCam super admin" : "NexoCam safety review",
    metadata: JSON.stringify({ service: "live-review", mode, targetUserId }),
    ttl: mode === "connect" ? "5m" : "90s"
  });
  token.addGrant(liveReviewGrant(mode, roomName));
  return token.toJwt();
}

export async function removeLiveReviewParticipant(roomName: string, identity: string) {
  if (!roomService) return;
  try {
    await roomService.removeParticipant(roomName, identity);
  } catch (error) {
    console.error("Unable to remove LiveKit live-review participant", error);
  }
}

export async function terminateRoom(roomName: string) {
  try {
    await roomService?.deleteRoom(roomName);
  } catch (error) {
    console.error("Unable to terminate LiveKit room", error);
  }
}

export async function healthLiveKit() {
  if (!roomService) return { healthy: false, configured: false, rooms: 0, latencyMs: null };
  const startedAt = performance.now();
  try {
    const rooms = await roomService.listRooms();
    return {
      healthy: true,
      configured: true,
      rooms: rooms.length,
      latencyMs: Math.round(performance.now() - startedAt)
    };
  } catch {
    return {
      healthy: false,
      configured: true,
      rooms: 0,
      latencyMs: Math.round(performance.now() - startedAt)
    };
  }
}
