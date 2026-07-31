import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

class PendingWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 3;
  static lastUrl = "";
  readyState = PendingWebSocket.CONNECTING;

  constructor(url: string) {
    PendingWebSocket.lastUrl = url;
  }

  addEventListener() {}
  send() {}
  close() {
    this.readyState = PendingWebSocket.CLOSED;
  }
}

const cameraStream = {
  getAudioTracks: () => [],
  getTracks: () => [],
  getVideoTracks: () => []
} as unknown as MediaStream;

beforeEach(() => {
  window.history.pushState({}, "", "/chat");
  PendingWebSocket.lastUrl = "";
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/chat/ws-ticket") {
      return new Response(JSON.stringify({ ticket: "short-lived-ticket" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url === "/api/config") {
      return new Response(JSON.stringify({ features: {} }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    if (url === "/api/auth/get-session") {
      return new Response("null", {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
    return new Response("{}", { status: 200 });
  }));
  Object.defineProperty(globalThis, "WebSocket", {
    configurable: true,
    value: PendingWebSocket
  });
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn().mockResolvedValue(cameraStream) }
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("real chat entry", () => {
  it("stays in the queue and never replaces a missing match with the demo participant", async () => {
    render(<BrowserRouter><App /></BrowserRouter>);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /permitir acceso|allow access/i }));
    });

    expect(screen.getByText(/buscando una persona|looking for someone/i)).toBeVisible();
    await waitFor(() => expect(PendingWebSocket.lastUrl).toContain("/ws/v1?ticket=short-lived-ticket"));
    expect(fetch).toHaveBeenCalledWith("/api/chat/ws-ticket", expect.objectContaining({
      method: "POST",
      credentials: "include"
    }));
    expect(document.querySelector('img[src="/assets/remote-participant.png"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /siguiente|next/i })).toBeDisabled();
  });
});
