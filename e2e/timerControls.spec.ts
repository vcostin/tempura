import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

const running = {
  running: true,
  phase: "focus",
  remainingSecs: 894,
  durationSecs: 1500,
  cycle: 2,
  techniqueId: "classic",
  techniqueName: "Classic",
};

async function pushState(page: Page, state: Record<string, unknown>) {
  await page.evaluate((s) => (window as any).__tempuraMock.setSnapshot(s), state);
}

function calls(page: Page) {
  return page.evaluate(() => (window as any).__tempuraMock.calls as string[]);
}

/** The timer's header icons and its controls: one main button, two round ones, a quiet link. */
test.describe("timer header and controls", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".clock");
  });

  test("the header has three icons: Stats, Settings, Help & About", async ({ page }) => {
    const labels = await page
      .locator(".timer-root .brand-actions button")
      .evaluateAll((els) => els.map((el) => el.getAttribute("aria-label")));
    expect(labels).toEqual(["Today’s stats", "Settings", "Help & About"]);
  });

  test("idle shows only Start; running adds restart, skip and End session", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
    await expect(page.locator(".round-btn")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "End session" })).toHaveCount(0);

    const idleCentre = await centreX(page, ".btn-main");
    await pushState(page, running);
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    // The main button does not move when the round buttons appear beside it.
    expect(await centreX(page, ".btn-main")).toBeCloseTo(idleCentre, 0);

    await page.getByRole("button", { name: "Restart phase" }).click();
    await page.getByRole("button", { name: "Skip" }).click();
    await page.getByRole("button", { name: "End session" }).click();
    const sent = await calls(page);
    expect(sent).toEqual(expect.arrayContaining(["timer_reset", "timer_skip", "timer_stop"]));
  });

  test("the keyboard shortcuts are announced on the buttons", async ({ page }) => {
    await expect(page.locator(".btn-main")).toHaveAttribute("aria-keyshortcuts", "Space");
    await pushState(page, running);
    await expect(page.getByRole("button", { name: "Skip" })).toHaveAttribute("aria-keyshortcuts", "S");
  });
});

test.describe("Debug lives in Help & About", () => {
  test("hidden while debug access is off", async ({ page }) => {
    await installTauriMock(page);
    // Dev builds turn debug access on by default; hiding it from Debug sets this.
    await page.addInitScript(() => localStorage.setItem("tempura:debug-hidden", "1"));
    await page.goto("/");
    await page.locator('[data-open-panel="about"]').click();
    await page.waitForSelector('[role="dialog"][aria-label="Help & About"]');
    await expect(page.locator('[data-open-panel="debug"]')).toHaveCount(0);
  });

  test("opens from Help & About; closing returns to the Help button", async ({ page }) => {
    await installTauriMock(page);
    await page.addInitScript(() => localStorage.setItem("tempura:debug", "1"));
    await page.goto("/");
    await expect(page.locator('.timer-root [data-open-panel="debug"]')).toHaveCount(0);

    await page.locator('[data-open-panel="about"]').click();
    await page.locator('[data-open-panel="debug"]').click();
    await page.waitForSelector('[role="dialog"][aria-label="Debug"]');
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });
    await expect(page.locator('[data-open-panel="about"]')).toBeFocused();
  });
});

for (const locale of ["en", "ar"]) {
  test(`fits the smallest window without scrolling (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await installTauriMock(page, { settings: { locale } });
    await page.goto("/");
    await page.waitForSelector(".clock");

    for (const state of [null, running]) {
      if (state) {
        await pushState(page, state);
        await expect(page.locator(".end-session")).toBeVisible();
      }
      const shell = await page.locator(".app-shell").evaluate((el) => ({
        scroll: el.scrollHeight,
        client: el.clientHeight,
      }));
      expect(shell.scroll).toBeLessThanOrEqual(shell.client);
      await expect(page.locator(".stats-strip")).toBeInViewport({ ratio: 1 });
    }

    // The wordmark keeps clear of the header icons (it ran into them in RTL).
    const brand = await page.locator(".timer-root h1.brand").boundingBox();
    const icons = await page.locator(".timer-root .brand-actions").boundingBox();
    expect(brand && icons).toBeTruthy();
    const overlap =
      Math.min(brand!.x + brand!.width, icons!.x + icons!.width) - Math.max(brand!.x, icons!.x);
    expect(overlap).toBeLessThanOrEqual(0);
  });
}

async function centreX(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  return box ? box.x + box.width / 2 : NaN;
}
