import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
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
  longBreakEveryN: 4,
  flowRatio: 0.2,
  workingOn: "",
};

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [autostart, setAutostartState] = useState(false);
  const [autostartAvailable, setAutostartAvailable] = useState(false);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const desktop = isDesktopShell();

  useEffect(() => {
    async function load() {
      if (!isTauri()) {
        document.documentElement.setAttribute("data-theme", settings.theme);
        return;
      }
      const s = await api.getSettings();
      setSettings(s);
      document.documentElement.setAttribute("data-theme", s.theme);
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
  }, [desktop]);

  const save = useCallback(async (next: AppSettings) => {
    setSettings(next);
    document.documentElement.setAttribute("data-theme", next.theme);
    if (isTauri()) {
      await api.updateSettings(next);
    }
  }, []);

  const patch = useCallback(
    async (partial: Partial<AppSettings>) => {
      await save({ ...settings, ...partial });
    },
    [save, settings],
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
