/** Gates the Debug page entry. Hidden until unlocked with {@link enableDebugAccess}
 * (five version clicks in About). Hide again from the Debug view. */

const STORAGE_KEY = "tempura:debug";
const HIDDEN_KEY = "tempura:debug-hidden";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* ignore quota / private mode */
  }
}

/** True when the beetle / Debug view should be available. */
export function isDebugAccessEnabled(infoDebug?: boolean | null): boolean {
  if (readFlag(HIDDEN_KEY)) return false;
  if (import.meta.env.DEV) return true;
  if (infoDebug) return true;
  return readFlag(STORAGE_KEY);
}

export function enableDebugAccess(): void {
  writeFlag(HIDDEN_KEY, false);
  writeFlag(STORAGE_KEY, true);
  window.dispatchEvent(new CustomEvent("tempura:debug-access"));
}

export function disableDebugAccess(): void {
  writeFlag(STORAGE_KEY, false);
  writeFlag(HIDDEN_KEY, true);
  window.dispatchEvent(new CustomEvent("tempura:debug-access"));
}
