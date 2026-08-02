import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminUserPreview from "./admin-user-preview";

const liveKitHarness = vi.hoisted(() => ({
  rooms: [] as Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    emit: (event: string, ...args: unknown[]) => void;
  }>
}));

vi.mock("livekit-client", () => {
  class Room {
    private handlers = new Map<string, Array<(...args: any[]) => void>>();
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
    remoteParticipants = new Map();

    constructor() {
      liveKitHarness.rooms.push(this);
    }

    on(event: string, handler: (...args: any[]) => void) {
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
      TrackPublished: "trackPublished",
      TrackSubscribed: "trackSubscribed",
      TrackUnsubscribed: "trackUnsubscribed"
    },
    Track: { Kind: { Video: "video" } },
    VideoQuality: { LOW: "low" }
  };
});

afterEach(() => {
  liveKitHarness.rooms.length = 0;
  vi.unstubAllGlobals();
});

describe("connected user camera thumbnail", () => {
  it("keeps a ten-second still until hover starts the live preview and mouse leave ends it", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/live/users/user-a/preview")) {
        return new Response(JSON.stringify({
          accessId: "preview-access",
          expiresAt: new Date(Date.now() + 90_000).toISOString(),
          livekitUrl: "wss://livekit.example.test",
          targetUserId: "user-a",
          token: "preview-token"
        }), { status: 200 });
      }
      if (url.endsWith("/api/admin/live/access/preview-access/end")) {
        return new Response(JSON.stringify({ ended: true }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <AdminUserPreview
        locale="es"
        previewReady
        snapshotCapturedAt="2026-08-02T20:00:00.000Z"
        snapshotReady
        userId="user-a"
      />
    );

    const thumbnail = screen.getByLabelText("Pasa el mouse para ver en vivo");
    const still = screen.getByRole("img", { name: "Captura reciente de la cámara" });
    fireEvent.load(still);
    expect(screen.getByText("FOTO · 10 S")).toBeVisible();
    expect(screen.getByText("Pasa el mouse para ver en vivo")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    rerender(
      <AdminUserPreview
        locale="es"
        previewReady
        snapshotCapturedAt="2026-08-02T20:00:10.000Z"
        snapshotReady
        userId="user-a"
      />
    );
    expect(screen.getByRole("img", { name: "Captura reciente de la cámara" })).toHaveAttribute(
      "src",
      expect.stringContaining("2026-08-02T20%3A00%3A10.000Z")
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.mouseEnter(thumbnail);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/live/users/user-a/preview",
      expect.objectContaining({ method: "POST" })
    ));
    expect(liveKitHarness.rooms[0].connect).toHaveBeenCalledWith(
      "wss://livekit.example.test",
      "preview-token",
      { autoSubscribe: true }
    );

    const track = { kind: "video", attach: vi.fn(), detach: vi.fn() };
    liveKitHarness.rooms[0].emit("trackSubscribed", track, {}, { identity: "user-a" });
    expect(await screen.findByText("EN VIVO")).toBeVisible();

    fireEvent.mouseLeave(thumbnail);
    await waitFor(() => expect(liveKitHarness.rooms[0].disconnect).toHaveBeenCalledWith(false));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/admin/live/access/preview-access/end",
      expect.objectContaining({ method: "POST" })
    ));
    expect(screen.getByText("FOTO · 10 S")).toBeVisible();
  });
});
