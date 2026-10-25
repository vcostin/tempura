import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { i18n, resolveLocale } from "../lib/i18n";
import {
  getAutostartEnabled,
  isDesktopShell,
  isTauri,
  setAutostart,
} from "../lib/platform";
import type { AppInfo, AppSettings, Technique, TechniqueInput } from "../lib/types";
import { THEMES } from "../lib/types";

const defaultSettings: AppSettings = {
  theme: "batter",
  notificationsEnabled: true,
  soundEnabled: true,
  halfwayTick: false,
  defaultTechniqueId: "classic",
  startMinimized: false,
  workingOn: "",
  locale: "",
  checkUpdatesOnLaunch: true,
  hiddenTechniqueIds: [],
  autoContinue: true,
  globalHotkeys: { toggle: "", skip: "", show: "", portal: false },
};

async function systemLocale(): Promise<string> {
  if (isTauri()) {
    try {
      return await api.getSystemLocale();
    } catch {
      return resolveLocale();
    }
  }
  return resolveLocale();
}

async function applyLocale(code: string) {
  const lng = code || (await systemLocale());
  if (i18n.language === lng) return;
  await i18n.changeLanguage(lng);
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  // Latest settings for callbacks that outlive a render (a toast's Undo, a debounced
  // save). Only `commit` writes it, always together with the state.
  const latest = useRef(settings);
  const commit = useCallback((next: AppSettings) => {
    latest.current = next;
    setSettings(next);
  }, []);
  const [autostart, setAutostartState] = useState(false);
  const [autostartAvailable, setAutostartAvailable] = useState(false);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const desktop = isDesktopShell();

  useEffect(() => {
    async function load() {
      if (!isTauri()) {
        document.documentElement.setAttribute("data-theme", settings.theme);
        await applyLocale(settings.locale);
        return;
      }
      const s = await api.getSettings();
      s.hiddenTechniqueIds ??= [];
      s.autoContinue ??= true;
      s.globalHotkeys ??= { toggle: "", skip: "", show: "", portal: false };
      commit(s);
      document.documentElement.setAttribute("data-theme", s.theme);
      await applyLocale(s.locale);
      setInfo(await api.getAppInfo());
      if (desktop) {
        try {
          const enabled = await getAutostartEnabled();
          setAutostartState(enabled);
          setAutostartAvailable(true);
        } catch {
          setAutostartAvailable(false);
        }
      }
    }
    void load();
  }, [desktop, commit]);

  // The tray can change settings too (auto-continue); keep the window in step.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void listen<AppSettings>("settings-updated", (e) => {
      commit({ ...latest.current, autoContinue: e.payload.autoContinue });
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [commit]);

  const save = useCallback(async (next: AppSettings) => {
    commit(next);
    document.documentElement.setAttribute("data-theme", next.theme);
    await applyLocale(next.locale);
    if (isTauri()) {
      await api.updateSettings(next);
    }
  }, [commit]);

  // Merge into the latest settings, not a render's copy: a debounced or tray-driven
  // change in between must not be overwritten.
  const patch = useCallback(
    async (partial: Partial<AppSettings>) => {
      await save({ ...latest.current, ...partial });
    },
    [save],
  );

  /** Show or hide a technique on the timer, against the latest settings. */
  const setTechniqueHidden = useCallback(
    async (id: string, hidden: boolean) => {
      const current = latest.current;
      const others = current.hiddenTechniqueIds.filter((h) => h !== id);
      await save({ ...current, hiddenTechniqueIds: hidden ? [...others, id] : others });
    },
    [save],
  );

  const toggleAutostart = useCallback(async (enabled: boolean) => {
    await setAutostart(enabled);
    setAutostartState(enabled);
  }, []);

  const createTechnique = useCallback(async (input: TechniqueInput) => {
    return api.createTechnique(input);
  }, []);

  const updateTechnique = useCallback(async (id: string, input: TechniqueInput) => {
    return api.updateTechnique(id, input);
  }, []);

  const deleteTechnique = useCallback(async (id: string) => {
    await api.deleteTechnique(id);
  }, []);

  return {
    settings,
    patch,
    save,
    setTechniqueHidden,
    autostart,
    autostartAvailable,
    toggleAutostart,
    desktop,
    info,
    themes: THEMES,
    createTechnique,
    updateTechnique,
    deleteTechnique,
  };
}

export type SettingsApi = ReturnType<typeof useSettings> & {
  techniques: Technique[];
};
