export type Phase = "idle" | "focus" | "short_break" | "long_break";
export type TechniqueKind = "system" | "custom";

export interface Technique {
  id: string;
  name: string;
  kind: TechniqueKind;
  focusSecs: number;
  shortBreakSecs: number;
  longBreakSecs: number;
  cyclesBeforeLong: number;
  flowRatio: number | null;
  accent: string | null;
  mode: string;
  createdAt: string;
  updatedAt: string;
}

export interface TechniqueInput {
  name: string;
  focusSecs: number;
  shortBreakSecs: number;
  longBreakSecs: number;
  cyclesBeforeLong: number;
  flowRatio?: number | null;
  accent?: string | null;
  mode?: string;
}

export interface AppSettings {
  theme: string;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  halfwayTick: boolean;
  defaultTechniqueId: string;
  startMinimized: boolean;
  longBreakEveryN: number;
  flowRatio: number;
  workingOn: string;
}

export interface TimerSnapshot {
  phase: Phase;
  remainingSecs: number;
  elapsedSecs: number;
  durationSecs: number;
  paused: boolean;
  running: boolean;
  cycle: number;
  techniqueId: string | null;
  techniqueName: string | null;
  mode: string;
  isFlow: boolean;
  hybridSwitched: boolean;
  workingOn: string;
}

export interface DayStats {
  focusSecsToday: number;
  completedCyclesToday: number;
  sessionsToday: number;
  streakDays: number;
}

export interface AppInfo {
  name: string;
  version: string;
  privacy: string;
  /** True in `tauri dev` / debug builds — gates developer-only UI. */
  debug: boolean;
}

export interface PhaseEvent {
  phase: Phase;
  previous: Phase;
  snapshot: TimerSnapshot;
  reason: string;
}

export const THEMES = [
  { id: "batter", label: "Batter" },
  { id: "mist", label: "Mist" },
  { id: "grove", label: "Grove" },
  { id: "dusk", label: "Dusk" },
  { id: "sandstone", label: "Sandstone" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];
