import type { Technique, TimerSnapshot } from "./types";

/** One stretch of a technique's set, as drawn on the rhythm strip. */
export interface RhythmSegment {
  kind: "focus" | "short" | "long" | "flow";
  /** Length in seconds; for open-ended focus, only a relative weight. */
  secs: number;
}

/** Where a running session is in its set. */
export interface SetPosition {
  /** Index into {@link rhythmSegments}. */
  index: number;
  /** How much of the current segment is done, 0–1. */
  fraction: number;
  /** Time left until the set's long break ends; null for open-ended rhythms. */
  remainingSecs: number | null;
}

type Shape = Pick<Technique, "mode" | "focusSecs" | "shortBreakSecs" | "longBreakSecs" | "cyclesBeforeLong">;

/**
 * One set of a technique: each focus block and the break after it, the last break
 * long. Flowtime has no fixed set: an open focus, then a break in proportion.
 */
export function rhythmSegments(tech: Shape): RhythmSegment[] {
  if (tech.mode === "flowtime") {
    return [
      { kind: "flow", secs: 5 },
      { kind: "short", secs: 1 },
    ];
  }
  const n = Math.max(1, tech.cyclesBeforeLong);
  const out: RhythmSegment[] = [];
  for (let i = 0; i < n; i++) {
    out.push({ kind: "focus", secs: Math.max(1, tech.focusSecs) });
    out.push(
      i === n - 1
        ? { kind: "long", secs: Math.max(1, tech.longBreakSecs) }
        : { kind: "short", secs: Math.max(1, tech.shortBreakSecs) },
    );
  }
  return out;
}

/** The short form on the card and in the sheet: focus · break · long break, in minutes. */
export function rhythmNumbers(tech: Shape): string | null {
  if (tech.mode === "flowtime") return null;
  const mins = (secs: number) => String(Math.round(secs / 60));
  return [tech.focusSecs, tech.shortBreakSecs, tech.longBreakSecs].map(mins).join(" · ");
}

/**
 * Where the snapshot sits in the technique's set, or null when nothing runs.
 * `snapshot.cycle` counts finished focus blocks, so during a focus it is the
 * number before this one, and during a break it includes the focus just done.
 */
export function setPosition(tech: Shape, s: TimerSnapshot): SetPosition | null {
  if (!s.running || s.phase === "idle") return null;
  const fraction =
    s.isFlow || s.durationSecs <= 0 ? (s.isFlow ? 1 : 0) : clamp01(1 - s.remainingSecs / s.durationSecs);

  if (tech.mode === "flowtime") {
    return { index: s.phase === "focus" ? 0 : 1, fraction: s.phase === "focus" ? 1 : fraction, remainingSecs: null };
  }

  const n = Math.max(1, tech.cyclesBeforeLong);
  let index: number;
  if (s.phase === "focus") index = 2 * (s.cycle % n);
  else if (s.phase === "long_break") index = 2 * n - 1;
  else index = 2 * ((Math.max(1, s.cycle) - 1) % n) + 1;

  const segments = rhythmSegments(tech);
  const current = s.isFlow ? 0 : Math.max(0, s.remainingSecs);
  const later = segments.slice(index + 1).reduce((sum, seg) => sum + seg.secs, 0);
  return { index, fraction, remainingSecs: current + later };
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
