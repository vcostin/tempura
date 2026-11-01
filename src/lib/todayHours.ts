import type { HourCell } from "./types";

/** Focus seconds for each local hour of one day, 0–23, from `get_period_stats` cells. */
export function hourlyFocus(cells: HourCell[]): number[] {
  const out = Array.from({ length: 24 }, () => 0);
  for (const cell of cells) {
    if (cell.hour >= 0 && cell.hour < 24) out[cell.hour] += Math.max(0, cell.focusSecs);
  }
  return out;
}

/**
 * How full an hour is, 0–5, on a fixed scale (an hour holds at most 60 minutes):
 * 0 none, then under 15, 30, 45 and 55 minutes, and 55 or more.
 */
export function hourLevel(secs: number): number {
  const mins = secs / 60;
  if (mins < 0.5) return 0;
  if (mins < 15) return 1;
  if (mins < 30) return 2;
  if (mins < 45) return 3;
  if (mins < 55) return 4;
  return 5;
}
