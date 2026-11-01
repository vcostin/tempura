/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert@1";
import { rhythmNumbers, rhythmSegments, setPosition } from "../../src/lib/rhythm.ts";
import type { TimerSnapshot } from "../../src/lib/types.ts";

const classic = { mode: "classic" as const, focusSecs: 1500, shortBreakSecs: 300, longBreakSecs: 900, cyclesBeforeLong: 4 };
const flowtime = { mode: "flowtime" as const, focusSecs: 0, shortBreakSecs: 0, longBreakSecs: 0, cyclesBeforeLong: 1 };

function snap(partial: Partial<TimerSnapshot>): TimerSnapshot {
  return {
    phase: "focus",
    remainingSecs: 0,
    elapsedSecs: 0,
    durationSecs: 0,
    paused: false,
    running: true,
    cycle: 0,
    techniqueId: "classic",
    techniqueName: "Classic",
    mode: "classic",
    isFlow: false,
    hybridSwitched: false,
    workingOn: "",
    awaitingStart: false,
    awaySecs: 0,
    ...partial,
  };
}

Deno.test("a set is each focus with its break, the last break long", () => {
  assertEquals(
    rhythmSegments(classic).map((s) => `${s.kind}:${s.secs / 60}`),
    ["focus:25", "short:5", "focus:25", "short:5", "focus:25", "short:5", "focus:25", "long:15"],
  );
  assertEquals(rhythmSegments({ ...classic, cyclesBeforeLong: 1 }).map((s) => s.kind), ["focus", "long"]);
  assertEquals(rhythmSegments(flowtime).map((s) => s.kind), ["flow", "short"]);
});

Deno.test("the short form is focus · break · long in minutes; none for Flowtime", () => {
  assertEquals(rhythmNumbers(classic), "25 · 5 · 15");
  assertEquals(rhythmNumbers(flowtime), null);
});

Deno.test("nothing running has no position", () => {
  assertEquals(setPosition(classic, snap({ running: false, phase: "idle" })), null);
});

Deno.test("the second focus, half done: 1h 22m 30s left in the set", () => {
  const pos = setPosition(classic, snap({ phase: "focus", cycle: 1, remainingSecs: 750, durationSecs: 1500 }))!;
  assertEquals(pos.index, 2);
  assertEquals(pos.fraction, 0.5);
  // 12m30s now, then 5 + 25 + 5 + 25 + 15.
  assertEquals(pos.remainingSecs, 750 + (5 + 25 + 5 + 25 + 15) * 60);
});

Deno.test("breaks sit after the focus they follow; the long break ends the set", () => {
  assertEquals(setPosition(classic, snap({ phase: "short_break", cycle: 1, remainingSecs: 300, durationSecs: 300 }))!.index, 1);
  assertEquals(setPosition(classic, snap({ phase: "short_break", cycle: 7, remainingSecs: 300, durationSecs: 300 }))!.index, 5);
  const long = setPosition(classic, snap({ phase: "long_break", cycle: 8, remainingSecs: 60, durationSecs: 900 }))!;
  assertEquals(long.index, 7);
  assertEquals(long.remainingSecs, 60);
  // The second set starts over.
  assertEquals(setPosition(classic, snap({ phase: "focus", cycle: 4, remainingSecs: 1500, durationSecs: 1500 }))!.index, 0);
});

Deno.test("Flowtime has no set to count down; a Hybrid flowing on fills its focus", () => {
  const flow = setPosition(flowtime, snap({ phase: "focus", isFlow: true, elapsedSecs: 900 }))!;
  assertEquals(flow, { index: 0, fraction: 1, remainingSecs: null });
  const hybrid = setPosition({ ...classic, mode: "hybrid" }, snap({ phase: "focus", isFlow: true, cycle: 0 }))!;
  assertEquals(hybrid.fraction, 1);
  assertEquals(hybrid.remainingSecs, (5 + 25 + 5 + 25 + 5 + 25 + 15) * 60);
});
