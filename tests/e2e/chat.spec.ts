import { expect, test } from "@playwright/test";

test("explicit visual demo exposes the chat safety controls", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /empezar a conversar|start a conversation/i }).click();
  await expect(page).toHaveURL(/\/auth$/);
  await page.goto("/chat?demo=connected");
  await expect(page.locator(".remote-video__demo")).toBeVisible();
  await page.getByPlaceholder(/escribe un mensaje|write a message/i).fill("Hola");
  await page.getByRole("button", { name: /enviar|send/i }).click();
  await expect(page.locator(".message--mine p").last()).toContainText("Hola");
  const directReport = page.getByRole("button", { name: /reportar|report/i });
  if (await directReport.isVisible()) {
    await directReport.click();
  } else {
    await page.getByRole("button", { name: /chat menu/i }).click();
    await page.getByRole("button", { name: /reportar|report/i }).click();
  }
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /spam/i }).click();
  await expect(page.getByText(/reporte enviado|report sent/i)).toBeVisible();
});

test("normal chat never substitutes a demo participant for a missing match", async ({ page }) => {
  await page.goto("/chat");
  await page.getByRole("button", { name: /permitir acceso|allow access/i }).click();
  await page.waitForTimeout(2_000);
  await expect(page.locator(".remote-video__demo")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /siguiente|next/i })).toBeDisabled();
});

test("manual language selection persists", async ({ page }) => {
  await page.goto("/");
  const switcher = page.getByRole("button", { name: "Change language" }).first();
  await switcher.click();
  await page.reload();
  await expect(page.locator("h1")).toContainText(/Meet someone|Conoce a alguien/);
});
