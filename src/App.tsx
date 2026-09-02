import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DebugView } from "./components/DebugView";
import { SettingsView } from "./components/SettingsView";
import { StatsView } from "./components/StatsView";
import { TechniquesGuide } from "./components/TechniquesGuide";
import { TimerView } from "./components/TimerView";
import { useSession } from "./hooks/useSession";
import { useSettings } from "./hooks/useSettings";
import { api } from "./lib/api";
import { isDebugAccessEnabled } from "./lib/debugAccess";
import { isDesktopShell, isTauri } from "./lib/platform";
import "./styles/fonts.css";
import "./styles/global.css";

type View = "timer" | "settings" | "stats" | "guide" | "debug";

export default function App() {
  const { t } = useTranslation();
  const session = useSession();
  const settingsApi = useSettings();
  const [view, setView] = useState<View>("timer");
  const [windowHidden, setWindowHidden] = useState(false);
  const [workingOn, setWorkingOn] = useState("");
  const [debugEnabled, setDebugEnabled] = useState(() =>
    isDebugAccessEnabled(settingsApi.info?.debug),
  );

  useEffect(() => {
    setDebugEnabled(isDebugAccessEnabled(settingsApi.info?.debug));
  }, [settingsApi.info?.debug]);

  useEffect(() => {
    setWorkingOn(settingsApi.settings.workingOn);
  }, [settingsApi.settings.workingOn]);

  const hideToTray = useCallback(async () => {
    if (!isTauri() || !isDesktopShell()) return;
    try {
      await api.hideToTray();
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (workingOn === settingsApi.settings.workingOn) return;
      void settingsApi.patch({ workingOn });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce working-on only
  }, [workingOn]);

  useEffect(() => {
    const onOpen = () => setView("settings");
    window.addEventListener("tempura:open-settings", onOpen);
    return () => window.removeEventListener("tempura:open-settings", onOpen);
  }, []);

  useEffect(() => {
    const onDebugAccess = () => {
      setDebugEnabled(isDebugAccessEnabled(settingsApi.info?.debug));
    };
    window.addEventListener("tempura:debug-access", onDebugAccess);
    return () => window.removeEventListener("tempura:debug-access", onDebugAccess);
  }, [settingsApi.info?.debug]);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const win = getCurrentWindow();
      unlisten = await win.onFocusChanged(({ payload: focused }) => {
        setWindowHidden(!focused);
      });
    })();
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (e.code === "Space") {
        e.preventDefault();
        if (!session.snapshot.running) void session.start();
        else if (session.snapshot.paused) void session.resume();
        else void session.pause();
      } else if (e.key === "s" || e.key === "S") {
        if (session.snapshot.running) void session.skip();
      } else if (e.key === "," || (e.ctrlKey && e.key === ",")) {
        e.preventDefault();
        setView("settings");
      } else if (e.key === "Escape") {
        if (view !== "timer") setView("timer");
        else void hideToTray();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, view, hideToTray]);

  if (!session.ready) {
    return (
      <div className="app-shell">
        <h1 className="brand">
          Tem<span>pura</span>
        </h1>
        <p className="tagline tagline--accent">{t("brand.warming")}</p>
      </div>
    );
  }

  return (
    <div className="app-shell" data-hidden={windowHidden ? "true" : "false"}>
      {view === "timer" && (
        <TimerView
          snapshot={session.snapshot}
          techniques={session.techniques}
          selectedId={session.selectedId}
          onSelectTechnique={session.setSelectedId}
          stats={session.stats}
          hybridBell={session.hybridBell}
          workingOn={workingOn}
          onWorkingOn={setWorkingOn}
          onStart={() => void session.start()}
          onPause={() => void session.pause()}
          onResume={() => void session.resume()}
          onSkip={() => void session.skip()}
          onReset={() => void session.reset()}
          onStop={() => void session.stop()}
          onContinueFlow={() => void session.continueFlow()}
          onOpenSettings={() => setView("settings")}
          onOpenStats={() => setView("stats")}
          onOpenGuide={() => setView("guide")}
          onOpenDebug={debugEnabled ? () => setView("debug") : undefined}
        />
      )}

      {view === "settings" && (
        <SettingsView
          settings={settingsApi.settings}
          onPatch={settingsApi.patch}
          techniques={session.techniques}
          onClose={() => setView("timer")}
          desktop={settingsApi.desktop}
          autostart={settingsApi.autostart}
          autostartAvailable={settingsApi.autostartAvailable}
          onToggleAutostart={settingsApi.toggleAutostart}
          info={settingsApi.info}
          onCreateTechnique={settingsApi.createTechnique}
          onUpdateTechnique={settingsApi.updateTechnique}
          onDeleteTechnique={settingsApi.deleteTechnique}
          onTechniquesChanged={session.reloadTechniques}
          onOpenGuide={() => setView("guide")}
          onDebugUnlocked={() => {
            setDebugEnabled(true);
            setView("debug");
          }}
          onQuit={
            settingsApi.desktop
              ? () => {
                  void api.requestQuit();
                }
              : undefined
          }
        />
      )}

      {view === "stats" && (
        <StatsView stats={session.stats} onClose={() => setView("timer")} />
      )}

      {view === "guide" && (
        <TechniquesGuide
          onClose={() => setView("timer")}
          onOpenSettings={() => setView("settings")}
        />
      )}

      {view === "debug" && debugEnabled && (
        <DebugView
          info={settingsApi.info}
          onClose={() => setView("timer")}
          onAccessChanged={() =>
            setDebugEnabled(isDebugAccessEnabled(settingsApi.info?.debug))
          }
        />
      )}
    </div>
  );
}
