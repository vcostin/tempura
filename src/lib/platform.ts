/** Desktop shell helpers — gated so core UI stays mobile-ready. */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function isDesktopShell(): boolean {
  if (!isTauri()) return false;
  const ua = navigator.userAgent.toLowerCase();
  if (/android|iphone|ipad/.test(ua)) return false;
  return true;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauri()) return false;
  const {
    isPermissionGranted,
    requestPermission,
  } = await import("@tauri-apps/plugin-notification");
  let granted = await isPermissionGranted();
  if (!granted) {
    const permission = await requestPermission();
    granted = permission === "granted";
  }
  return granted;
}

export async function setAutostart(enabled: boolean): Promise<void> {
  if (!isDesktopShell()) return;
  const { enable, disable } = await import("@tauri-apps/plugin-autostart");
  if (enabled) await enable();
  else await disable();
}

export async function getAutostartEnabled(): Promise<boolean> {
  if (!isDesktopShell()) return false;
  try {
    const { isEnabled } = await import("@tauri-apps/plugin-autostart");
    return await isEnabled();
  } catch {
    return false;
  }
}
