/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert@1";
import {
  canPageBack,
  canPageForward,
  chartBars,
  finishedShare,
  heatLevel,
  heatRows,
  hourTotals,
  insights,
  parseDay,
  weekdayOf,
  reportPeriod,
  shiftAnchor,
} from "../../src/lib/report.ts";
import type { TechniqueUsage } from "../../src/lib/types.ts";

// Thursday 15 October 2026.
const today = parseDay("2026-10-15");
const opts = { today, weekStart: 1, firstDay: "2026-03-10" };

Deno.test("a past week runs Monday to Sunday and compares with the week before", () => {
  const p = reportPeriod("week", parseDay("2026-10-07"), opts);
  assertEquals([p.from, p.to], ["2026-10-05", "2026-10-11"]);
  assertEquals(p.compare, { from: "2026-09-28", to: "2026-10-04" });
});

Deno.test("weeks follow the locale's first day", () => {
  const sunday = reportPeriod("week", parseDay("2026-10-07"), { ...opts, weekStart: 7 });
  assertEquals([sunday.from, sunday.full.to], ["2026-10-04", "2026-10-10"]);
  const saturday = reportPeriod("week", parseDay("2026-10-10"), { ...opts, weekStart: 6 });
  assertEquals(saturday.from, "2026-10-10");
});

Deno.test("the current month stops at today and compares with as many days before", () => {
  const p = reportPeriod("month", today, opts);
  assertEquals([p.from, p.to], ["2026-10-01", "2026-10-15"]);
  assertEquals(p.full, { from: "2026-10-01", to: "2026-10-31" });
  assertEquals(p.compare, { from: "2026-09-01", to: "2026-09-15" });
});

Deno.test("a short previous month caps the comparison at its last day", () => {
  const march = reportPeriod("month", parseDay("2026-03-31"), { ...opts, today: parseDay("2026-03-31") });
  assertEquals(march.compare, { from: "2026-02-01", to: "2026-02-28" });
});

Deno.test("a past year is the whole calendar year against the one before", () => {
  const p = reportPeriod("year", parseDay("2025-06-01"), opts);
  assertEquals([p.from, p.to], ["2025-01-01", "2025-12-31"]);
  assertEquals(p.compare, { from: "2024-01-01", to: "2024-12-31" });
  // A whole March compares with all of the leap February before it.
  const feb = reportPeriod("month", parseDay("2024-03-05"), opts);
  assertEquals(feb.compare, { from: "2024-02-01", to: "2024-02-29" });
});

Deno.test("all time runs from the first focus to today, with nothing to compare", () => {
  const p = reportPeriod("all", today, opts);
  assertEquals([p.from, p.to, p.compare], ["2026-03-10", "2026-10-15", undefined]);
  assertEquals(reportPeriod("all", today, { ...opts, firstDay: null }).from, "2026-10-15");
  // Capped at what the backend serves.
  assertEquals(reportPeriod("all", today, { ...opts, firstDay: "2000-01-01" }).from, "2016-10-08");
});

Deno.test("paging stops at the range holding today and at the first focus", () => {
  const month = reportPeriod("month", today, opts);
  assertEquals(canPageForward("month", month, today), false);
  const sept = reportPeriod("month", shiftAnchor("month", today, -1), opts);
  assertEquals([sept.from, sept.to], ["2026-09-01", "2026-09-30"]);
  assertEquals(canPageForward("month", sept, today), true);
  assertEquals(canPageBack("month", sept, opts.firstDay), true);
  const march = reportPeriod("month", parseDay("2026-03-20"), opts);
  assertEquals(canPageBack("month", march, opts.firstDay), false);
  assertEquals(canPageBack("month", sept, null), false);
});

Deno.test("shifting a month from the 31st lands in the next month", () => {
  const next = shiftAnchor("month", parseDay("2026-01-31"), 1);
  assertEquals([next.getMonth(), next.getDate()], [1, 1]);
});

Deno.test("short spans get a bar per day, long ones a bar per month", () => {
  const day = (date: string, focusSecs: number) => ({ date, focusSecs, completedCycles: 0, sessions: 0 });
  assertEquals(chartBars([day("2026-10-01", 60)]), [{ date: "2026-10-01", unit: "day", focusSecs: 60 }]);
  const long = [day("2026-08-30", 10), day("2026-08-31", 20)];
  for (let i = 1; i <= 61; i++) long.push(day(`2026-${i <= 30 ? "09" : "10"}-${String(i <= 30 ? i : i - 30).padStart(2, "0")}`, 1));
  assertEquals(chartBars(long), [
    { date: "2026-08-01", unit: "month", focusSecs: 30 },
    { date: "2026-09-01", unit: "month", focusSecs: 30 },
    { date: "2026-10-01", unit: "month", focusSecs: 31 },
  ]);
});

Deno.test("heat rows follow the week start and average per weekday", () => {
  const stats = {
    hours: [
      { weekday: 0, hour: 9, focusSecs: 3600, cycles: 1 },
      { weekday: 6, hour: 20, focusSecs: 1200, cycles: 0 },
    ],
    weekdayCounts: [2, 2, 2, 2, 2, 2, 1] as [number, number, number, number, number, number, number],
  };
  const sundayFirst = heatRows(stats, "average", 7);
  assertEquals(sundayFirst.map((r) => r.weekday), [6, 0, 1, 2, 3, 4, 5]);
  assertEquals(sundayFirst[0].hours[20], 1200);
  assertEquals(sundayFirst[1].hours[9], 1800);
  assertEquals(heatRows(stats, "total", 1)[0].hours[9], 3600);
});

Deno.test("heat levels scale to the busiest cell", () => {
  assertEquals([0, 1, 200, 600, 1000].map((s) => heatLevel(s, 1000)), [0, 1, 1, 3, 5]);
  assertEquals(heatLevel(10, 0), 0);
});

Deno.test("insights name the peak hour, busiest day and weekend share", () => {
  assertEquals(insights([]), null);
  assertEquals(
    insights([
      { weekday: 1, hour: 10, focusSecs: 3000, cycles: 0 },
      { weekday: 2, hour: 10, focusSecs: 1000, cycles: 0 },
      { weekday: 5, hour: 15, focusSecs: 1000, cycles: 0 },
    ]),
    { peakHour: 10, busiestWeekday: 1, weekendShare: 0.2 },
  );
  // A Friday–Saturday weekend: Saturday (5) and Friday (4).
  assertEquals(insights([{ weekday: 4, hour: 9, focusSecs: 500, cycles: 0 }, { weekday: 0, hour: 9, focusSecs: 500, cycles: 0 }], [4, 5])?.weekendShare, 0.5);
});

Deno.test("the finished share is only for fixed-interval rhythms with ended sessions", () => {
  const usage = (mode: TechniqueUsage["mode"], finished: number, ended: number): TechniqueUsage => ({
    techniqueId: "x",
    name: "x",
    mode,
    focusSecs: 1,
    sessions: ended,
    finished,
    ended,
  });
  assertEquals(finishedShare(usage("classic", 3, 4)), 0.75);
  assertEquals(finishedShare(usage("classic", 0, 0)), null);
  assertEquals(finishedShare(usage("flowtime", 0, 3)), null);
  assertEquals(finishedShare(usage("hybrid", 2, 2)), null);
  assertEquals(finishedShare(usage(null, 2, 2)), null);
});

Deno.test("weekdays count from Monday like the backend", () => {
  assertEquals([weekdayOf("2026-10-05"), weekdayOf("2026-10-11")], [0, 6]);
});

Deno.test("a span after today never compares backwards", () => {
  const p = reportPeriod("month", parseDay("2026-12-10"), opts);
  assertEquals([p.from, p.to], ["2026-12-01", "2026-12-01"]);
  assertEquals(p.compare, { from: "2026-11-01", to: "2026-11-01" });
});

Deno.test("a day compares with the day before and pages one day at a time", () => {
  const p = reportPeriod("day", today, opts);
  assertEquals([p.from, p.to, p.full.to], ["2026-10-15", "2026-10-15", "2026-10-15"]);
  assertEquals(p.compare, { from: "2026-10-14", to: "2026-10-14" });
  assertEquals(canPageForward("day", p, today), false);
  const before = reportPeriod("day", shiftAnchor("day", today, -1), opts);
  assertEquals([before.from, canPageForward("day", before, today)], ["2026-10-14", true]);
  // Across a month end.
  assertEquals(reportPeriod("day", shiftAnchor("day", parseDay("2026-03-01"), -1), opts).from, "2026-02-28");
});

Deno.test("hour totals add up a day's hours", () => {
  const totals = hourTotals([
    { weekday: 3, hour: 9, focusSecs: 600, cycles: 0 },
    { weekday: 3, hour: 9, focusSecs: 300, cycles: 0 },
    { weekday: 3, hour: 23, focusSecs: 60, cycles: 0 },
  ]);
  assertEquals([totals.length, totals[9], totals[23], totals[0]], [24, 900, 60, 0]);
});
