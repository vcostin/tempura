import { test, expect } from "@playwright/test";

/**
 * Accessibility checks covering modal focus + announcements (Vite shell).
 * Ported from the PR verification script used during a11y implementation.
 */
test.describe("a11y dialogs and landmarks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector(".brand");
  });

  test("timer landmarks, announcer, and decorative ring", async ({ page }) => {
    const landmarks = await page.evaluate(() => {
      const header = document.querySelector("header.brand-header");
      const main = document.querySelector("main#timer-main");
      const h1 = document.querySelector("h1.brand");
      const h2 = document.querySelector("h2.phase-label");
      const clock = document.querySelector(".clock");
      const picker = document.querySelector(".picker");
      const announcer = document.querySelector('[role="status"][aria-live="polite"]');
      const ring = document.querySelector(".ring-wrap svg");
      return {
        header: header?.tagName ?? null,
        main: main?.id ?? null,
        h1: h1?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        h2: h2?.textContent?.trim() ?? null,
        clockLive: clock?.getAttribute("aria-live"),
        pickerRole: picker?.getAttribute("role"),
        announcer: Boolean(announcer),
        ringHidden: ring?.getAttribute("aria-hidden"),
      };
    });

    expect(landmarks.header).toBe("HEADER");
    expect(landmarks.main).toBe("timer-main");
    expect(landmarks.h1 ?? "").toContain("Tempura");
    expect(landmarks.h2).toBe("Ready");
    expect(landmarks.clockLive).toBeNull();
    expect(landmarks.pickerRole).toBe("group");
    expect(landmarks.announcer).toBe(true);
    expect(landmarks.ringHidden).toBe("true");
  });

  test("settings dialog: modal, focus trap, Esc restores opener", async ({ page }) => {
    const settingsBtn = page.locator('[data-open-panel="settings"]');
    await settingsBtn.focus();
    await settingsBtn.click();
    await page.waitForSelector('[role="dialog"]');

    const dialog = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const active = document.activeElement as HTMLElement | null;
      const timerInert = document.querySelector(".timer-root")?.hasAttribute("inert");
      return {
        modal: d?.getAttribute("aria-modal"),
        label: d?.getAttribute("aria-label"),
        activeClose: active?.hasAttribute("data-dialog-close"),
        activeLabel: active?.getAttribute("aria-label"),
        timerInert,
      };
    });

    expect(dialog.modal).toBe("true");
    expect(dialog.label).toBe("Settings");
    expect(dialog.activeClose).toBe(true);
    expect(dialog.timerInert).toBe(true);

    await page.keyboard.press("Shift+Tab");
    const afterShiftTab = await page.evaluate(() => {
      const active = document.activeElement;
      const dialogEl = document.querySelector('[role="dialog"]');
      return {
        inside: Boolean(dialogEl && active && dialogEl.contains(active)),
      };
    });
    expect(afterShiftTab.inside).toBe(true);

    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });

    const restored = await page.evaluate(() => {
      const active = document.activeElement as HTMLElement | null;
      return {
        opener: active?.getAttribute("data-open-panel"),
        inert: document.querySelector(".timer-root")?.hasAttribute("inert"),
      };
    });
    expect(restored.opener).toBe("settings");
    expect(restored.inert).toBe(false);
  });

  test("stats and guide dialogs open with close focused", async ({ page }) => {
    await page.locator('[data-open-panel="stats"]').click();
    await page.waitForSelector('[role="dialog"]');
    const stats = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const active = document.activeElement as HTMLElement | null;
      return {
        label: d?.getAttribute("aria-label"),
        close: active?.hasAttribute("data-dialog-close"),
      };
    });
    expect(stats.label).toBe("Stats");
    expect(stats.close).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });
    const restoredStats = await page.evaluate(
      () => (document.activeElement as HTMLElement | null)?.getAttribute("data-open-panel"),
    );
    expect(restoredStats).toBe("stats");

    await page.locator('[data-open-panel="guide"]').click();
    await page.waitForSelector('[role="dialog"]');
    const guide = await page.evaluate(
      () => document.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    );
    expect(guide).toBe("Techniques guide");
    await page.keyboard.press("Escape");
    await page.waitForSelector('[role="dialog"]', { state: "detached" });
  });

  test("comma opens settings", async ({ page }) => {
    await page.locator("body").click();
    await page.keyboard.press(",");
    await page.waitForSelector('[role="dialog"]');
    const label = await page.evaluate(
      () => document.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    );
    expect(label).toBe("Settings");
  });
});
