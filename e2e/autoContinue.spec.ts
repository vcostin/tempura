import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** The auto-continue switch under the timer controls. */
test.describe("auto-continue switch", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".picker .chip");
  });

  test("is on by default, explains itself, and toggles", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: "Auto-continue", exact: true });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(toggle).toHaveAccessibleDescription(
      "Start the next break or focus automatically. Turn off to start each phase yourself.",
    );

    const hint = page.locator(".auto-continue .hint-tooltip");
    await expect(hint).toBeHidden();
    await toggle.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(toggle).toBeFocused();
    await expect(hint).toBeVisible();

    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  });
});
