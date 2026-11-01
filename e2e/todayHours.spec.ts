import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

async function setHours(page: Page, hours: { hour: number; focusSecs: number }[]) {
  await page.evaluate((hours) => {
    const mock = (window as any).__tempuraMock;
    mock.setPeriodStats({ hours: hours.map((h) => ({ weekday: 3, cycles: 0, ...h })) });
    mock.emit("stats-updated");
  }, hours);
}

/** Today's 24-hour strip under the timer's numbers. */
test.describe("today's hours", () => {
  test.beforeEach(async ({ page }) => {
    // Thursday 15 October 2026, 10:30 local.
    await page.clock.setFixedTime(new Date(2026, 9, 15, 10, 30));
  });

  test("one cell per hour, darker with more focus; now is marked", async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".rhythm-card");
    await setHours(page, [
      { hour: 9, focusSecs: 25 * 60 },
      { hour: 10, focusSecs: 50 * 60 },
    ]);

    const cells = page.locator(".today-hours-cell");
    await expect(cells).toHaveCount(24);
    await expect(cells.nth(9)).toHaveAttribute("data-level", "2");
    await expect(cells.nth(10)).toHaveAttribute("data-level", "4");
    await expect(cells.nth(11)).toHaveAttribute("data-level", "0");
    await expect(cells.nth(10)).toHaveAttribute("data-now", "");
    await expect(page.locator("[data-now]")).toHaveCount(1);
    await expect(cells.nth(9)).toHaveAttribute("title", /25m/);

    // The strip is decorative; screen readers get a sentence.
    await expect(page.locator(".today-hours-cells")).toHaveAttribute("aria-hidden", "true");
    await expect(page.locator(".today-hours .visually-hidden")).toHaveText(/^Focus by hour today: .*25m.*50m\.$/);

    // It asks for today only.
    const args = await page.evaluate(() =>
      ((window as any).__tempuraMock.argsLog as [string, any][]).filter(([c]) => c === "get_period_stats").pop()?.[1],
    );
    expect(args).toMatchObject({ from: "2026-10-15", to: "2026-10-15" });
  });

  test("an empty day says so", async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await expect(page.locator(".today-hours .visually-hidden")).toHaveText("No focus recorded today yet.");
  });

  test("it is a timeline, so it runs right to left in RTL", async ({ page }) => {
    await installTauriMock(page, { settings: { locale: "ar" } });
    await page.goto("/");
    const cells = page.locator(".today-hours-cell");
    await expect(cells).toHaveCount(24);
    const first = (await cells.first().boundingBox())!;
    const last = (await cells.last().boundingBox())!;
    expect(first.x).toBeGreaterThan(last.x);
  });
});
