/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert@1";
import { barPercent } from "../../src/lib/statsBars.ts";

Deno.test("barPercent scales to the largest row and keeps small rows visible", () => {
  assertEquals(barPercent(600, 600), 100);
  assertEquals(barPercent(300, 600), 50);
  assertEquals(barPercent(1, 600), 4);
  assertEquals(barPercent(0, 600), 0);
  assertEquals(barPercent(0, 0), 0);
});
