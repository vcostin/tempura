import type { Phase, TimerSnapshot } from "./types";

const START_PHASE_KEYS = {
  idle: "timer.startFocus",
  focus: "timer.startFocus",
  short_break: "timer.startShortBreak",
  long_break: "timer.startLongBreak",
} as const satisfies Record<Phase, string>;

/** Label for starting a phase that waits for the user (auto-continue off). */
export function startPhaseKey(phase: Phase): (typeof START_PHASE_KEYS)[Phase] {
  return START_PHASE_KEYS[phase];
}

/** A held phase is paused under the hood but reads as its own phase, not "Paused". */
export function showsPaused(s: TimerSnapshot): boolean {
  return s.running && s.paused && !s.awaitingStart;
}

/** Away this long (seconds) and the timer asks whether to count it as focus. */
export const COUNT_AWAY_PROMPT_SECS = 10 * 60;

/** A long time away during focus: offer to count it. Shorter gaps just stay paused. */
export function offersToCountAway(s: TimerSnapshot): boolean {
  return s.paused && s.awaySecs >= COUNT_AWAY_PROMPT_SECS;
}
