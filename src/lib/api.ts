import { invoke } from "@tauri-apps/api/core";
import type {
  AppInfo,
  AppSettings,
  DayStats,
  Technique,
  TechniqueInput,
  TimerSnapshot,
} from "./types";

export const api = {
  getTimerState: () => invoke<TimerSnapshot>("get_timer_state"),
  start: (techniqueId?: string) =>
    invoke<TimerSnapshot>("timer_start", { techniqueId: techniqueId ?? null }),
  pause: () => invoke<TimerSnapshot>("timer_pause"),
  resume: () => invoke<TimerSnapshot>("timer_resume"),
  skip: () => invoke<TimerSnapshot>("timer_skip"),
  reset: () => invoke<TimerSnapshot>("timer_reset"),
  stop: () => invoke<TimerSnapshot>("timer_stop"),
  continueFlow: () => invoke<TimerSnapshot>("timer_continue_flow"),

  listTechniques: () => invoke<Technique[]>("list_techniques"),
  createTechnique: (input: TechniqueInput) =>
    invoke<Technique>("create_technique", { input }),
  updateTechnique: (id: string, input: TechniqueInput) =>
    invoke<Technique>("update_technique", { id, input }),
  deleteTechnique: (id: string) => invoke<void>("delete_technique", { id }),

  getSettings: () => invoke<AppSettings>("get_settings"),
  updateSettings: (settings: AppSettings) =>
    invoke<AppSettings>("update_settings", { settings }),

  getStats: () => invoke<DayStats>("get_stats"),
  getAppInfo: () => invoke<AppInfo>("get_app_info"),
  requestQuit: () => invoke<void>("request_quit"),
  hideToTray: () => invoke<void>("hide_to_tray"),
};

export function formatClock(totalSecs: number): string {
  const secs = Math.max(0, Math.floor(totalSecs));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatMinutes(secs: number): string {
  const m = Math.round(secs / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m` : `${h}h`;
}

export function phaseLabel(phase: string): string {
  switch (phase) {
    case "focus":
      return "Focus";
    case "short_break":
      return "Short break";
    case "long_break":
      return "Long break";
    default:
      return "Ready";
  }
}

/** Human-readable focus / break / long-break summary for a technique. */
export function formatTechniqueRhythm(
  t: Pick<
    Technique,
    "mode" | "focusSecs" | "shortBreakSecs" | "longBreakSecs" | "cyclesBeforeLong" | "flowRatio"
  >,
  flowRatioFallback = 0.2,
): string {
  const ratio = t.flowRatio ?? flowRatioFallback;
  const ratioLabel = `1:${Math.round(1 / ratio)}`;

  if (t.mode === "flowtime") {
    return `Count-up focus · break ≈ work × ${ratio.toFixed(2)} (${ratioLabel})`;
  }

  const focus = `${Math.round(t.focusSecs / 60)}m focus`;
  const shortBreak = `${Math.round(t.shortBreakSecs / 60)}m break`;
  const longBreak = `${Math.round(t.longBreakSecs / 60)}m long`;
  const cycles =
    t.cyclesBeforeLong > 0 ? ` · long every ${t.cyclesBeforeLong}` : "";

  if (t.mode === "hybrid") {
    return `${focus} (then optional flow) · ${shortBreak} · ${longBreak}${cycles}`;
  }

  return `${focus} · ${shortBreak} · ${longBreak}${cycles}`;
}
