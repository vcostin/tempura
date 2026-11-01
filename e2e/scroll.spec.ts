import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/**
 * One scrollbar, never two. When the timer is taller than the window (big system
 * fonts, CJK, a window smaller than intended), the timer's shell scrolls and the
 * window doesn't: hidden screen-reader text once stuck out below the shell and
 * made the window scroll as well.
 */
for (const [width, height, locale] of [[312, 577, "ja"], [360, 460, "en"], [300, 480, "ar"]] as const) {
  test(`only the timer scrolls in a short window (${width}×${height}, ${locale})`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await installTauriMock(page, { settings: { locale, workingOn: "Warframe" } });
    await page.goto("/");
    await page.waitForSelector(".rhythm-card");
    await page.evaluate(() =>
      (window as any).__tempuraMock.setSnapshot({ running: true, phase: "focus", remainingSecs: 741, durationSecs: 900, techniqueId: "sprint" }),
    );
    await expect(page.locator(".end-session")).toBeVisible();

    const sizes = await page.evaluate(() => {
      const doc = document.scrollingElement!;
      const shell = document.querySelector(".app-shell") as HTMLElement;
      return {
        docH: doc.scrollHeight, docW: doc.scrollWidth, winH: innerHeight, winW: innerWidth,
        shellScrolls: shell.scrollHeight > shell.clientHeight,
        shellWide: shell.scrollWidth > shell.clientWidth,
      };
    });
    expect(sizes.docH).toBeLessThanOrEqual(sizes.winH);
    expect(sizes.docW).toBeLessThanOrEqual(sizes.winW);
    expect(sizes.shellScrolls).toBe(true);
    expect(sizes.shellWide).toBe(false);

    // Everything is still there, through the one scrollbar.
    await page.locator(".today-hours").scrollIntoViewIfNeeded();
    await expect(page.locator(".today-hours")).toBeInViewport();
    expect(await page.evaluate(() => document.scrollingElement!.scrollTop)).toBe(0);
  });
}
