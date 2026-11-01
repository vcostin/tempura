import { test, expect, type Locator } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/**
 * RTL mirrors the layout, but some content keeps its own order in every locale:
 * the clock (see clock.spec.ts) and key combos. Ctrl + Z must not read Z + Ctrl.
 */
async function readsLeftToRight(keys: Locator) {
  const xs = await keys.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x));
  expect(xs.length).toBeGreaterThan(1);
  expect(xs).toEqual([...xs].sort((a, b) => a - b));
}

for (const locale of ["ar", "he"]) {
  test.describe(`key combos stay left to right (${locale})`, () => {
    test.beforeEach(async ({ page }) => {
      await installTauriMock(page, {
        settings: { locale, globalHotkeys: { toggle: "Ctrl+Shift+Space", skip: "", show: "", portal: false } },
      });
      await page.goto("/");
      await page.waitForSelector(".clock");
    });

    test("on the shortcuts page", async ({ page }) => {
      await page.keyboard.press("?");
      const combos = page.locator('[role="dialog"] .key-combo');
      await expect(combos.first()).toBeVisible();
      for (const combo of await combos.all()) {
        await expect(combo).toHaveAttribute("dir", "ltr");
        if ((await combo.locator("kbd").count()) > 1) await readsLeftToRight(combo.locator("kbd"));
      }
      // A combo never wraps onto two lines.
      const heights = await combos.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
      expect(Math.max(...heights)).toBeLessThan(40);
    });

    test("in the system-wide hotkey recorder", async ({ page }) => {
      await page.keyboard.press(",");
      const keys = page.locator("#hotkey-toggle-value kbd");
      await expect(keys).toHaveCount(3);
      await keys.first().scrollIntoViewIfNeeded();
      await expect(keys.first()).toHaveText("Ctrl");
      await readsLeftToRight(keys);
    });
  });
}

test("a clock past an hour stays inside the ring", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await page.waitForSelector(".clock");
  await page.evaluate(() =>
    (window as any).__tempuraMock.setSnapshot({ running: true, phase: "focus", remainingSecs: 3600 + 12 * 60 + 34, durationSecs: 5400 }),
  );
  await expect(page.locator(".clock")).toHaveText("1:12:34");
  const clock = (await page.locator(".clock").boundingBox())!;
  const ring = (await page.locator(".ring-wrap").boundingBox())!;
  // Inside the stroke: radius 46 of 50, less half the 8-unit stroke, so 84% across.
  const inner = (Math.min(ring.width, ring.height) * 2 * (46 - 4)) / 100;
  expect(clock.width).toBeLessThanOrEqual(inner);
});
