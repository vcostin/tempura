import type { TimerSnapshot } from "./types";

export type AnnounceKind =
  | "focus"
  | "short_break"
  | "long_break"
  | "paused"
  | "resumed"
  | "stopped";

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
  if (!wasPaused && isPaused) return "paused";
  if (wasPaused && !isPaused && isActive && prev.phase === next.phase) return "resumed";
  if (prev.phase !== next.phase && next.phase !== "idle") return next.phase;

  return null;
}
