/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert@1";
import { showsPaused, startPhaseKey } from "../../src/lib/timerLabels.ts";
import type { TimerSnapshot } from "../../src/lib/types.ts";

const base: TimerSnapshot = {
  phase: "focus",
  remainingSecs: 0,
  elapsedSecs: 0,
  durationSecs: 0,
  paused: false,
  running: true,
  cycle: 0,
  techniqueId: null,
  techniqueName: null,
  mode: "classic",
  isFlow: false,
  hybridSwitched: false,
  workingOn: "",
  awaitingStart: false,
};

Deno.test("startPhaseKey names the waiting phase", () => {
  assertEquals(startPhaseKey("focus"), "timer.startFocus");
  assertEquals(startPhaseKey("short_break"), "timer.startShortBreak");
  assertEquals(startPhaseKey("long_break"), "timer.startLongBreak");
  assertEquals(startPhaseKey("idle"), "timer.startFocus");
});

Deno.test("showsPaused: only a real pause reads as Paused", () => {
  assertEquals(showsPaused(base), false);
  assertEquals(showsPaused({ ...base, paused: true }), true);
  assertEquals(showsPaused({ ...base, paused: true, awaitingStart: true }), false);
  assertEquals(showsPaused({ ...base, paused: true, running: false }), false);
});
