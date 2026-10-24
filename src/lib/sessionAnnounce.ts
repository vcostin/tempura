import type { TimerSnapshot } from "./types";

export type AnnounceKind =
  | "focus"
  | "short_break"
  | "long_break"
  | "paused"
  | "resumed"
  | "stopped"
  | "ready_focus"
  | "ready_short_break"
  | "ready_long_break";

/**
 * Meaningful session transitions only — not countdown ticks.
 * `prev === null` skips the initial snapshot so a mid-session reload stays quiet.
 */
export function sessionAnnounceKind(
  prev: TimerSnapshot | null,
  next: TimerSnapshot,
): AnnounceKind | null {
  if (!prev) return null;

  const wasActive = prev.running;
  const isActive = next.running;
  const wasPaused = prev.running && prev.paused;
  const isPaused = next.running && next.paused;

  if (wasActive && !isActive) return "stopped";
  // Auto-continue off: the next phase waits; announce it as ready, not paused.
  if (next.awaitingStart && !prev.awaitingStart && next.phase !== "idle") {
    return `ready_${next.phase}` as const;
  }
  if (prev.awaitingStart && !next.awaitingStart && isActive && next.phase !== "idle") {
    return next.phase;
  }
  if (!wasPaused && isPaused) return "paused";
  if (wasPaused && !isPaused && isActive && prev.phase === next.phase) return "resumed";
  if (prev.phase !== next.phase && next.phase !== "idle") return next.phase;

  return null;
}
