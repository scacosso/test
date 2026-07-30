import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { config } from "./config.js";

const roomService = config.livekitApiKey && config.livekitApiSecret
  ? new RoomServiceClient(config.livekitInternalUrl.replace(/^ws/, "http"), config.livekitApiKey, config.livekitApiSecret)
  : null;

export async function prepareRoom(roomName: string, identities: string[]) {
  if (!config.livekitApiKey || !config.livekitApiSecret) {
    return identities.map((identity) => ({ identity, token: `demo-${identity}` }));
  }
  await roomService?.createRoom({ name: roomName, maxParticipants: 3, emptyTimeout: 60 });
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
