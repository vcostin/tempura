import type { GlobalHotkeys } from "./hotkeys";

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
  workingOn: string;
  locale: string;
  checkUpdatesOnLaunch: boolean;
  /** Techniques left off the timer's picker; empty means all show. */
  hiddenTechniqueIds: string[];
  /** Start the next break or focus on its own; off waits for the user. */
  autoContinue: boolean;
  /** Opt-in system-wide shortcuts; empty strings are not set. */
  globalHotkeys: GlobalHotkeys;
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
  /** The next phase is set up but waits for the user (auto-continue off). */
  awaitingStart: boolean;
  /** Seconds the computer was away (asleep) when focus paused for it; 0 otherwise. */
  awaySecs: number;
}

export interface DayStats {
  focusSecsToday: number;
  completedCyclesToday: number;
  sessionsToday: number;
  streakDays: number;
}

export interface DayBucket {
  date: string;
  focusSecs: number;
  completedCycles: number;
  sessions: number;
}

export interface StatsRange {
  days: number;
  focusSecs: number;
  completedCycles: number;
  sessions: number;
  streakDays: number;
  buckets: DayBucket[];
  /** Focus time per "Working on" label, largest first. */
  byLabel: FocusShare[];
  /** Focus time per technique, largest first. */
  byTechnique: FocusShare[];
}

export interface FocusShare {
  /** The label or technique name; empty for "other" and "none". */
  name: string;
  /** Set on by-technique rows, so built-ins show in the user's language. */
  techniqueId: string | null;
  focusSecs: number;
  kind: "named" | "other" | "none";
}

export type StatsPeriod = 1 | 7 | 30;

export interface AppInfo {
  name: string;
  version: string;
  privacy: string;
  /** True in `tauri:dev` / debug builds — gates developer-only UI. */
  debug: boolean;
  /** Active desktop notification backend (Debug page). */
  notificationBackend: string;
}

export interface PhaseEvent {
  phase: Phase;
  previous: Phase;
  snapshot: TimerSnapshot;
  reason: string;
}

export const THEMES = [
  { id: "batter" },
  { id: "mist" },
  { id: "grove" },
  { id: "dusk" },
  { id: "sandstone" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

/** Break ≈ work × this when a technique has no flowRatio of its own. */
export const DEFAULT_FLOW_RATIO = 0.2;
