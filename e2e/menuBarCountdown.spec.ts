import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** The macOS-only switch for the countdown beside the menu bar icon. */
test.describe("menu bar countdown", () => {
  const open = async (page: Page) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".picker .chip");
    await page.locator('[data-open-panel="settings"]').click();
    await expect(page.getByRole("heading", { name: "Desktop" })).toBeVisible();
  };

  test("on macOS it is on by default and can be turned off", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "platform", { get: () => "MacIntel" }));
    await open(page);
    const toggle = page.getByRole("switch", { name: "Countdown in the menu bar" });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(await page.evaluate(() => (window as any).__tempuraMock.calls)).toContain("update_settings");
  });

  test("elsewhere there is no menu bar, so no switch", async ({ page }) => {
    await page.addInitScript(() => Object.defineProperty(navigator, "platform", { get: () => "Linux x86_64" }));
    await open(page);
    await expect(page.getByRole("switch", { name: "Countdown in the menu bar" })).toHaveCount(0);
  });
});
