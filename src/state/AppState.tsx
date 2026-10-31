import { createContext, useContext, type ReactNode } from "react";
import { useSession } from "../hooks/useSession";
import { useSettings } from "../hooks/useSettings";
import type { TimerSnapshot } from "../lib/types";

type SessionState = ReturnType<typeof useSession>["session"];
type SettingsState = ReturnType<typeof useSettings>;

const SessionContext = createContext<SessionState | null>(null);
const TimerSnapshotContext = createContext<TimerSnapshot | null>(null);
const SettingsContext = createContext<SettingsState | null>(null);

/**
 * Shares the native-backed session and settings with every route.
 * The Rust side stays the source of truth; these hooks cache it and follow its events.
 *
 * Each hook lives in its own provider so the 250 ms timer tick re-renders only the
 * session provider, and only components that read the live snapshot follow it.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  return (
    <SettingsProvider>
      <SessionProvider>{children}</SessionProvider>
    </SettingsProvider>
  );
}

function SettingsProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  return <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>;
}

function SessionProvider({ children }: { children: ReactNode }) {
  const { session, snapshot } = useSession();
  return (
    <SessionContext.Provider value={session}>
      <TimerSnapshotContext.Provider value={snapshot}>{children}</TimerSnapshotContext.Provider>
    </SessionContext.Provider>
  );
}

/** Session state and actions; stable across timer ticks. */
export function useSessionContext(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSessionContext must be used inside AppStateProvider");
  return value;
}

/** The live timer snapshot; re-renders on every tick, so read it only where the clock shows. */
export function useTimerSnapshot(): TimerSnapshot {
  const value = useContext(TimerSnapshotContext);
  if (!value) throw new Error("useTimerSnapshot must be used inside AppStateProvider");
  return value;
}

export function useSettingsContext(): SettingsState {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettingsContext must be used inside AppStateProvider");
  return value;
}
