import { createContext, useContext, type ReactNode } from "react";
import { useSession } from "../hooks/useSession";
import { useSettings } from "../hooks/useSettings";

type SessionState = ReturnType<typeof useSession>;
type SettingsState = ReturnType<typeof useSettings>;

const SessionContext = createContext<SessionState | null>(null);
const SettingsContext = createContext<SettingsState | null>(null);

/**
 * Shares the native-backed session and settings with every route.
 * The Rust side stays the source of truth; these hooks cache it and follow its events.
 */
export function AppStateProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const settings = useSettings();
  return (
    <SessionContext.Provider value={session}>
      <SettingsContext.Provider value={settings}>{children}</SettingsContext.Provider>
    </SessionContext.Provider>
  );
}

export function useSessionContext(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSessionContext must be used inside AppStateProvider");
  return value;
}

export function useSettingsContext(): SettingsState {
  const value = useContext(SettingsContext);
  if (!value) throw new Error("useSettingsContext must be used inside AppStateProvider");
  return value;
}
