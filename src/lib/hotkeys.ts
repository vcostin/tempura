import { keyLabel } from "./shortcuts";

/** Recorded system-wide shortcuts, like "Control+Alt+KeyP"; empty means not set. */
export interface GlobalHotkeys {
  toggle: string;
  skip: string;
  show: string;
  /** Wayland: the user set shortcuts up through the desktop's portal. */
  portal: boolean;
}

export type HotkeyAction = "toggle" | "skip" | "show";

export const HOTKEY_ACTIONS: HotkeyAction[] = ["toggle", "skip", "show"];

/**
 * How this session offers global shortcuts: Tempura records keys itself, the
 * Wayland desktop picks them in its own dialog (portal), or, with no portal,
 * the user binds Tempura's commands in the system settings.
 */
export type HotkeyMode = "keys" | "portal" | "commands";

/** A shortcut the desktop assigned through its portal; trigger is its own label. */
export interface PortalShortcut {
  action: HotkeyAction;
  trigger: string;
}

export interface HotkeyReport {
  mode: HotkeyMode;
  /** Actions whose shortcut another app already owns. */
  inUse: HotkeyAction[];
  /** How to launch this Tempura from a system shortcut. */
  command: string;
  /** Linux only: the keys the desktop assigned; empty until set up. */
  portalShortcuts?: PortalShortcut[];
  /** The desktop refused or failed to add the shortcuts last time. */
  portalProblem: boolean;
}

/** Command-line flag for each action, for desktops that bind shortcuts themselves. */
export const HOTKEY_FLAGS: Record<HotkeyAction, string> = {
  toggle: "--toggle",
  skip: "--skip",
  show: "--show",
};

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS|Super|Hyper|Fn)(Left|Right)?$|^(CapsLock|NumLock|ScrollLock)$/;

export type RecordResult =
  | { kind: "pending" }
  | { kind: "needsModifier" }
  | { kind: "shortcut"; accelerator: string };

type KeyInfo = Pick<KeyboardEvent, "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">;

/**
 * Turn a key press into an accelerator the backend understands ("Control+Alt+KeyP").
 * Modifier presses alone are still pending; keys without Ctrl, Alt or Super are
 * refused, since they would swallow ordinary typing in every app.
 */
export function recordKey(e: KeyInfo): RecordResult {
  if (!e.code || MODIFIER_CODES.test(e.code)) return { kind: "pending" };
  if (!e.ctrlKey && !e.altKey && !e.metaKey) return { kind: "needsModifier" };
  const parts = [
    e.ctrlKey && "Control",
    e.altKey && "Alt",
    e.shiftKey && "Shift",
    e.metaKey && "Super",
    e.code,
  ].filter(Boolean);
  return { kind: "shortcut", accelerator: parts.join("+") };
}

const ARROW_KEYS: Record<string, string> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/**
 * The key caps for an accelerator. On macOS the modifiers use their symbols;
 * elsewhere `name` translates them ("ctrl", "alt", "super").
 */
export function hotkeyCaps(accelerator: string, mac: boolean, name: (key: string) => string): string[] {
  if (!accelerator) return [];
  return accelerator.split("+").map((part) => {
    switch (part) {
      case "Control":
        return mac ? "⌃" : name("ctrl");
      case "Alt":
        return mac ? "⌥" : name("alt");
      case "Shift":
        return keyLabel("shift", mac, name);
      case "Super":
        return mac ? "⌘" : name("super");
      case "Space":
        return name("space");
    }
    if (part in ARROW_KEYS) return keyLabel(ARROW_KEYS[part], mac, name);
    return part.replace(/^(Key|Digit|Numpad)/, "");
  });
}

/** The other action already using this accelerator, if any. */
export function takenBy(
  hotkeys: GlobalHotkeys,
  action: HotkeyAction,
  accelerator: string,
): HotkeyAction | null {
  return HOTKEY_ACTIONS.find((other) => other !== action && hotkeys[other] === accelerator) ?? null;
}
