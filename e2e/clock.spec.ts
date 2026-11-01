import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** The display font has proportional digits; the clock must not shift as it ticks. */
test("every clock digit takes the same width", async ({ page }) => {
  await installTauriMock(page);
  await page.goto("/");
  await page.waitForSelector(".clock");
  await page.evaluate(() =>
    (window as any).__tempuraMock.setSnapshot({ running: true, phase: "focus", remainingSecs: 11 * 60 + 18, durationSecs: 25 * 60 }),
  );
  await expect(page.locator(".clock")).toHaveText("11:18");
  const widths = await page.locator(".clock-digit").evaluateAll((els) =>
    els.map((el) => Math.round(el.getBoundingClientRect().width * 10) / 10),
  );
  expect(widths).toHaveLength(4);
  expect(new Set(widths).size).toBe(1);
});

/** A time reads left to right in every locale; RTL once drew 12:19 as 91:21. */
for (const locale of ["ar", "he"]) {
  test(`the clock reads left to right in an RTL locale (${locale})`, async ({ page }) => {
    await installTauriMock(page, { settings: { locale } });
    await page.goto("/");
    await page.waitForSelector(".clock");
    await page.evaluate(() =>
      (window as any).__tempuraMock.setSnapshot({ running: true, phase: "focus", remainingSecs: 12 * 60 + 19, durationSecs: 15 * 60 }),
    );
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator(".clock")).toHaveText("12:19");
    const xs = await page.locator(".clock-digit").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().x));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
}
