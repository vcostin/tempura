/** Desktop shell helpers — gated so core UI stays mobile-ready. */

/** GitHub Discussions for product feedback. Prefer a pinned discussion URL when one exists. */
export const FEEDBACK_URL = "https://github.com/vcostin/tempura/discussions";

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

/** Open the Feedback discussion in the system browser (no telemetry, no in-app form). */
export async function openFeedback(): Promise<void> {
  try {
    if (isTauri()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(FEEDBACK_URL);
      return;
    }
  } catch {
    /* fall through to window.open (Vite shell / missing opener) */
  }
  window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer");
}
