import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { NOW, periodStats } from "./fixtures/sampleStats.ts";
import { installTauriMock } from "./fixtures/tauriMock.ts";

const LOCALES: string[] = JSON.parse(readFileSync(new URL("../locales/manifest.json", import.meta.url), "utf8")).languages;
const finishedHeader = (locale: string): string =>
  JSON.parse(readFileSync(new URL(`../locales/${locale}/ui.json`, import.meta.url), "utf8")).report.colFinished;

/** The sample week plus the worst cases real data allows: an unbroken custom name and a 3-digit hour total. */
const stats = {
  ...periodStats,
  techniques: [
    ...periodStats.techniques,
    { techniqueId: "custom-long", name: "DeepWorkWithoutSpacesOrBreaksXYZ1234567", mode: "classic", focusSecs: 123 * 3600 + 45 * 60, sessions: 1234, finished: 1000, ended: 1234 },
  ],
};

/**
 * The Stats rhythm table must fit the window in every language at the default (420 px)
 * and minimum (360 px) widths. German durations ("6 Std. 30 Min.") once pushed the
 * "Finished" column out of view behind the table's horizontal scroll.
 */
for (const width of [360, 420]) {
  for (const locale of LOCALES) {
    test(`Stats rhythm table fits at ${width}px (${locale})`, async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.setViewportSize({ width, height: 813 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installTauriMock(page, { settings: { locale } });
      await page.goto("/");
      await page.waitForSelector(".rhythm-card");
      await page.evaluate((s) => (window as any).__tempuraMock.setPeriodStats(s), stats);
      await page.locator('[data-open-panel="stats"]').click();
      const wrap = page.locator(".report-table-wrap");
      await wrap.waitFor();
      // Measure the localized table with its real fonts (CJK/Arabic/Hebrew are bundled and change metrics).
      await page.locator(".report-table thead").getByText(finishedHeader(locale), { exact: true }).waitFor();
      await page.locator(".report-table tbody").getByText("DeepWorkWithout", { exact: false }).waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      const overflow = await wrap.evaluate((el) => el.scrollWidth - el.clientWidth);
      expect(overflow, "columns hidden behind horizontal scroll").toBeLessThanOrEqual(0);
    });
  }
}
