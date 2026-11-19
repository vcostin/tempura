/**
 * A believable week of focus for screenshots and layout tests (Thursday 15 October 2026).
 * Task names "{{task}}" / "{{thesis}}" are placeholders the website shots replace per locale.
 */
// Thursday 15 October 2026, mid-afternoon.
export const NOW = new Date(2026, 9, 15, 15, 20);

const hourCells = (weekday: number, hours: [number, number][]) =>
  hours.map(([hour, mins]) => ({ weekday, hour, focusSecs: mins * 60, cycles: Math.round(mins / 25) }));

export const week = [
  // Monday … Thursday (today): minutes per hour.
  hourCells(0, [[9, 50], [10, 55], [11, 30], [14, 45], [15, 25]]),
  hourCells(1, [[8, 25], [9, 55], [10, 50], [16, 40]]),
  hourCells(2, [[9, 40], [10, 55], [11, 55], [13, 20], [14, 50]]),
  hourCells(3, [[8, 15], [9, 50], [10, 55], [11, 25], [14, 20]]),
].flat();

const usage = (techniqueId: string, name: string, mode: string, hours: number, finished: number, ended: number) => ({
  techniqueId, name, mode, focusSecs: hours * 3600, sessions: ended, finished, ended,
});

export const periodStats = {
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
    { kind: "named", name: "{{task}}", techniqueId: null, focusSecs: 7 * 3600 },
    { kind: "named", name: "{{thesis}}", techniqueId: null, focusSecs: 4 * 3600 },
    { kind: "none", name: null, techniqueId: null, focusSecs: 1 * 3600 },
  ],
  previous: { from: "2026-10-05", to: "2026-10-08", focusSecs: 9 * 3600, completedCycles: 22, sessions: 11, activeDays: 4 },
  firstDay: "2026-03-10",
};
