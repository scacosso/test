import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByRole("link", { name: /^Usuarios$/ })).toBeVisible();
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/admin/me", expect.any(Object)));
  }, 15_000);

  it("lets a superuser reserve a busy user until the current call ends", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/admin/me")) {
        return new Response(JSON.stringify({
          user: { id: "owner", email: "owner@example.com", role: "superuser", isGuest: false },
          permissions: ["live:read", "live:review"]
        }), { status: 200 });
      }
      if (url.endsWith("/api/admin/live/users")) {
        return new Response(JSON.stringify({
          generatedAt: new Date().toISOString(),
          users: [
            {
              id: "user-a",
              email: "a@example.com",
              name: "Ana",
              role: "user",
              isGuest: false,
              connectedAt: new Date().toISOString(),
              status: "searching",
              previewReady: false,
              snapshotReady: false,
              snapshotCapturedAt: null,
              reservation: null
            },
            {
              id: "user-b",
              email: "b@example.com",
              name: "Bruno",
              role: "user",
              isGuest: false,
              connectedAt: new Date().toISOString(),
              status: "in_call",
              previewReady: false,
              snapshotReady: false,
              snapshotCapturedAt: null,
              reservation: null
            }
          ]
        }), { status: 200 });
      }
      if (url.endsWith("/api/admin/live/users/user-b/connect")) {
        return new Response(JSON.stringify({
          reservationId: "11111111-1111-4111-8111-111111111111",
          targetUserId: "user-b",
          status: "waiting",
          createdAt: "2026-07-31T20:00:00.000Z",
          expiresAt: "2026-07-31T20:05:00.000Z",
          failureReason: null
        }), { status: 202 });
      }
      if (url.includes("/api/admin/live/reservations/11111111-1111-4111-8111-111111111111")) {
        return new Response(JSON.stringify({
          reservationId: "11111111-1111-4111-8111-111111111111",
          targetUserId: "user-b",
          status: "waiting",
          createdAt: "2026-07-31T20:00:00.000Z",
          expiresAt: "2026-07-31T20:05:00.000Z",
          failureReason: null
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

    expect(await screen.findByRole("heading", { name: "Usuarios conectados" })).toBeVisible();
    expect((await screen.findAllByText("a@example.com")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("b@example.com").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Vista previa/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Conectar$/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Esperar a que finalice/ })).toBeEnabled();
    screen.getByRole("button", { name: /Esperar a que finalice/ }).click();
    expect(await screen.findByRole("heading", { name: /Justificaci.n de la conexi.n/ })).toBeVisible();
    expect(screen.getByText(/El usuario est. ocupado/)).toBeVisible();
    const submit = screen.getByRole("button", { name: /Reservar y esperar/ });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/asistencia directa solicitada/), {
      target: { value: "Asistencia del superadmin" }
    });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);
    expect(await screen.findByRole("status")).toHaveTextContent("Esperando que termine su conversación");
    expect(screen.getAllByRole("button", { name: /Cancelar espera/ }).length).toBeGreaterThan(0);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      "/api/admin/live/users/user-b/connect",
      expect.objectContaining({ method: "POST" })
    ));
  }, 15_000);
});
