import { expect, Page, Route, test } from "@playwright/test";

const features = {
  registration: true,
  guest_access: true,
  email_verification: false,
  reporting: true,
  moderation: false,
  monitoring: true
};

const identity = {
  user: {
    id: "owner",
    email: "owner@nexocam.test",
    role: "superuser",
    isGuest: false
  },
  permissions: [
    "overview:read",
    "features:read",
    "features:write",
    "users:read",
    "users:roles",
    "reports:read",
    "reports:review",
    "evidence:read",
    "holds:create",
    "sanctions:read",
    "sanctions:write",
    "monitoring:read",
    "audit:read"
  ]
};

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "cache-control": "no-store" },
    body: JSON.stringify(body)
  });
}

async function mockSuperuserAdmin(page: Page) {
  await page.route("**/api/admin/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/admin/me") return fulfillJson(route, identity);
    if (path === "/api/admin/features") {
      if (request.method() === "PATCH") {
        const payload = request.postDataJSON() as { features?: Partial<typeof features> };
        Object.assign(features, payload.features ?? {});
      }
      return fulfillJson(route, { features });
    }
    if (path === "/api/admin/overview") {
      return fulfillJson(route, {
        generatedAt: new Date().toISOString(),
        capacity: 100,
        connectedUsers: 24,
        queuedUsers: 2,
        activeSessions: 11,
        counts: {
          openReports: 3,
          urgentReports: 1,
          activeSanctions: 2,
          registeredUsers: 90
        },
        features,
        recentAudit: []
      });
    }
    if (path === "/api/admin/monitoring") {
      return fulfillJson(route, {
        generatedAt: new Date().toISOString(),
        current: { connectedUsers: 24, queuedUsers: 2, activeSessions: 11, capacity: 100 },
        services: {
          database: { healthy: true, latencyMs: 4 },
          redis: { healthy: true, latencyMs: 2 },
          livekit: { healthy: true, latencyMs: 8 },
          storage: { healthy: true, latencyMs: 6 },
          moderation: {
            status: "healthy",
            details: { lagSeconds: 0 },
            updated_at: new Date().toISOString()
          }
        },
        history: []
      });
    }
    if (path === "/api/admin/audit") return fulfillJson(route, { items: [], total: 0 });
    return fulfillJson(route, { error: "not_found" }, 404);
  });
}

test("superuser applies feature flags atomically with a reason", async ({ page }) => {
  await mockSuperuserAdmin(page);
  await page.goto("/admin/features");

  await expect(page.getByRole("heading", { name: /funciones de la plataforma|platform features/i })).toBeVisible();
  await page.getByRole("switch", { name: /moderación automática|automated moderation/i }).click();
  await expect(page.getByText(/1 cambios pendientes|1 pending changes/i)).toBeVisible();

  await page.getByRole("textbox", { name: /motivo obligatorio|required reason/i })
    .fill("Validación E2E del control administrativo");
  await page.getByRole("button", { name: /aplicar cambios \(1\)|apply changes \(1\)/i }).click();

  await expect(page.getByText(/cambios guardados correctamente|changes saved successfully/i)).toBeVisible();
  await expect(page.getByRole("switch", { name: /moderación automática|automated moderation/i })).toBeChecked();
});

test("admin routes redirect unauthenticated visitors and reject insufficient roles", async ({ page }) => {
  await page.route("**/api/admin/me", (route) => fulfillJson(route, { error: "unauthorized" }, 401));
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/auth\?next=%2Fadmin$/);

  await page.unroute("**/api/admin/me");
  await page.route("**/api/admin/me", (route) => fulfillJson(route, { error: "forbidden" }, 403));
  await page.goto("/admin");
  await expect(page.getByText(/no tienes permiso|do not have permission|access denied/i)).toBeVisible();
});
