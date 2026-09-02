import { invoke } from "@tauri-apps/api/core";
import type { TFunction } from "i18next";
import { i18n } from "./i18n";
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
  getSystemLocale: () => invoke<string>("get_system_locale"),

  getStats: () => invoke<DayStats>("get_stats"),
  getAppInfo: () => invoke<AppInfo>("get_app_info"),
  debugTestNotification: () => invoke<void>("debug_test_notification"),
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

export function formatMinutes(secs: number, t: TFunction = i18n.t.bind(i18n)): string {
  const m = Math.round(secs / 60);
  if (m < 60) return t("format.minutes", { count: m });
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem
    ? t("format.hoursMinutes", { hours: h, minutes: rem })
    : t("format.hours", { count: h });
}

export function phaseLabel(phase: string, t: TFunction = i18n.t.bind(i18n)): string {
  switch (phase) {
    case "focus":
      return t("phase.focus");
    case "short_break":
      return t("phase.short_break");
    case "long_break":
      return t("phase.long_break");
    default:
      return t("phase.idle");
  }
}

/** Human-readable focus / break / long-break summary for a technique. */
export function formatTechniqueRhythm(
  tech: Pick<
    Technique,
    "mode" | "focusSecs" | "shortBreakSecs" | "longBreakSecs" | "cyclesBeforeLong" | "flowRatio"
  >,
  flowRatioFallback = 0.2,
  t: TFunction = i18n.t.bind(i18n),
): string {
  const ratio = tech.flowRatio ?? flowRatioFallback;
  const ratioLabel = `1:${Math.round(1 / ratio)}`;

  if (tech.mode === "flowtime") {
    return t("format.flowtimeRhythm", { ratio: ratio.toFixed(2), ratioLabel });
  }

  const focus = t("format.focusMins", { count: Math.round(tech.focusSecs / 60) });
  const shortBreak = t("format.breakMins", { count: Math.round(tech.shortBreakSecs / 60) });
  const longBreak = t("format.longMins", { count: Math.round(tech.longBreakSecs / 60) });
  const cycles =
    tech.cyclesBeforeLong > 0 ? t("format.longEvery", { count: tech.cyclesBeforeLong }) : "";

  if (tech.mode === "hybrid") {
    return t("format.hybridRhythm", { focus, shortBreak, longBreak, cycles });
  }

  return t("format.classicRhythm", { focus, shortBreak, longBreak, cycles });
}
