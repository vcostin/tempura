/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert@1";
import {
  hotkeyCaps,
  isReserved,
  PRIMARY_KEYS,
  PRIMARY_SHIFT_KEYS,
  recordKey,
  takenBy,
} from "../../src/lib/hotkeys.ts";

const key = (code: string, mods: Partial<Record<"ctrlKey" | "altKey" | "shiftKey" | "metaKey", boolean>> = {}) => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

Deno.test("recordKey builds an accelerator in a fixed modifier order", () => {
  assertEquals(recordKey(key("KeyP", { altKey: true, ctrlKey: true })), {
    kind: "shortcut",
    accelerator: "Control+Alt+KeyP",
  });
  assertEquals(recordKey(key("Digit1", { metaKey: true, shiftKey: true })), {
    kind: "shortcut",
    accelerator: "Shift+Super+Digit1",
  });
});

Deno.test("recordKey waits while only modifiers are held", () => {
  assertEquals(recordKey(key("ControlLeft", { ctrlKey: true })), { kind: "pending" });
  assertEquals(recordKey(key("ShiftRight", { shiftKey: true })), { kind: "pending" });
  assertEquals(recordKey(key("MetaLeft", { metaKey: true })), { kind: "pending" });
});

Deno.test("recordKey refuses keys that would capture typing", () => {
  assertEquals(recordKey(key("KeyP")), { kind: "needsModifier" });
  assertEquals(recordKey(key("KeyP", { shiftKey: true })), { kind: "needsModifier" });
  assertEquals(recordKey(key("Space")), { kind: "needsModifier" });
});

Deno.test("recordKey refuses shortcuts other apps rely on", () => {
  for (
    const [code, mods] of [
      ["KeyC", { ctrlKey: true }],
      ["KeyV", { metaKey: true }],
      ["Space", { metaKey: true }],
      ["Tab", { ctrlKey: true }],
      ["KeyC", { ctrlKey: true, shiftKey: true }],
      ["KeyT", { metaKey: true, shiftKey: true }],
      ["Tab", { altKey: true }],
      ["Tab", { altKey: true, shiftKey: true }],
      ["F4", { altKey: true }],
      ["Space", { altKey: true }],
    ] as const
  ) {
    assertEquals(recordKey(key(code, mods)), { kind: "reserved" }, `${code} ${JSON.stringify(mods)}`);
  }
});

Deno.test("recordKey allows the same keys with more modifiers", () => {
  for (
    const [code, mods] of [
      ["KeyC", { ctrlKey: true, altKey: true }],
      ["KeyV", { ctrlKey: true, metaKey: true }],
      ["KeyP", { ctrlKey: true, shiftKey: true }],
      ["KeyJ", { metaKey: true }],
      ["KeyC", { altKey: true }],
      ["F4", { altKey: true, shiftKey: true }],
      ["Tab", { ctrlKey: true, altKey: true }],
    ] as const
  ) {
    assertEquals(isReserved(key(code, mods)), false, `${code} ${JSON.stringify(mods)}`);
    assertEquals(recordKey(key(code, mods)).kind, "shortcut");
  }
});

Deno.test("reserved keys match the backend's lists", () => {
  const rust = Deno.readTextFileSync(new URL("../../src-tauri/src/hotkeys.rs", import.meta.url));
  const list = (name: string) => {
    const body = rust.match(new RegExp(`const ${name}: &\\[Code\\] = &\\[([^\\]]*)\\]`))?.[1] ?? "";
    return [...body.matchAll(/Code::(\w+)/g)].map((m) => m[1]).sort();
  };
  assertEquals(list("PRIMARY_KEYS"), [...PRIMARY_KEYS].sort());
  assertEquals(list("PRIMARY_SHIFT_KEYS"), [...PRIMARY_SHIFT_KEYS].sort());
});

Deno.test("hotkeyCaps shows readable caps per platform", () => {
  const name = (k: string) => `<${k}>`;
  assertEquals(hotkeyCaps("Control+Alt+KeyP", false, name), ["<ctrl>", "<alt>", "P"]);
  assertEquals(hotkeyCaps("Control+Alt+Shift+Super+Digit1", true, name), ["⌃", "⌥", "⇧", "⌘", "1"]);
  assertEquals(hotkeyCaps("Alt+Space", false, name), ["<alt>", "<space>"]);
  assertEquals(hotkeyCaps("Control+ArrowUp", false, name), ["<ctrl>", "↑"]);
  assertEquals(hotkeyCaps("", false, name), []);
});

Deno.test("takenBy finds another action using the same shortcut", () => {
  const hotkeys = { toggle: "Control+Alt+KeyP", skip: "", show: "", portal: false };
  assertEquals(takenBy(hotkeys, "skip", "Control+Alt+KeyP"), "toggle");
  assertEquals(takenBy(hotkeys, "toggle", "Control+Alt+KeyP"), null);
  assertEquals(takenBy(hotkeys, "skip", "Control+Alt+KeyS"), null);
});
