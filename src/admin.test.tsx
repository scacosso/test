import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminConsole } from "./admin";

const features = {
  registration: true,
  guest_access: true,
  email_verification: false,
  reporting: true,
  moderation: true,
  monitoring: true
};

afterEach(() => vi.unstubAllGlobals());

describe("super admin console", () => {
  it("renders the governed overview for an authorized superuser", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/me")) {
        return new Response(JSON.stringify({
          user: { id: "owner", email: "owner@example.com", role: "superuser", isGuest: false },
          permissions: [
            "overview:read",
            "features:read",
            "features:write",
            "users:read",
            "users:roles",
            "reports:read",
            "sanctions:read",
            "monitoring:read",
            "audit:read",
            "live:read",
            "live:review"
          ]
        }), { status: 200 });
      }
      if (url.includes("/api/admin/overview")) {
        return new Response(JSON.stringify({
          generatedAt: new Date().toISOString(),
          capacity: 100,
          connectedUsers: 0,
          queuedUsers: 0,
          activeSessions: 0,
          counts: { openReports: 0, urgentReports: 0, activeSanctions: 0, registeredUsers: 1 },
          features,
          recentAudit: []
        }), { status: 200 });
      }
      if (url.includes("/api/admin/monitoring")) {
        return new Response(JSON.stringify({
          generatedAt: new Date().toISOString(),
          current: { connectedUsers: 0, queuedUsers: 0, activeSessions: 0, capacity: 100 },
          services: {
            database: { healthy: true, latencyMs: 1 },
            redis: { healthy: true, latencyMs: 1 },
            livekit: { healthy: true, latencyMs: 1 },
            storage: { healthy: true, latencyMs: 1 },
            moderation: { status: "healthy", details: { lagSeconds: 0 }, updated_at: new Date().toISOString() }
          },
          history: []
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }));

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin/*" element={<AdminConsole locale="es" setLocale={() => undefined} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Gobernanza de la plataforma" })).toBeVisible();
    expect(await screen.findByText("Control de funciones de la plataforma")).toBeVisible();
    expect(screen.getByRole("link", { name: /Usuarios/ })).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/me", expect.any(Object)));
  });

  it("lists active rooms and requires a justification before live review", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/me")) {
        return new Response(JSON.stringify({
          user: { id: "owner", email: "owner@example.com", role: "superuser", isGuest: false },
          permissions: ["live:read", "live:review"]
        }), { status: 200 });
      }
      if (url.endsWith("/api/admin/live/rooms")) {
        return new Response(JSON.stringify({
          generatedAt: new Date().toISOString(),
          rooms: [{
            sessionId: "166660c9-fae0-4a50-9731-f3a1cb301f85",
            startedAt: new Date().toISOString(),
            participantCount: 2,
            activeReviewCount: 0,
            users: [
              { id: "user-a", email: "a@example.com" },
              { id: "user-b", email: "b@example.com" }
            ]
          }]
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    }));

    render(
      <MemoryRouter initialEntries={["/admin/live"]}>
        <Routes>
          <Route path="/admin/*" element={<AdminConsole locale="es" setLocale={() => undefined} />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { name: "Revisión de salas en vivo" })).toBeVisible();
    expect(await screen.findByText("a@example.com · b@example.com")).toBeVisible();
    screen.getByRole("button", { name: /Observar sala/ }).click();
    expect(await screen.findByRole("heading", { name: "Justificación de la revisión" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Iniciar revisión/ })).toBeDisabled();
  });
});
