/**
 * Every key Tempura listens to, for the shortcuts page. Keep this in step with
 * the handlers in `TimerLayout.tsx`, `TechniquePicker.tsx` and
 * `TechniquesLibrary.tsx`: no secret shortcuts.
 */

/** A key cap. Named keys are translated or swapped per platform; others print as-is. */
export type Key = "space" | "esc" | "mod" | "shift" | "up" | "down" | "left" | "right" | string;

export interface Shortcut {
  /** Alternatives; each one is a combination pressed together. */
  keys: Key[][];
  /** `shortcuts.<action>` in the locale files. */
  action: string;
}

export interface ShortcutGroup {
  /** `shortcuts.<title>` in the locale files. */
  title: string;
  items: Shortcut[];
}

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "groupTimer",
    items: [
      { keys: [["space"]], action: "startPause" },
      { keys: [["S"]], action: "skip" },
      { keys: [["esc"]], action: "hideToTray" },
    ],
  },
  {
    title: "groupAnywhere",
    items: [
      { keys: [["?"]], action: "showShortcuts" },
      { keys: [[","], ["mod", ","]], action: "openSettings" },
      { keys: [["esc"]], action: "closePanel" },
      { keys: [["mod", "Z"]], action: "undo" },
    ],
  },
  {
    title: "groupTechniques",
    items: [
      { keys: [["shift", "F10"], ["menu"]], action: "techniqueMenu" },
      { keys: [["up"], ["down"], ["Home"], ["End"]], action: "moveInMenu" },
      { keys: [["left"], ["right"], ["Home"], ["End"]], action: "switchTabs" },
    ],
  },
];

const ARROWS: Record<string, string> = { up: "↑", down: "↓", left: "←", right: "→" };

/**
 * What a key cap shows. `name` translates the named keys ("space", "esc",
 * "shift", "menu", "ctrl"); `mac` swaps Ctrl for ⌘ and Shift for ⇧.
 */
export function keyLabel(key: Key, mac: boolean, name: (key: string) => string): string {
  if (key in ARROWS) return ARROWS[key];
  if (key === "mod") return mac ? "⌘" : name("ctrl");
  if (key === "shift") return mac ? "⇧" : name("shift");
  if (key === "space" || key === "esc" || key === "menu") return name(key);
  return key;
}

export function isMacPlatform(nav: { platform?: string; userAgent?: string } = navigator): boolean {
  return /Mac|iPhone|iPad/.test(nav.platform || nav.userAgent || "");
}
