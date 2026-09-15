import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DebugView } from "./components/DebugView";
import { SessionAnnouncer } from "./components/SessionAnnouncer";
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

const PANEL_OPENER: Record<Exclude<View, "timer">, string> = {
  settings: '[data-open-panel="settings"]',
  stats: '[data-open-panel="stats"]',
  guide: '[data-open-panel="guide"]',
  debug: '[data-open-panel="debug"]',
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el.isContentEditable;
}

function isButtonish(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === "BUTTON" || tag === "A" || tag === "SUMMARY") return true;
  const role = el.getAttribute("role");
  return role === "button" || role === "switch" || role === "radio" || role === "option" || role === "tab";
}

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
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const panelOpen = view !== "timer";

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

  const openPanel = useCallback((next: Exclude<View, "timer">) => {
    setView((current) => {
      if (current === "timer") {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.closest(".timer-root") && isButtonish(active)) {
          returnFocusRef.current = active;
        } else {
          returnFocusRef.current = document.querySelector<HTMLElement>(PANEL_OPENER[next]);
        }
      }
      return next;
    });
  }, []);

  const closePanel = useCallback(() => setView("timer"), []);

  useLayoutEffect(() => {
    if (view !== "timer") return;
    const el = returnFocusRef.current;
    if (!el?.isConnected) return;
    el.focus();
  }, [view]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      if (workingOn === settingsApi.settings.workingOn) return;
      void settingsApi.patch({ workingOn });
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce working-on only
  }, [workingOn]);

  useEffect(() => {
    const onOpen = () => openPanel("settings");
    window.addEventListener("tempura:open-settings", onOpen);
    return () => window.removeEventListener("tempura:open-settings", onOpen);
  }, [openPanel]);

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
      if (e.key === "Escape") {
        if (e.defaultPrevented) return;
        if (view !== "timer") {
          e.preventDefault();
          closePanel();
        } else if (!isTypingTarget(e.target)) {
          void hideToTray();
        }
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (e.code === "Space") {
        if (view !== "timer" || isButtonish(e.target)) return;
        e.preventDefault();
        if (!session.snapshot.running) void session.start();
        else if (session.snapshot.paused) void session.resume();
        else void session.pause();
      } else if (e.key === "s" || e.key === "S") {
        if (view !== "timer") return;
        if (session.snapshot.running) void session.skip();
      } else if (e.key === "," || (e.ctrlKey && e.key === ",")) {
        e.preventDefault();
        openPanel("settings");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, view, hideToTray, openPanel, closePanel]);

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
    <div
      className="app-shell"
      data-hidden={windowHidden ? "true" : "false"}
      data-panel={panelOpen ? "open" : "closed"}
    >
      <SessionAnnouncer snapshot={session.snapshot} />
      <div className="timer-root" inert={panelOpen || undefined}>
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
          onOpenSettings={() => openPanel("settings")}
          onOpenStats={() => openPanel("stats")}
          onOpenGuide={() => openPanel("guide")}
          onOpenDebug={debugEnabled ? () => openPanel("debug") : undefined}
        />
      </div>

      {view === "settings" && (
        <SettingsView
          settings={settingsApi.settings}
          onPatch={settingsApi.patch}
          techniques={session.techniques}
          onClose={closePanel}
          desktop={settingsApi.desktop}
          autostart={settingsApi.autostart}
          autostartAvailable={settingsApi.autostartAvailable}
          onToggleAutostart={settingsApi.toggleAutostart}
          info={settingsApi.info}
          onCreateTechnique={settingsApi.createTechnique}
          onUpdateTechnique={settingsApi.updateTechnique}
          onDeleteTechnique={settingsApi.deleteTechnique}
          onTechniquesChanged={session.reloadTechniques}
          onOpenGuide={() => openPanel("guide")}
          onDebugUnlocked={() => {
            setDebugEnabled(true);
            openPanel("debug");
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
        <StatsView stats={session.stats} onClose={closePanel} />
      )}

      {view === "guide" && (
        <TechniquesGuide
          onClose={closePanel}
          onOpenSettings={() => openPanel("settings")}
        />
      )}

      {view === "debug" && debugEnabled && (
        <DebugView
          info={settingsApi.info}
          onClose={closePanel}
          onAccessChanged={() =>
            setDebugEnabled(isDebugAccessEnabled(settingsApi.info?.debug))
          }
        />
      )}
    </div>
  );
}
