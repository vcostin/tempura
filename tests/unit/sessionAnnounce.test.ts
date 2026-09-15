import { sessionAnnounceKind } from "../../src/lib/sessionAnnounce.ts";
import type { TimerSnapshot } from "../../src/lib/types.ts";

const idle: TimerSnapshot = {
  phase: "idle",
  remainingSecs: 0,
  elapsedSecs: 0,
  durationSecs: 0,
  paused: false,
  running: false,
  cycle: 0,
  techniqueId: null,
  techniqueName: null,
  mode: "classic",
  isFlow: false,
  hybridSwitched: false,
  workingOn: "",
};

function snap(partial: Partial<TimerSnapshot>): TimerSnapshot {
  return { ...idle, ...partial };
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

assertEqual(sessionAnnounceKind(null, snap({ phase: "focus", running: true })), null, "boot");
assertEqual(
  sessionAnnounceKind(idle, snap({ phase: "focus", running: true })),
  "focus",
  "start",
);
assertEqual(
  sessionAnnounceKind(
    snap({ phase: "focus", running: true }),
    snap({ phase: "focus", running: true, paused: true }),
  ),
  "paused",
  "pause",
);
assertEqual(
  sessionAnnounceKind(
    snap({ phase: "focus", running: true, paused: true }),
    snap({ phase: "focus", running: true }),
  ),
  "resumed",
  "resume",
);
assertEqual(
  sessionAnnounceKind(
    snap({ phase: "focus", running: true }),
    snap({ phase: "short_break", running: true }),
  ),
  "short_break",
  "skip to break",
);
assertEqual(
  sessionAnnounceKind(snap({ phase: "focus", running: true }), idle),
  "stopped",
  "stop",
);
assertEqual(
  sessionAnnounceKind(
    snap({ phase: "focus", running: true, remainingSecs: 10 }),
    snap({ phase: "focus", running: true, remainingSecs: 9 }),
  ),
  null,
  "tick",
);

console.log("sessionAnnounce unit tests passed");
