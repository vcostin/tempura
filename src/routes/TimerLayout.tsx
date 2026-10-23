import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate, useOutletContext } from "react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { SessionAnnouncer } from "../components/SessionAnnouncer";
import { TimerView } from "../components/TimerView";
import { useUpdater } from "../hooks/useUpdater";
import { api } from "../lib/api";
import { isDebugAccessEnabled } from "../lib/debugAccess";
import { isDesktopShell, isTauri } from "../lib/platform";
import { useSessionContext, useSettingsContext } from "../state/AppState";

export type Panel = "settings" | "stats" | "guide" | "debug" | "about";

const PANEL_OPENER: Record<Panel, string> = {
  settings: '[data-open-panel="settings"]',
  stats: '[data-open-panel="stats"]',
  guide: '[data-open-panel="guide"]',
  debug: '[data-open-panel="debug"]',
  about: '[data-open-panel="about"]',
};

/** What the timer shell hands to panel routes. */
export interface Shell {
  updater: ReturnType<typeof useUpdater>;
  debugEnabled: boolean;
  setDebugEnabled: (enabled: boolean) => void;
  openPanel: (panel: Panel, search?: string) => void;
  closePanel: () => void;
}

export function useShell(): Shell {
  return useOutletContext<Shell>();
}

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

/** Root route: the timer stays mounted and panel routes render over it. */
export function TimerLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const session = useSessionContext();
  const settingsApi = useSettingsContext();
  const updater = useUpdater({
    ready: settingsApi.info != null,
    autoCheck: settingsApi.settings.checkUpdatesOnLaunch,
    allowAutoOffer: settingsApi.info != null && !settingsApi.info.debug,
  });
  const [windowHidden, setWindowHidden] = useState(false);
  const [workingOn, setWorkingOn] = useState("");
  const [debugEnabled, setDebugEnabled] = useState(() =>
    isDebugAccessEnabled(settingsApi.info?.debug),
  );
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const updateOfferedRef = useRef(false);
  const onTimer = location.pathname === "/";
  const onAbout = location.pathname === "/about";

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

  const openPanel = useCallback(
    (panel: Panel, search = "") => {
      if (onTimer) {
        const active = document.activeElement;
        if (active instanceof HTMLElement && active.closest(".timer-root") && isButtonish(active)) {
          returnFocusRef.current = active;
        } else {
          returnFocusRef.current = document.querySelector<HTMLElement>(PANEL_OPENER[panel]);
        }
      }
      navigate({ pathname: `/${panel}`, search });
    },
    [navigate, onTimer],
  );

  const closePanel = useCallback(() => {
    if (onAbout && updater.hasOffer) updater.skip();
    navigate("/");
  }, [navigate, onAbout, updater.hasOffer, updater.skip]);

  useLayoutEffect(() => {
    if (!onTimer) return;
    const el = returnFocusRef.current;
    if (!el?.isConnected) return;
    el.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
  }, [onTimer]);

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
    const onOpen = () => openPanel("about");
    window.addEventListener("tempura:open-about", onOpen);
    return () => window.removeEventListener("tempura:open-about", onOpen);
  }, [openPanel]);

  useEffect(() => {
    if (!updater.hasOffer || updateOfferedRef.current) return;
    updateOfferedRef.current = true;
    if (onTimer) openPanel("about");
  }, [updater.hasOffer, onTimer, openPanel]);

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
        if (!onTimer) {
          e.preventDefault();
          closePanel();
        } else if (!isTypingTarget(e.target)) {
          void hideToTray();
        }
        return;
      }

      if (isTypingTarget(e.target)) return;

      if (e.code === "Space") {
        if (!onTimer || isButtonish(e.target)) return;
        e.preventDefault();
        if (!session.snapshot.running) void session.start();
        else if (session.snapshot.paused) void session.resume();
        else void session.pause();
      } else if (e.key === "s" || e.key === "S") {
        if (!onTimer) return;
        if (session.snapshot.running) void session.skip();
      } else if (e.key === "," || (e.ctrlKey && e.key === ",")) {
        e.preventDefault();
        openPanel("settings");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, onTimer, hideToTray, openPanel, closePanel]);

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

  const shell: Shell = { updater, debugEnabled, setDebugEnabled, openPanel, closePanel };

  return (
    <div
      className="app-shell"
      data-hidden={windowHidden ? "true" : "false"}
      data-panel={onTimer ? "closed" : "open"}
    >
      <SessionAnnouncer snapshot={session.snapshot} />
      <div className="timer-root" inert={!onTimer || undefined}>
        <TimerView
          snapshot={session.snapshot}
          techniques={session.techniques}
          selectedId={session.selectedId}
          onSelectTechnique={(id) => {
            session.setSelectedId(id);
            if (id !== settingsApi.settings.defaultTechniqueId) {
              void settingsApi.patch({ defaultTechniqueId: id });
            }
          }}
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
          onOpenAbout={() => openPanel("about")}
          onOpenDebug={debugEnabled ? () => openPanel("debug") : undefined}
        />
      </div>

      <Outlet context={shell} />
    </div>
  );
}
