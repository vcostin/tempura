/**
 * The report page's arithmetic: which days a range covers, how to page through
 * ranges, and how the period's numbers turn into chart rows. Pure functions over
 * local dates, so they are tested without the app.
 */
import type { DayBucket, HourCell, PeriodStats, TechniqueUsage } from "./types";

export type ReportRange = "week" | "month" | "year" | "all";
export const REPORT_RANGES: ReportRange[] = ["week", "month", "year", "all"];

/** The longest span the backend serves (`MAX_PERIOD_DAYS` in db.rs). */
export const MAX_PERIOD_DAYS = 3660;

export interface DaySpan {
  /** `YYYY-MM-DD`, inclusive. */
  from: string;
  /** `YYYY-MM-DD`, inclusive. */
  to: string;
}

export interface ReportPeriod extends DaySpan {
  /** What to compare with; absent for "all time". */
  compare?: DaySpan;
  /** The whole calendar span, before cutting it at today (for the title). */
  full: DaySpan;
}

/** A local calendar day as `YYYY-MM-DD`. */
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** `YYYY-MM-DD` as local noon, so adding days never trips over DST. */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((parseDay(dayKey(b)).getTime() - parseDay(dayKey(a)).getTime()) / 86_400_000);
}

/**
 * First day of the week for a locale, 1 = Monday … 7 = Sunday (ISO). Uses
 * `Intl.Locale` week info where the engine has it; Monday otherwise.
 */
export function weekStartFor(locale: string): number {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number };
      weekInfo?: { firstDay: number };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    if (info && info.firstDay >= 1 && info.firstDay <= 7) return info.firstDay;
  } catch {
    /* unknown locale: fall through */
  }
  return 1;
}

/**
 * The weekend days for a locale as the backend counts weekdays (0 = Monday …
 * 6 = Sunday). Saturday and Sunday where the engine has no week info.
 */
export function weekendFor(locale: string): number[] {
  try {
    const loc = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { weekend: number[] };
      weekInfo?: { weekend: number[] };
    };
    const info = loc.getWeekInfo?.() ?? loc.weekInfo;
    const days = info?.weekend?.filter((d) => d >= 1 && d <= 7).map((d) => d - 1);
    if (days?.length) return days;
  } catch {
    /* unknown locale: fall through */
  }
  return [5, 6];
}

/** Backend weekday (0 = Monday) of a `YYYY-MM-DD` day. */
export function weekdayOf(key: string): number {
  return (parseDay(key).getDay() + 6) % 7;
}

/** ISO weekday of a date: 1 = Monday … 7 = Sunday. */
function isoWeekday(d: Date): number {
  return d.getDay() === 0 ? 7 : d.getDay();
}

/** The calendar span of `range` around `anchor`, ignoring today. */
function calendarSpan(range: Exclude<ReportRange, "all">, anchor: Date, weekStart: number): [Date, Date] {
  if (range === "week") {
    const back = (isoWeekday(anchor) - weekStart + 7) % 7;
    const start = addDays(anchor, -back);
    return [start, addDays(start, 6)];
  }
  if (range === "month") {
    return [
      new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12),
      new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12),
    ];
  }
  return [new Date(anchor.getFullYear(), 0, 1, 12), new Date(anchor.getFullYear(), 11, 31, 12)];
}

/** The calendar span just before (the previous week, month or year). */
function previousSpan(range: Exclude<ReportRange, "all">, start: Date, weekStart: number): [Date, Date] {
  return calendarSpan(range, addDays(start, -1), weekStart);
}

/**
 * The days a report shows. A range that reaches past today stops at today, and
 * then compares with the same number of days at the start of the previous
 * span (October 1–15 against September 1–15), so a half-finished month isn't
 * measured against a whole one.
 */
export function reportPeriod(
  range: ReportRange,
  anchor: Date,
  opts: { today: Date; weekStart: number; firstDay: string | null },
): ReportPeriod {
  const today = parseDay(dayKey(opts.today));
  if (range === "all") {
    const earliest = addDays(today, -(MAX_PERIOD_DAYS - 1));
    let from = opts.firstDay ? parseDay(opts.firstDay) : today;
    if (from < earliest) from = earliest;
    if (from > today) from = today;
    const span = { from: dayKey(from), to: dayKey(today) };
    return { ...span, full: span };
  }
  const [start, end] = calendarSpan(range, anchor, opts.weekStart);
  // A span entirely after today (paging can't get there) shows its first day.
  const to = end > today ? (today < start ? start : today) : end;
  const [prevStart, prevEnd] = previousSpan(range, start, opts.weekStart);
  // A whole span compares with the whole span before (all of a leap February,
  // all 366 days of a leap year); only a span cut at today matches lengths.
  let prevTo = prevEnd;
  if (to < end) {
    prevTo = addDays(prevStart, daysBetween(start, to));
    if (prevTo > prevEnd) prevTo = prevEnd;
  }
  return {
    from: dayKey(start),
    to: dayKey(to),
    full: { from: dayKey(start), to: dayKey(end) },
    compare: { from: dayKey(prevStart), to: dayKey(prevTo) },
  };
}

/** The anchor one range earlier (`-1`) or later (`+1`). */
export function shiftAnchor(range: ReportRange, anchor: Date, dir: -1 | 1): Date {
  if (range === "week") return addDays(anchor, 7 * dir);
  if (range === "month") return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1, 12);
  if (range === "year") return new Date(anchor.getFullYear() + dir, 0, 1, 12);
  return anchor;
}

/** Whether there is a later range to page to: not past the one holding today. */
export function canPageForward(range: ReportRange, period: ReportPeriod, today: Date): boolean {
  if (range === "all") return false;
  return period.full.to < dayKey(today);
}

/** Whether there is an earlier range with data: only back to the first focus. */
export function canPageBack(range: ReportRange, period: ReportPeriod, firstDay: string | null): boolean {
  if (range === "all" || !firstDay) return false;
  return period.from > firstDay;
}

export interface ChartBar {
  /** First day the bar covers, `YYYY-MM-DD`. */
  date: string;
  unit: "day" | "month";
  focusSecs: number;
}

/** One bar per day for short spans; one per month beyond about two months. */
export function chartBars(buckets: DayBucket[]): ChartBar[] {
  if (buckets.length <= 62) {
    return buckets.map((b) => ({ date: b.date, unit: "day", focusSecs: b.focusSecs }));
  }
  const months: ChartBar[] = [];
  for (const b of buckets) {
    const month = `${b.date.slice(0, 7)}-01`;
    const last = months[months.length - 1];
    if (last?.date === month) last.focusSecs += b.focusSecs;
    else months.push({ date: month, unit: "month", focusSecs: b.focusSecs });
  }
  return months;
}

export interface HeatRow {
  /** 0 = Monday … 6 = Sunday, as the backend counts. */
  weekday: number;
  /** Seconds per hour, 0–23: the total, or the average per week. */
  hours: number[];
}

/**
 * The weekday × hour grid, rows in the locale's week order. `"average"` divides
 * each weekday by how often it occurs in the period (an average week).
 */
export function heatRows(
  stats: Pick<PeriodStats, "hours" | "weekdayCounts">,
  mode: "average" | "total",
  weekStart: number,
): HeatRow[] {
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const cell of stats.hours as HourCell[]) {
    if (cell.weekday < 0 || cell.weekday > 6 || cell.hour < 0 || cell.hour > 23) continue;
    grid[cell.weekday][cell.hour] += cell.focusSecs;
  }
  const rows: HeatRow[] = [];
  for (let i = 0; i < 7; i++) {
    const weekday = (weekStart - 1 + i) % 7;
    const count = stats.weekdayCounts[weekday] ?? 0;
    const hours =
      mode === "total"
        ? grid[weekday]
        : grid[weekday].map((secs) => (count > 0 ? secs / count : 0));
    rows.push({ weekday, hours });
  }
  return rows;
}

/** Colour step 0–5 for a cell: 0 is empty, 5 the busiest cell in view. */
export function heatLevel(secs: number, max: number): number {
  if (secs <= 0 || max <= 0) return 0;
  return Math.min(5, Math.max(1, Math.ceil((secs / max) * 5)));
}

export interface Insights {
  /** Hour of day (0–23) with the most focus across all weekdays. */
  peakHour: number;
  /** Weekday (0 = Monday) with the most focus. */
  busiestWeekday: number;
  /** Share of focus on the weekend days given, 0–1. */
  weekendShare: number;
}

/** A few plain-language facts about when focus happens; null without focus. */
export function insights(hours: HourCell[], weekend: number[] = [5, 6]): Insights | null {
  const byHour = new Array<number>(24).fill(0);
  const byDay = new Array<number>(7).fill(0);
  let total = 0;
  for (const c of hours) {
    if (c.focusSecs <= 0) continue;
    byHour[c.hour] += c.focusSecs;
    byDay[c.weekday] += c.focusSecs;
    total += c.focusSecs;
  }
  if (total <= 0) return null;
  const argmax = (xs: number[]) => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0);
  return {
    peakHour: argmax(byHour),
    busiestWeekday: argmax(byDay),
    weekendShare: weekend.reduce((sum, d) => sum + (byDay[d] ?? 0), 0) / total,
  };
}

/**
 * Share of ended sessions that weren't cut short, 0–1, or null where that
 * means nothing: open-ended rhythms (Flowtime, Hybrid) end mid-focus by design,
 * and a deleted technique's mode is unknown.
 */
export function finishedShare(usage: TechniqueUsage): number | null {
  if (usage.mode !== "classic" || usage.ended <= 0) return null;
  return usage.finished / usage.ended;
}
