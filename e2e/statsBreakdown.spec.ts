import { test, expect } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** The stats page splits focus time by label and by technique. */
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

  test("lists labels and techniques, with Other and No label last", async ({ page }) => {
    await page.evaluate(
      (range) => (window as any).__tempuraMock.setStatsRange(range),
      {
        focusSecs: 9000,
        completedCycles: 4,
        sessions: 5,
        buckets: [{ date: "2026-10-24", focusSecs: 9000, completedCycles: 4, sessions: 5 }],
        byLabel: [
          share("named", "Thesis", 5400),
          share("other", "", 2400),
          share("none", "", 1200),
        ],
        byTechnique: [
          share("named", "Classic", 6000, "classic"),
          share("named", "My writing rhythm", 3000, "custom-1"),
        ],
      },
    );
    await page.locator('[data-open-panel="stats"]').click();

    const byLabel = page.getByRole("region", { name: "On what" });
    await expect(byLabel.locator(".stats-bars__row")).toHaveText([
      /Thesis\s*1h 30m/,
      /Other\s*40m/,
      /No label\s*20m/,
    ]);

    const byTechnique = page.getByRole("region", { name: "By technique" });
    await expect(byTechnique.locator(".stats-bars__row")).toHaveText([
      /Classic\s*1h 40m/,
      /My writing rhythm\s*50m/,
    ]);
  });

  test("hides the breakdowns when there is nothing to split", async ({ page }) => {
    await page.evaluate(
      (range) => (window as any).__tempuraMock.setStatsRange(range),
      { focusSecs: 0, sessions: 1, byLabel: [], byTechnique: [] },
    );
    await page.locator('[data-open-panel="stats"]').click();
    await expect(page.locator(".stats-strip--page")).toBeVisible();
    await expect(page.getByRole("region", { name: "On what" })).toHaveCount(0);
  });
});
