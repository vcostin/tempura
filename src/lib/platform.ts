/** Desktop shell helpers — gated so core UI stays mobile-ready. */

import { invoke } from "@tauri-apps/api/core";

/** Pinned GitHub Feedback discussion. */
export const FEEDBACK_URL = "https://github.com/vcostin/tempura/discussions/5";

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

/** Open the Feedback discussion in the system browser (no telemetry, no in-app form).
 * Returns false if we could not hand the URL to a browser — callers should still show it. */
export async function openFeedback(): Promise<boolean> {
  try {
    if (isTauri()) {
      await invoke("open_feedback_url", { url: FEEDBACK_URL });
      return true;
    }
  } catch {
    /* command missing or host opener failed — try the webview */
  }
  try {
    const opened = window.open(FEEDBACK_URL, "_blank", "noopener,noreferrer");
    return opened != null;
  } catch {
    return false;
  }
}
