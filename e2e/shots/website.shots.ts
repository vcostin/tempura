import { test, type Page } from "@playwright/test";
import { installTauriMock } from "../fixtures/tauriMock.ts";

/** The website's gallery: the timer in front, the technique sheet and Stats behind it. */
const OUT = new URL("../../website/shots/", import.meta.url).pathname;
const SIZE = { width: 420, height: 813 };
// Thursday 15 October 2026, mid-afternoon.
const NOW = new Date(2026, 9, 15, 15, 20);

const hourCells = (weekday: number, hours: [number, number][]) =>
  hours.map(([hour, mins]) => ({ weekday, hour, focusSecs: mins * 60, cycles: Math.round(mins / 25) }));

const week = [
  // Monday … Thursday (today): minutes per hour.
  hourCells(0, [[9, 50], [10, 55], [11, 30], [14, 45], [15, 25]]),
  hourCells(1, [[8, 25], [9, 55], [10, 50], [16, 40]]),
  hourCells(2, [[9, 40], [10, 55], [11, 55], [13, 20], [14, 50]]),
  hourCells(3, [[8, 15], [9, 50], [10, 55], [11, 25], [14, 20]]),
].flat();

const usage = (techniqueId: string, name: string, mode: string, hours: number, finished: number, ended: number) => ({
  techniqueId, name, mode, focusSecs: hours * 3600, sessions: ended, finished, ended,
});

const periodStats = {
  focusSecs: week.reduce((s, c) => s + c.focusSecs, 0),
  completedCycles: 31,
  sessions: 14,
  activeDays: 4,
  longestStreak: 9,
  buckets: [0, 1, 2, 3].map((d) => ({
    date: `2026-10-${12 + d}`,
    focusSecs: week.filter((c) => c.weekday === d).reduce((s, c) => s + c.focusSecs, 0),
    completedCycles: 8,
    sessions: 4,
  })),
  hours: week,
  weekdayCounts: [1, 1, 1, 1, 1, 1, 1],
  techniques: [
    usage("fifty-two-seventeen", "52/17", "classic", 6.5, 5, 6),
    usage("sprint", "Sprint", "classic", 3, 4, 5),
    usage("flowtime", "Flowtime", "flowtime", 2.5, 0, 3),
  ],
  byLabel: [
    { kind: "named", name: "Learning Tauri", techniqueId: null, focusSecs: 7 * 3600 },
    { kind: "named", name: "Thesis, chapter 3", techniqueId: null, focusSecs: 4 * 3600 },
    { kind: "none", name: null, techniqueId: null, focusSecs: 1 * 3600 },
  ],
  previous: { from: "2026-10-05", to: "2026-10-08", focusSecs: 9 * 3600, completedCycles: 22, sessions: 11, activeDays: 4 },
  firstDay: "2026-03-10",
};

async function open(page: Page) {
  await page.clock.setFixedTime(NOW);
  await page.setViewportSize(SIZE);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await installTauriMock(page, { settings: { theme: "batter", locale: "en", defaultTechniqueId: "sprint", workingOn: "Learning Tauri" } });
  await page.addInitScript(() => {
    const i = (window as any).__TAURI_INTERNALS__;
    const invoke = i.invoke.bind(i);
    i.invoke = async (cmd: string, args: any) =>
      cmd === "get_stats" ? { focusSecsToday: 2 * 3600 + 45 * 60, completedCyclesToday: 7, sessionsToday: 3, streakDays: 9 } : invoke(cmd, args);
  });
  await page.goto("/");
  await page.waitForSelector(".rhythm-card");
  await page.evaluate((stats) => {
    const mock = (window as any).__tempuraMock;
    mock.setPeriodStats(stats);
    mock.emit("stats-updated");
  }, { ...periodStats, hours: week.filter((c) => c.weekday === 3) });
}

test("timer", async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    (window as any).__tempuraMock.setSnapshot({
      running: true, phase: "focus", remainingSecs: 6 * 60 + 20, durationSecs: 15 * 60, cycle: 2,
      techniqueId: "sprint", techniqueName: "Sprint", workingOn: "Learning Tauri",
    }),
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + "timer.png" });
});

test("technique sheet", async ({ page }) => {
  await open(page);
  await page.evaluate(() =>
    (window as any).__TAURI_INTERNALS__.invoke("create_technique", {
      input: { name: "Writing", focusSecs: 40 * 60, shortBreakSecs: 8 * 60, longBreakSecs: 20 * 60, cyclesBeforeLong: 3, flowRatio: null, accent: null, mode: "classic" },
    }),
  );
  await page.locator(".rhythm-card").click();
  await page.locator(".sheet-option").first().hover();
  await page.mouse.move(0, 0);
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + "techniques.png" });
});

test("stats", async ({ page }) => {
  await open(page);
  await page.evaluate((stats) => (window as any).__tempuraMock.setPeriodStats(stats), periodStats);
  await page.locator('[data-open-panel="stats"]').click();
  await page.waitForSelector('[role="dialog"][aria-label="Stats"]');
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + "stats.png" });
});
