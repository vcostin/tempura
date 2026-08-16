/** Gates the Debug page entry. Always on in Vite/dev and Rust debug builds;
 * unlock in release with {@link enableDebugAccess} (e.g. version click in About). */

const STORAGE_KEY = "tempura:debug";

export function isDebugAccessEnabled(infoDebug?: boolean | null): boolean {
  if (import.meta.env.DEV) return true;
  if (infoDebug) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function enableDebugAccess(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
  window.dispatchEvent(new CustomEvent("tempura:debug-access"));
}

export function disableDebugAccess(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent("tempura:debug-access"));
}
