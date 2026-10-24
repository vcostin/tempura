import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** Focus paused because the computer slept: the banner and its choices. */
test.describe("focus paused while away", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".picker .chip");
  });

  const pushState = (page: import("@playwright/test").Page, state: Record<string, unknown>) =>
    page.evaluate((s) => (window as any).__tempuraMock.setSnapshot(s), state);
  const calls = (page: import("@playwright/test").Page) =>
    page.evaluate(() => (window as any).__tempuraMock.calls as string[]);

  const away = (awaySecs: number) => ({
    phase: "focus",
    running: true,
    paused: true,
    durationSecs: 1500,
    remainingSecs: 1200,
    elapsedSecs: 300,
    techniqueId: "classic",
    techniqueName: "Classic",
    cycle: 1,
    awaySecs,
  });
  const banner = (page: import("@playwright/test").Page) => page.locator(".away-banner");

  test("a short absence just pauses, with no question", async ({ page }) => {
    await pushState(page, away(5 * 60));
    await expect(banner(page)).toHaveText("Paused while you were away (5m).");
    await expect(page.locator(".phase-label")).toHaveText("Paused");
    await expect(page.locator(".clock")).toHaveText("20:00");
    await expect(banner(page).getByRole("button")).toHaveCount(0);

    await page.getByRole("button", { name: "Resume" }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(await calls(page)).toContain("timer_resume");
  });

  test("a long absence asks once; not counting keeps the timer paused", async ({ page }) => {
    await pushState(page, away(42 * 60));
    await expect(banner(page)).toContainText("Paused while you were away (42m).");
    await banner(page).getByRole("button", { name: "Don't count it" }).click();
    await expect(banner(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    expect(await calls(page)).toContain("timer_dismiss_away");
  });

  test("counting a long absence hands it to the timer", async ({ page }) => {
    await pushState(page, away(42 * 60));
    await banner(page).getByRole("button", { name: "Count it as focus" }).click();
    await expect(banner(page)).toHaveCount(0);
    expect(await calls(page)).toContain("timer_count_away");
  });
});
