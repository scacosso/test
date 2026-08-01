import { describe, expect, it } from "vitest";
import { AdminReservationConflictError, AdminReservationStore } from "./admin-reservations.js";

describe("admin connection reservations", () => {
  it("reserves one actor and target until the connection completes", () => {
    const store = new AdminReservationStore();
    const reservation = store.create({
      id: "reservation-1",
      actorId: "admin-1",
      targetUserId: "user-1",
      reason: "Support",
      now: new Date("2026-07-31T20:00:00.000Z")
    });
    expect(reservation.status).toBe("waiting");
    expect(store.begin(reservation.id)?.status).toBe("connecting");
    expect(store.complete(reservation.id, {
      accessId: "access-1",
      sessionId: "session-1",
      mode: "connect",
      targetUserId: "user-1",
      token: "token",
      livekitUrl: "wss://livekit.test",
      expiresAt: "2026-07-31T20:10:00.000Z"
    })?.status).toBe("connected");
    expect(store.get(reservation.id)?.connection?.sessionId).toBe("session-1");
    expect(store.activeForTarget("user-1")).toBeUndefined();
  });

  it("rejects competing actor and target reservations", () => {
    const store = new AdminReservationStore();
    store.create({ id: "one", actorId: "admin-1", targetUserId: "user-1", reason: "Support" });
    expect(() => store.create({ id: "two", actorId: "admin-1", targetUserId: "user-2", reason: "Support" }))
      .toThrowError(new AdminReservationConflictError("actor_reserved"));
    expect(() => store.create({ id: "three", actorId: "admin-2", targetUserId: "user-1", reason: "Support" }))
      .toThrowError(new AdminReservationConflictError("target_reserved"));
  });

  it("expires waiting reservations and releases both indexes", () => {
    const store = new AdminReservationStore();
    store.create({
      id: "one",
      actorId: "admin-1",
      targetUserId: "user-1",
      reason: "Support",
      now: new Date("2026-07-31T20:00:00.000Z"),
      ttlMs: 1_000
    });
    expect(store.expire(new Date("2026-07-31T20:00:02.000Z"))[0]?.status).toBe("expired");
    expect(store.activeForActor("admin-1")).toBeUndefined();
    expect(store.activeForTarget("user-1")).toBeUndefined();
  });

  it("only lets the owner cancel a waiting reservation", () => {
    const store = new AdminReservationStore();
    store.create({ id: "one", actorId: "admin-1", targetUserId: "user-1", reason: "Support" });
    expect(store.cancel("one", "admin-2", "viewer_left")).toBeUndefined();
    expect(store.cancel("one", "admin-1", "viewer_left")?.status).toBe("cancelled");
  });
});
