/// <reference lib="deno.ns" />
import { assertEquals } from "jsr:@std/assert@1";
import { hotkeyCaps, recordKey, takenBy } from "../../src/lib/hotkeys.ts";

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
