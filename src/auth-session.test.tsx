import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

const publicConfigResponse = {
  googleOAuth: false,
  features: {
    emailVerification: false,
    guestAccess: true,
    moderation: true,
    monitoring: true,
    registration: true,
    reporting: true
  }
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

beforeEach(() => {
  window.history.pushState({}, "", "/auth");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("authentication choices", () => {
  it("creates an adult guest session and enters chat", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/config") return jsonResponse(publicConfigResponse);
      if (url === "/api/auth/sign-in/anonymous") {
        return jsonResponse({ user: { id: "guest-1", isAnonymous: true } });
      }
      return jsonResponse({ error: "not_found" }, 404);
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    const guestButton = await screen.findByRole("button", { name: /continuar como invitado|continue as guest/i });
    expect(document.querySelector(".guest-consent")).toHaveTextContent(/18 años o más|18 or older/i);
    fireEvent.click(guestButton);

    await waitFor(() => expect(window.location.pathname).toBe("/chat"));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/sign-in/anonymous",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-nexocam-age-confirmed": "true" })
      })
    );
  });

  it("enters chat immediately after a successful email registration", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/config") return jsonResponse(publicConfigResponse);
      if (url === "/api/auth/sign-up/email") {
        return jsonResponse({ user: { id: "registered-1", emailVerified: false } });
      }
      return jsonResponse({ error: "not_found" }, 404);
    });

    render(<BrowserRouter><App /></BrowserRouter>);
    fireEvent.change(screen.getByLabelText(/nombre|name/i), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/correo|email/i), { target: { value: "alex@example.com" } });
    fireEvent.change(screen.getByLabelText(/contraseña|password/i), { target: { value: "password123" } });
    fireEvent.change(screen.getByLabelText(/nacimiento|birth/i), { target: { value: "1990-01-01" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /crear mi cuenta|create account/i }));

    await waitFor(() => expect(window.location.pathname).toBe("/chat"));
    expect(screen.queryByText(/revisa tu correo|check your email/i)).not.toBeInTheDocument();
  });
});
