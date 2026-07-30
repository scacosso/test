import { expect, test } from "@playwright/test";

test("core chat journey exposes all safety controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /empezar a conversar|start a conversation/i }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await page.goto("/chat");
  await page.getByRole("button", { name: /permitir acceso|allow access/i }).click();
  await expect(page.getByText(/conectado con|connected with/i)).toBeVisible({ timeout: 5_000 });
  await page.getByPlaceholder(/escribe un mensaje|write a message/i).fill("Hola");
  await page.getByRole("button", { name: /enviar|send/i }).click();
  await expect(page.getByText("Hola", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /reportar|report/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /spam/i }).click();
  await expect(page.getByText(/reporte enviado|report sent/i)).toBeVisible();
});

test("manual language selection persists", async ({ page }) => {
  await page.goto("/");
  const switcher = page.getByRole("button", { name: "Change language" }).first();
  await switcher.click();
  await page.reload();
  await expect(page.locator("h1")).toContainText(/Meet someone|Conoce a alguien/);
});
