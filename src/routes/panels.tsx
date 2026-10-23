import { Navigate, useSearchParams } from "react-router";
import { AboutView } from "../components/AboutView";
import { DebugView } from "../components/DebugView";
import { SettingsView } from "../components/SettingsView";
import { StatsView } from "../components/StatsView";
import { TechniquesGuide } from "../components/TechniquesGuide";
import { api } from "../lib/api";
import { isDebugAccessEnabled } from "../lib/debugAccess";
import { useSessionContext, useSettingsContext } from "../state/AppState";
import { useShell } from "./TimerLayout";

export function SettingsRoute() {
  const session = useSessionContext();
  const settingsApi = useSettingsContext();
  const { openPanel, closePanel } = useShell();
  const [params] = useSearchParams();
  return (
    <SettingsView
      settings={settingsApi.settings}
      onPatch={settingsApi.patch}
      techniques={session.techniques}
      onClose={closePanel}
      desktop={settingsApi.desktop}
      autostart={settingsApi.autostart}
      autostartAvailable={settingsApi.autostartAvailable}
      onToggleAutostart={settingsApi.toggleAutostart}
      onCreateTechnique={settingsApi.createTechnique}
      onUpdateTechnique={settingsApi.updateTechnique}
      onDeleteTechnique={settingsApi.deleteTechnique}
      onTechniquesChanged={session.reloadTechniques}
      composeRecipe={params.get("compose") === "1"}
      onOpenAbout={() => openPanel("about")}
      onQuit={
        settingsApi.desktop
          ? () => {
              void api.requestQuit();
            }
          : undefined
      }
    />
  );
}

export function AboutRoute() {
  const settingsApi = useSettingsContext();
  const { updater, setDebugEnabled, openPanel, closePanel } = useShell();
  return (
    <AboutView
      info={settingsApi.info}
      onClose={closePanel}
      onDebugUnlocked={() => {
        setDebugEnabled(true);
        openPanel("debug");
      }}
      updater={
        updater.available
          ? {
              autoCheck: settingsApi.settings.checkUpdatesOnLaunch,
              onToggleAutoCheck: () =>
                void settingsApi.patch({
                  checkUpdatesOnLaunch: !settingsApi.settings.checkUpdatesOnLaunch,
                }),
              status: updater.status,
              onCheck: updater.check,
              onInstall: updater.install,
            }
          : undefined
      }
    />
  );
}

export function StatsRoute() {
  const session = useSessionContext();
  const { closePanel } = useShell();
  return <StatsView streakFallback={session.stats?.streakDays ?? 0} onClose={closePanel} />;
}

export function GuideRoute() {
  const { openPanel, closePanel } = useShell();
  return (
    <TechniquesGuide onClose={closePanel} onOpenSettings={() => openPanel("settings", "?compose=1")} />
  );
}

export function DebugRoute() {
  const settingsApi = useSettingsContext();
  const { debugEnabled, setDebugEnabled, closePanel } = useShell();
  if (!debugEnabled) return <Navigate to="/" replace />;
  return (
    <DebugView
      info={settingsApi.info}
      onClose={closePanel}
      onAccessChanged={() => setDebugEnabled(isDebugAccessEnabled(settingsApi.info?.debug))}
    />
  );
}
