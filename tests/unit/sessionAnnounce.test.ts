/// <reference lib="deno.ns" />
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

Deno.test("sessionAnnounceKind: boot / start / pause / resume / skip / stop / tick", () => {
  if (sessionAnnounceKind(null, snap({ phase: "focus", running: true })) !== null) {
    throw new Error("boot: expected null");
  }
  if (sessionAnnounceKind(idle, snap({ phase: "focus", running: true })) !== "focus") {
    throw new Error("start: expected focus");
  }
  if (
    sessionAnnounceKind(
      snap({ phase: "focus", running: true }),
      snap({ phase: "focus", running: true, paused: true }),
    ) !== "paused"
  ) {
    throw new Error("pause: expected paused");
  }
  if (
    sessionAnnounceKind(
      snap({ phase: "focus", running: true, paused: true }),
      snap({ phase: "focus", running: true }),
    ) !== "resumed"
  ) {
    throw new Error("resume: expected resumed");
  }
  if (
    sessionAnnounceKind(
      snap({ phase: "focus", running: true }),
      snap({ phase: "short_break", running: true }),
    ) !== "short_break"
  ) {
    throw new Error("skip to break: expected short_break");
  }
  if (sessionAnnounceKind(snap({ phase: "focus", running: true }), idle) !== "stopped") {
    throw new Error("stop: expected stopped");
  }
  if (
    sessionAnnounceKind(
      snap({ phase: "focus", running: true, remainingSecs: 10 }),
      snap({ phase: "focus", running: true, remainingSecs: 9 }),
    ) !== null
  ) {
    throw new Error("tick: expected null");
  }
});
