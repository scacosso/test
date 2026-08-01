export type AdminConnectionDetails = {
  accessId: string;
  sessionId: string;
  mode: "connect";
  targetUserId: string;
  token: string;
  livekitUrl: string;
  expiresAt: string;
};

export type AdminReservationStatus =
  | "waiting"
  | "connecting"
  | "connected"
  | "cancelled"
  | "expired"
  | "failed";

export type AdminConnectionReservation = {
  id: string;
  actorId: string;
  targetUserId: string;
  reason: string;
  status: AdminReservationStatus;
  createdAt: string;
  expiresAt: string;
  resolvedAt?: string;
  failureReason?: string;
  connection?: AdminConnectionDetails;
};

const activeStatuses = new Set<AdminReservationStatus>(["waiting", "connecting", "connected"]);

export class AdminReservationConflictError extends Error {
  constructor(public readonly code: "actor_reserved" | "target_reserved") {
    super(code);
  }
}

export class AdminReservationStore {
  private readonly reservations = new Map<string, AdminConnectionReservation>();
  private readonly activeByActor = new Map<string, string>();
  private readonly activeByTarget = new Map<string, string>();

  create(input: {
    id: string;
    actorId: string;
    targetUserId: string;
    reason: string;
    now?: Date;
    ttlMs?: number;
  }) {
    if (this.activeByActor.has(input.actorId)) throw new AdminReservationConflictError("actor_reserved");
    if (this.activeByTarget.has(input.targetUserId)) throw new AdminReservationConflictError("target_reserved");
    const now = input.now ?? new Date();
    const reservation: AdminConnectionReservation = {
      id: input.id,
      actorId: input.actorId,
      targetUserId: input.targetUserId,
      reason: input.reason,
      status: "waiting",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + (input.ttlMs ?? 5 * 60_000)).toISOString()
    };
    this.reservations.set(reservation.id, reservation);
    this.activeByActor.set(reservation.actorId, reservation.id);
    this.activeByTarget.set(reservation.targetUserId, reservation.id);
    return reservation;
  }

  get(id: string) {
    return this.reservations.get(id);
  }

  getForActor(id: string, actorId: string) {
    const reservation = this.reservations.get(id);
    return reservation?.actorId === actorId ? reservation : undefined;
  }

  activeForTarget(targetUserId: string) {
    const id = this.activeByTarget.get(targetUserId);
    return id ? this.reservations.get(id) : undefined;
  }

  activeForActor(actorId: string) {
    const id = this.activeByActor.get(actorId);
    return id ? this.reservations.get(id) : undefined;
  }

  begin(id: string) {
    const reservation = this.reservations.get(id);
    if (!reservation || reservation.status !== "waiting") return undefined;
    reservation.status = "connecting";
    return reservation;
  }

  complete(id: string, connection: AdminConnectionDetails, now = new Date()) {
    const reservation = this.reservations.get(id);
    if (!reservation || reservation.status !== "connecting") return undefined;
    reservation.status = "connected";
    reservation.connection = connection;
    reservation.resolvedAt = now.toISOString();
    this.releaseActiveIndexes(reservation);
    return reservation;
  }

  cancel(id: string, actorId: string, reason: string, now = new Date()) {
    const reservation = this.getForActor(id, actorId);
    if (!reservation || reservation.status !== "waiting") return undefined;
    return this.finish(reservation, "cancelled", reason, now);
  }

  fail(id: string, reason: string, now = new Date()) {
    const reservation = this.reservations.get(id);
    if (!reservation || !activeStatuses.has(reservation.status)) return undefined;
    return this.finish(reservation, "failed", reason, now);
  }

  finishConnectedByAccess(accessId: string, status: "cancelled" | "expired" | "failed", reason: string) {
    const reservation = [...this.reservations.values()].find((item) =>
      item.status === "connected" && item.connection?.accessId === accessId
    );
    return reservation ? this.finish(reservation, status, reason, new Date()) : undefined;
  }

  expire(now = new Date()) {
    const expired: AdminConnectionReservation[] = [];
    for (const reservation of this.reservations.values()) {
      if (reservation.status === "waiting"
        && new Date(reservation.expiresAt).getTime() <= now.getTime()) {
        expired.push(this.finish(reservation, "expired", "reservation_expired", now));
      }
    }
    return expired;
  }

  private finish(
    reservation: AdminConnectionReservation,
    status: "cancelled" | "expired" | "failed",
    reason: string,
    now: Date
  ) {
    reservation.status = status;
    reservation.failureReason = reason;
    reservation.resolvedAt = now.toISOString();
    this.releaseActiveIndexes(reservation);
    return reservation;
  }

  private releaseActiveIndexes(reservation: AdminConnectionReservation) {
    if (this.activeByActor.get(reservation.actorId) === reservation.id) {
      this.activeByActor.delete(reservation.actorId);
    }
    if (this.activeByTarget.get(reservation.targetUserId) === reservation.id) {
      this.activeByTarget.delete(reservation.targetUserId);
    }
  }
}
