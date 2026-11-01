import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** The keyboard shortcuts page: no secret shortcuts. */
test.describe("keyboard shortcuts page", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".rhythm-card");
  });

  const dialog = (page: import("@playwright/test").Page) =>
    page.getByRole("dialog", { name: "Keyboard shortcuts" });

  test("? opens it from the timer, lists the keys, and Esc goes back", async ({ page }) => {
    await page.keyboard.press("?");
    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page).locator(".section h2")).toHaveText(["On the timer", "Anywhere", "Menus and lists", "System-wide"]);
    const timerRows = dialog(page).locator(".section").first().locator(".shortcut-row");
    await expect(timerRows).toHaveText([
      /Space\s*Start, pause or resume/,
      /S\s*Skip to the next phase/,
      /Esc\s*Hide the window to the tray/,
    ]);
    await expect(dialog(page).getByText("Open settings").locator("..")).toContainText(/,\s*or\s*Ctrl\s*\+\s*,/);

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.locator('[data-open-panel="about"]')).toBeFocused();
  });

  test("Help & About links to it, and closing returns to Help & About", async ({ page }) => {
    await page.getByRole("button", { name: "Help & About" }).click();
    await page.getByRole("button", { name: /Keyboard shortcuts/ }).click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog", { name: "Help & About" })).toBeVisible();
  });

  test("Settings links to it", async ({ page }) => {
    await page.locator('[data-open-panel="settings"]').click();
    await page.getByRole("button", { name: "Keyboard shortcuts…" }).click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  });
});
