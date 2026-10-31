import { test, expect, type Page } from "@playwright/test";
import { installTauriMock } from "./fixtures/tauriMock.ts";

/** Stats: any day, week, month, year or all time, straight from the timer. */
test.describe("stats", () => {
  const usage = (techniqueId: string, name: string, mode: string, focusSecs: number, finished: number, ended: number) => ({
    techniqueId,
    name,
    mode,
    focusSecs,
    sessions: ended,
    finished,
    ended,
  });

  test.beforeEach(async ({ page }) => {
    // Thursday 15 October 2026, local noon.
    await page.clock.setFixedTime(new Date(2026, 9, 15, 12));
    await installTauriMock(page);
    await page.goto("/");
    await page.waitForSelector(".picker .chip");
    const stats = {
        focusSecs: 10 * 3600,
        completedCycles: 18,
        sessions: 9,
        activeDays: 6,
        longestStreak: 3,
        buckets: [
          { date: "2026-10-01", focusSecs: 4 * 3600, completedCycles: 8, sessions: 4 },
          { date: "2026-10-02", focusSecs: 6 * 3600, completedCycles: 10, sessions: 5 },
        ],
        hours: [
          { weekday: 0, hour: 9, focusSecs: 4 * 3600, cycles: 8 },
          { weekday: 4, hour: 14, focusSecs: 2 * 3600, cycles: 4 },
          { weekday: 5, hour: 10, focusSecs: 4 * 3600, cycles: 6 },
        ],
        weekdayCounts: [3, 2, 2, 3, 2, 2, 2],
        techniques: [
          usage("classic", "Classic", "classic", 6 * 3600, 3, 4),
          usage("flowtime", "Flowtime", "flowtime", 4 * 3600, 0, 2),
        ],
        byLabel: [{ kind: "named", name: "Thesis", techniqueId: null, focusSecs: 10 * 3600 }],
        previous: { from: "2026-09-01", to: "2026-09-15", focusSecs: 8 * 3600, completedCycles: 10, sessions: 6, activeDays: 4 },
        firstDay: "2026-03-10",
    };
    await page.evaluate((s) => (window as any).__tempuraMock.setPeriodStats(s), stats);
    await page.locator('[data-open-panel="stats"]').click();
  });

  /** The arguments of the latest `get_period_stats` call. */
  const lastPeriodCall = (page: Page) =>
    page.evaluate(() => {
      const log = (window as any).__tempuraMock.argsLog as [string, Record<string, unknown>][];
      const calls = log.filter(([cmd]) => cmd === "get_period_stats");
      return calls[calls.length - 1]?.[1] ?? null;
    });

  test("opens on this week, compares fairly, and Esc goes back to the timer", async ({ page }) => {
    const stats = page.getByRole("dialog", { name: "Stats" });
    await expect(stats).toBeVisible();
    await expect(stats.getByText("You focused for 10h.")).toBeVisible();
    await expect(stats.getByText("2h more than the week before.")).toBeVisible();
    // English weeks start on Sunday; this one stops at today (Thursday) and
    // compares with Sunday to Thursday of the week before.
    expect(await lastPeriodCall(page)).toEqual({
      from: "2026-10-11",
      to: "2026-10-15",
      compareFrom: "2026-10-04",
      compareTo: "2026-10-08",
    });

    await stats.getByRole("button", { name: "Month", exact: true }).click();
    await expect(stats.getByRole("heading", { name: "October 2026" })).toBeVisible();
    await expect.poll(() => lastPeriodCall(page)).toEqual({
      from: "2026-10-01",
      to: "2026-10-15",
      compareFrom: "2026-09-01",
      compareTo: "2026-09-15",
    });

    await page.keyboard.press("Escape");
    await expect(stats).toHaveCount(0);
    await expect(page.locator('[data-open-panel="stats"]')).toBeFocused();
  });

  test("shows a day by the hour, with today's streak and sessions", async ({ page }) => {
    const stats = page.getByRole("dialog", { name: "Stats" });
    await stats.getByRole("button", { name: "Day", exact: true }).click();
    await expect(stats.getByRole("heading", { name: "Thursday, October 15" })).toBeVisible();
    await expect.poll(() => lastPeriodCall(page)).toEqual({
      from: "2026-10-15",
      to: "2026-10-15",
      compareFrom: "2026-10-14",
      compareTo: "2026-10-14",
    });
    await expect(stats.getByRole("region", { name: "Focus by hour" })).toBeVisible();
    await expect(stats.getByRole("region", { name: "When you focus" })).toHaveCount(0);
    await expect(stats.locator(".report-kpi")).toHaveText([/10h\s*focus time/, /18\s*cycles finished/, /9\s*sessions/, /0\s*day streak/]);
    await stats.getByRole("button", { name: "Previous period" }).click();
    await expect(stats.getByRole("heading", { name: "Wednesday, October 14" })).toBeVisible();
  });

  test("pages back and forward, and switches range", async ({ page }) => {
    const report = page.getByRole("dialog", { name: "Stats" });
    await report.getByRole("button", { name: "Month", exact: true }).click();
    const next = report.getByRole("button", { name: "Next period" });
    await expect(next).toBeDisabled();

    await report.getByRole("button", { name: "Previous period" }).click();
    await expect(report.getByRole("heading", { name: "September 2026" })).toBeVisible();
    await expect.poll(() => lastPeriodCall(page)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
      compareFrom: "2026-08-01",
      compareTo: "2026-08-31",
    });
    await expect(next).toBeEnabled();

    await report.getByRole("button", { name: "Year", exact: true }).click();
    await expect.poll(() => lastPeriodCall(page)).toMatchObject({ from: "2026-01-01", to: "2026-10-15" });

    await report.getByRole("button", { name: "All time" }).click();
    await expect.poll(() => lastPeriodCall(page)).toEqual({
      from: "2026-03-10",
      to: "2026-10-15",
      compareFrom: null,
      compareTo: null,
    });
    await expect(report.getByRole("button", { name: "Previous period" })).toHaveCount(0);
    await expect(report.getByText(/than the/)).toHaveCount(0);
  });

  test("shows the finished share only for fixed-interval rhythms", async ({ page }) => {
    const rhythms = page.getByRole("region", { name: "Which rhythm suits you" });
    const row = (name: string) => rhythms.getByRole("row", { name: new RegExp(`^${name}`) });
    await expect(row("Classic").getByRole("cell").last()).toHaveText("75%");
    await expect(row("Flowtime").getByRole("cell").last()).toHaveText("—");
  });

  test("puts the heat-map's numbers in a table and names when focus happens", async ({ page }) => {
    const report = page.getByRole("dialog", { name: "Stats" });
    const table = report.getByRole("table", { name: "Focus by weekday and hour, in minutes" });
    await expect(table).toBeAttached();
    // Monday 9:00: four hours over three Mondays, an average of 80 minutes.
    await expect(table.getByRole("row", { name: /^Monday/ }).getByRole("cell").nth(9)).toHaveText("80");
    await report.getByRole("button", { name: "Total" }).click();
    await expect(table.getByRole("row", { name: /^Monday/ }).getByRole("cell").nth(9)).toHaveText("240");
    await expect(report.getByText("Busiest day: Monday")).toBeVisible();
    await expect(report.getByText("Weekends: 40% of your focus")).toBeVisible();
  });
});
