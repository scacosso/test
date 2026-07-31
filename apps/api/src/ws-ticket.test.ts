import { beforeEach, describe, expect, it } from "vitest";
import { consumeWsTicket, createWsTicket, resetConsumedWsTickets } from "./ws-ticket.js";

const secret = "test-secret-with-enough-entropy-for-hmac";

beforeEach(() => resetConsumedWsTickets());

describe("WebSocket authentication tickets", () => {
  it("accepts a valid ticket exactly once", () => {
    const ticket = createWsTicket("user-123", secret, 1_000, 30_000);

    expect(consumeWsTicket(ticket, secret, 2_000)).toBe("user-123");
    expect(consumeWsTicket(ticket, secret, 2_001)).toBeNull();
  });

  it("rejects expired and modified tickets", () => {
    const ticket = createWsTicket("user-123", secret, 1_000, 30_000);
    const modified = `${ticket.slice(0, -1)}x`;

    expect(consumeWsTicket(ticket, secret, 31_001)).toBeNull();
    expect(consumeWsTicket(modified, secret, 2_000)).toBeNull();
  });
});
