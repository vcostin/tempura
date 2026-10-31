import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** Stats splits focus time by label ("On what"). Techniques are in "Which rhythm suits you". */
test.describe("stats: what the focus time was on", () => {
  test.beforeEach(async ({ page }) => {
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".picker .chip");
  });

  const share = (kind: string, name: string, focusSecs: number, techniqueId: string | null = null) => ({
    kind,
    name,
    focusSecs,
    techniqueId,
  });

  test("lists labels with Other and No label last", async ({ page }) => {
    await page.evaluate(
      (stats) => (window as any).__tempuraMock.setPeriodStats(stats),
      {
        focusSecs: 9000,
        completedCycles: 4,
        sessions: 5,
        buckets: [{ date: "2026-10-24", focusSecs: 9000, completedCycles: 4, sessions: 5 }],
        byLabel: [share("named", "Thesis", 5400), share("other", "", 2400), share("none", "", 1200)],
      },
    );
    await page.locator('[data-open-panel="stats"]').click();

    const byLabel = page.getByRole("region", { name: "On what" });
    await expect(byLabel.locator(".stats-bars__row")).toHaveText([
      /Thesis\s*1h 30m/,
      /Other\s*40m/,
      /No label\s*20m/,
    ]);
  });

  test("says so when the range has no focus, and still offers export", async ({ page }) => {
    await page.locator('[data-open-panel="stats"]').click();
    const stats = page.getByRole("dialog", { name: "Stats" });
    await expect(stats.getByText("No focus in this period.")).toBeVisible();
    await expect(stats.getByRole("region", { name: "On what" })).toHaveCount(0);
    await expect(stats.getByRole("region", { name: "Export" })).toBeVisible();
  });
});
