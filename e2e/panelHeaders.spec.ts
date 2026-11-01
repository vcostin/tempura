import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

const LOCALES = ["en", "ar", "de", "es", "fr", "he", "it", "ja", "ko", "nl", "pl", "pt-BR", "ro", "uk", "zh-Hans"];
const PANELS = ["settings", "stats", "techniques", "techniques/new", "about", "shortcuts", "debug"];

/**
 * Every panel's header is the timer's: the wordmark in the same place, the panel's
 * name on the line under it, the same height. Opening a panel never makes it jump
 * (the 0.7.0 smoke test caught Stats' extra label doing that).
 */
for (const locale of LOCALES) {
  test(`panel headers match the timer's (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    // Panels slide in; measure where they settle.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installTauriMock(page, { settings: { locale } });
    await page.goto("/");
    await page.waitForSelector(".rhythm-card");
    const measure = () =>
      page.evaluate(() => {
        const scope = document.querySelector(".panel-host:not([hidden])") ?? document.querySelector(".timer-root")!;
        const header = scope.querySelector("header.brand-header")!.getBoundingClientRect();
        const brand = scope.querySelector("h1.brand")!.getBoundingClientRect();
        const line = scope.querySelector(".tagline")!.textContent;
        return { height: Math.round(header.height), top: Math.round(brand.top), line };
      });
    const timer = await measure();

    for (const panel of PANELS) {
      await page.evaluate((p) => {
        location.hash = "#/" + p;
      }, panel);
      await expect(page.locator('.panel-host [role="dialog"]')).toBeVisible();
      const got = await measure();
      expect(got.height, `${panel} header height`).toBe(timer.height);
      expect(got.top, `${panel} wordmark position`).toBe(timer.top);
      expect(got.line, `${panel} names itself`).toBeTruthy();
    }
  });
}
