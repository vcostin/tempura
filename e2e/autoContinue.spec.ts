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

test.describe("a phase waiting to start (auto-continue off)", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".picker .chip");
  });

  const pushState = (page: import("@playwright/test").Page, state: Record<string, unknown>) =>
    page.evaluate((s) => (window as any).__tempuraMock.setSnapshot(s), state);

  const waiting = {
    phase: "short_break",
    running: true,
    paused: true,
    awaitingStart: true,
    durationSecs: 300,
    remainingSecs: 300,
    techniqueId: "classic",
    techniqueName: "Classic",
    cycle: 1,
  };

  test("names the phase, offers to start it, and hides Reset", async ({ page }) => {
    await pushState(page, waiting);
    await expect(page.locator(".phase-label")).toHaveText("Short break");
    await expect(page.locator(".clock")).toHaveText("05:00");
    await expect(page.getByRole("button", { name: "Start short break" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Skip" })).toBeVisible();
    await expect(page.locator(".visually-hidden[role=status]")).toHaveText(
      "Short break is ready to start.",
    );
  });

  test("a long break and a focus get their own labels", async ({ page }) => {
    await pushState(page, { ...waiting, phase: "long_break" });
    await expect(page.getByRole("button", { name: "Start long break" })).toBeVisible();
    await pushState(page, { ...waiting, phase: "focus" });
    await expect(page.getByRole("button", { name: "Start focus" })).toBeVisible();
  });

  test("Start resumes the held phase", async ({ page }) => {
    await pushState(page, waiting);
    await page.getByRole("button", { name: "Start short break" }).click();
    await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
    const calls = await page.evaluate(() => (window as any).__tempuraMock.calls as string[]);
    expect(calls).toContain("timer_resume");
  });

  test("a real pause still reads as Paused with Resume and Reset", async ({ page }) => {
    await pushState(page, { ...waiting, awaitingStart: false });
    await expect(page.locator(".phase-label")).toHaveText("Paused");
    await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toBeVisible();
  });

  test("a change made in the tray shows up on the switch", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: "Auto-continue", exact: true });
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.evaluate(() =>
      (window as any).__tempuraMock.emit("settings-updated", { autoContinue: false }),
    );
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});
