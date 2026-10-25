/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert@1";
import { isMacPlatform, keyLabel, SHORTCUT_GROUPS } from "../../src/lib/shortcuts.ts";

const name = (key: string) => `<${key}>`;

Deno.test("keyLabel translates named keys and swaps modifiers on macOS", () => {
  assertEquals(keyLabel("space", false, name), "<space>");
  assertEquals(keyLabel("esc", true, name), "<esc>");
  assertEquals(keyLabel("mod", false, name), "<ctrl>");
  assertEquals(keyLabel("mod", true, name), "⌘");
  assertEquals(keyLabel("shift", true, name), "⇧");
  assertEquals(keyLabel("up", false, name), "↑");
  assertEquals(keyLabel("S", false, name), "S");
});

Deno.test("isMacPlatform", () => {
  assertEquals(isMacPlatform({ platform: "MacIntel" }), true);
  assertEquals(isMacPlatform({ platform: "Linux x86_64" }), false);
  assertEquals(isMacPlatform({ platform: "", userAgent: "Mozilla/5.0 (Macintosh)" }), true);
});

Deno.test("every shortcut has an action and at least one key", () => {
  for (const group of SHORTCUT_GROUPS) {
    for (const item of group.items) {
      assertEquals(item.keys.length > 0 && item.keys.every((combo) => combo.length > 0), true, item.action);
    }
  }
});

Deno.test("every action and group has an English string", async () => {
  const en = JSON.parse(await Deno.readTextFile(new URL("../../locales/en/ui.json", import.meta.url)));
  for (const group of SHORTCUT_GROUPS) {
    assertEquals(typeof en.shortcuts[group.title], "string", group.title);
    for (const item of group.items) assertEquals(typeof en.shortcuts[item.action], "string", item.action);
  }
});
