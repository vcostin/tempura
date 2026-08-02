import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { ensureNotificationPermission, isTauri } from "../lib/platform";
import type { DayStats, PhaseEvent, Technique, TimerSnapshot } from "../lib/types";

const idleSnap: TimerSnapshot = {
  phase: "idle",
  remainingSecs: 0,
  elapsedSecs: 0,
  durationSecs: 0,
  paused: false,
  running: false,
  cycle: 0,
  techniqueId: null,
  techniqueName: null,
  mode: "classic",
  isFlow: false,
  hybridSwitched: false,
  workingOn: "",
};

export function useSession() {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>(idleSnap);
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [selectedId, setSelectedId] = useState<string>("classic");
  const [stats, setStats] = useState<DayStats | null>(null);
  const [hybridBell, setHybridBell] = useState(false);
  const [ready, setReady] = useState(false);

  const refreshStats = useCallback(async () => {
    if (!isTauri()) return;
    try {
      setStats(await api.getStats());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let unsubs: Array<() => void> = [];

    async function boot() {
      if (!isTauri()) {
        setReady(true);
        return;
      }
      try {
        const [state, techs, settings] = await Promise.all([
          api.getTimerState(),
          api.listTechniques(),
          api.getSettings(),
        ]);
        setSnapshot(state);
        setTechniques(techs);
        setSelectedId(settings.defaultTechniqueId || "classic");
        await refreshStats();
        await ensureNotificationPermission();
      } catch (e) {
        console.error(e);
      } finally {
        setReady(true);
      }

      unsubs = [
        await listen<TimerSnapshot>("timer-tick", (e) => setSnapshot(e.payload)),
        await listen<PhaseEvent>("timer-phase", (e) => {
          setSnapshot(e.payload.snapshot);
          if (e.payload.reason !== "hybrid") setHybridBell(false);
        }),
        await listen("hybrid-bell", () => setHybridBell(true)),
        await listen("stats-updated", () => {
          void refreshStats();
        }),
        await listen("open-settings", () => {
          window.dispatchEvent(new CustomEvent("tempura:open-settings"));
        }),
      ];
    }

    void boot();
    return () => unsubs.forEach((u) => u());
  }, [refreshStats]);

  const start = useCallback(async () => {
    setHybridBell(false);
    setSnapshot(await api.start(selectedId));
  }, [selectedId]);

  const pause = useCallback(async () => {
    setSnapshot(await api.pause());
  }, []);

  const resume = useCallback(async () => {
    setHybridBell(false);
    setSnapshot(await api.resume());
  }, []);

  const skip = useCallback(async () => {
    setHybridBell(false);
    setSnapshot(await api.skip());
  }, []);

  const reset = useCallback(async () => {
    setSnapshot(await api.reset());
  }, []);

  const stop = useCallback(async () => {
    setHybridBell(false);
    setSnapshot(await api.stop());
    await refreshStats();
  }, [refreshStats]);

  const continueFlow = useCallback(async () => {
    setHybridBell(false);
    setSnapshot(await api.continueFlow());
  }, []);

  const reloadTechniques = useCallback(async () => {
    setTechniques(await api.listTechniques());
  }, []);

  return {
    ready,
    snapshot,
    techniques,
    selectedId,
    setSelectedId,
    stats,
    hybridBell,
    start,
    pause,
    resume,
    skip,
    reset,
    stop,
    continueFlow,
    reloadTechniques,
    refreshStats,
  };
}
