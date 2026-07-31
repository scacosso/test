import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

const response = (body: unknown) => Promise.resolve({
  ok: true,
  json: () => Promise.resolve(body)
} as Response);

beforeEach(() => {
  localStorage.setItem("nexocam.locale", "es");
  window.history.pushState({}, "", "/chat?demo=connected");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("chat header controls", () => {
  it("opens the account menu and exposes the admin console to a superuser", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/get-session")) {
        return response({
          user: {
            id: "superuser-1",
            name: "Nexo Owner",
            email: "owner@nexocam.test",
            role: "superuser"
          }
        });
      }
      if (url.includes("/api/config")) {
        return response({ features: { reporting: true } });
      }
      return response({});
    }));

    render(<BrowserRouter><App /></BrowserRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de cuenta" }));

    expect(await screen.findByText("Nexo Owner")).toBeVisible();
    expect(screen.getByText("owner@nexocam.test")).toBeVisible();
    expect(screen.getByRole("menuitem", { name: /panel de administración/i })).toHaveAttribute("href", "/admin");
  });

  it("opens the invite panel and copies a shareable link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/get-session")) return response(null);
      if (url.includes("/api/config")) return response({ features: { reporting: true } });
      return response({});
    }));

    render(<BrowserRouter><App /></BrowserRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Invitar contacto" }));
    expect(screen.getByRole("dialog", { name: "Invitar a NexoCam" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Copiar enlace" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(await screen.findByRole("button", { name: "Enlace copiado" }, { timeout: 10_000 })).toBeVisible();
  });

  it("does not return to chat after signing out", async () => {
    let sessionActive = true;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/sign-out")) {
        sessionActive = false;
        return response({ success: true });
      }
      if (url.includes("/api/auth/get-session")) {
        return response(sessionActive
          ? { user: { id: "user-1", name: "Test", email: "test@test.com", role: "user" } }
          : null);
      }
      if (url.includes("/api/config")) return response({ features: { reporting: true } });
      return response({});
    }));

    render(<BrowserRouter><App /></BrowserRouter>);

    fireEvent.click(screen.getByRole("button", { name: /abrir men/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /cerrar sesi/i }));

    await waitFor(() => expect(window.location.pathname).toBe("/auth"));
    expect(fetch).toHaveBeenCalledWith("/api/auth/sign-out", expect.objectContaining({
      credentials: "include",
      body: "{}"
    }));
  });
});
