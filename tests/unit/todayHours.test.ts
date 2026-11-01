/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert@1";
import { hourLevel, hourlyFocus } from "../../src/lib/todayHours.ts";

Deno.test("cells add up per hour; other hours stay empty", () => {
  const hours = hourlyFocus([
    { weekday: 6, hour: 9, focusSecs: 1500, cycles: 1 },
    { weekday: 6, hour: 9, focusSecs: 600, cycles: 0 },
    { weekday: 6, hour: 23, focusSecs: 3600, cycles: 2 },
    { weekday: 6, hour: 24, focusSecs: 60, cycles: 0 },
  ]);
  assertEquals(hours.length, 24);
  assertEquals(hours[9], 2100);
  assertEquals(hours[23], 3600);
  assertEquals(hours.reduce((a, b) => a + b, 0), 5700);
});

Deno.test("an hour's level follows minutes on a fixed scale", () => {
  assertEquals([0, 20, 60, 14 * 60, 15 * 60, 30 * 60, 45 * 60, 54 * 60, 55 * 60, 3600].map(hourLevel), [
    0, 0, 1, 1, 2, 3, 4, 4, 5, 5,
  ]);
});
