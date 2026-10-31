import type { GlobalHotkeys } from "./hotkeys";

export type Phase = "idle" | "focus" | "short_break" | "long_break";
export type TechniqueKind = "system" | "custom";

/** How a technique runs its focus. The same names as `TechniqueMode` in Rust. */
export type TechniqueMode = "classic" | "flowtime" | "hybrid";

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
  mode: TechniqueMode;
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
  mode?: TechniqueMode;
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
  /** macOS: the time left shows next to the menu bar icon. */
  menuBarCountdown: boolean;
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
  mode: TechniqueMode;
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

export interface FocusShare {
  /** The label or technique name; empty for "other" and "none". */
  name: string;
  /** Set on by-technique rows, so built-ins show in the user's language. */
  techniqueId: string | null;
  focusSecs: number;
  kind: "named" | "other" | "none";
}

/** Stats for any span of local days (`get_period_stats`). */
export interface PeriodStats {
  /** First local day, `YYYY-MM-DD`, inclusive. */
  from: string;
  /** Last local day, `YYYY-MM-DD`, inclusive. */
  to: string;
  focusSecs: number;
  completedCycles: number;
  /** Sessions active in the period or started in it, each counted once. */
  sessions: number;
  /** Days with any focus. */
  activeDays: number;
  /** Most consecutive days with focus inside the period. */
  longestStreak: number;
  /** One bucket per day, oldest first, empty days included. */
  buckets: DayBucket[];
  byLabel: FocusShare[];
  byTechnique: FocusShare[];
  /** Focus and cycles per weekday and local hour; only cells with any. */
  hours: HourCell[];
  /** How many of each weekday the period holds, Monday first. */
  weekdayCounts: [number, number, number, number, number, number, number];
  /** Per technique, largest focus first. */
  techniques: TechniqueUsage[];
  /** Totals of the period it is compared with. */
  previous: PeriodTotals;
  /** The first day with any focus or cycle ever, for an "all time" view. */
  firstDay: string | null;
}

export interface HourCell {
  /** 0 = Monday … 6 = Sunday. */
  weekday: number;
  /** Local hour, 0–23. */
  hour: number;
  focusSecs: number;
  cycles: number;
}

export interface TechniqueUsage {
  /** Null once a custom technique is deleted; rows then group by name. */
  techniqueId: string | null;
  name: string;
  /** Null once the technique is deleted. */
  mode: TechniqueMode | null;
  focusSecs: number;
  /** Sessions with focus or cycles in the period. */
  sessions: number;
  /** Of `ended`, those not stopped mid-focus or cut off by a crash. Fixed intervals only. */
  finished: number;
  /** Sessions that have ended. */
  ended: number;
}

export interface PeriodTotals {
  from: string;
  to: string;
  focusSecs: number;
  completedCycles: number;
  sessions: number;
  activeDays: number;
}

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

/** Break ≈ work × this when a technique has no flowRatio of its own. */
export const DEFAULT_FLOW_RATIO = 0.2;

export type ExportFormat = "csv" | "json";
