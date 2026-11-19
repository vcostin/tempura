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
  // "What the time went to": long labels and durations like "1 Std. 56 Min." / "123 Std. 45 Min.".
  byLabel: [
    { kind: "named", name: "Making Tempura with a long task name", techniqueId: null, focusSecs: 116 * 60 },
    { kind: "named", name: "Warframe", techniqueId: null, focusSecs: 123 * 3600 + 45 * 60 },
    { kind: "none", name: null, techniqueId: null, focusSecs: 51 * 60 },
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

      // Bars: durations stay on one line and inside the card; names keep room to be read.
      const bars = await page.locator(".stats-bars__row").evaluateAll((rows) =>
        rows.map((row) => {
          const box = row.getBoundingClientRect();
          const name = row.querySelector(".stats-bars__day")!.getBoundingClientRect();
          const value = row.querySelector(".stats-bars__value")!;
          const v = value.getBoundingClientRect();
          // Count rendered text lines (distinct line-box tops), independent of font height.
          const range = document.createRange();
          range.selectNodeContents(value);
          const tops = [...range.getClientRects()].map((r) => r.top).sort((a, b) => a - b);
          const lines = tops.filter((t, i) => i === 0 || t - tops[i - 1] > 2).length;
          return { lines, overflow: Math.round(Math.max(v.right - box.right, box.left - v.left)), name: Math.round(name.width) };
        })
      );
      expect(bars.length, "bar rows rendered").toBeGreaterThanOrEqual(3);
      for (const b of bars) {
        expect(b.lines, "duration wraps").toBeLessThanOrEqual(1);
        expect(b.overflow, "duration sticks out of the row").toBeLessThanOrEqual(0);
        expect(b.name, "name column squeezed").toBeGreaterThanOrEqual(48);
      }
    });
  }
}

/** With ordinary data (built-in rhythms only), names never break mid-word ("Flowtim/e"). */
for (const width of [360, 420]) {
  for (const locale of LOCALES.filter((l) => l !== "ja" && l !== "zh-Hans")) {
    test(`Stats built-in rhythm names stay whole at ${width}px (${locale})`, async ({ page }) => {
      await page.clock.setFixedTime(NOW);
      await page.setViewportSize({ width, height: 813 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await installTauriMock(page, { settings: { locale } });
      await page.goto("/");
      await page.waitForSelector(".rhythm-card");
      await page.evaluate((s) => (window as any).__tempuraMock.setPeriodStats(s), periodStats);
      await page.locator('[data-open-panel="stats"]').click();
      await page.locator(".report-table thead").getByText(finishedHeader(locale), { exact: true }).waitFor();
      await page.evaluate(async () => {
        await document.fonts.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      });
      const split = await page.locator(".report-table tbody th").evaluateAll((ths) =>
        ths.filter((th) => {
          const r = document.createRange();
          r.selectNodeContents(th);
          const tops = [...r.getClientRects()].map((q) => q.top).sort((a, b) => a - b);
          const lines = tops.filter((t, i) => i === 0 || t - tops[i - 1] > 2).length;
          return lines > (th.textContent ?? "").trim().split(/\s+/).length;
        }).map((th) => th.textContent)
      );
      expect(split, "technique name broken mid-word").toEqual([]);
    });
  }
}
