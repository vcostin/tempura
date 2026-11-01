import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import { ensureNotificationPermission, isTauri } from "../lib/platform";
import { dayKey } from "../lib/report";
import { hourlyFocus } from "../lib/todayHours";
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
  awaitingStart: false,
  awaySecs: 0,
};

export function useSession() {
  const [snapshot, setSnapshot] = useState<TimerSnapshot>(idleSnap);
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [selectedId, setSelectedId] = useState<string>("classic");
  const [stats, setStats] = useState<DayStats | null>(null);
  /** Focus seconds per local hour today, for the timer's 24-hour strip. */
  const [todayHours, setTodayHours] = useState<number[] | null>(null);
  const [hybridBell, setHybridBell] = useState(false);
  const [ready, setReady] = useState(false);

  const refreshStats = useCallback(async () => {
    if (!isTauri()) return;
    try {
      setStats(await api.getStats());
    } catch {
      /* ignore */
    }
    try {
      const today = dayKey(new Date());
      setTodayHours(hourlyFocus((await api.getPeriodStats(today, today)).hours));
    } catch {
      /* ignore */
    }
  }, []);

  // Past midnight, "today" starts over even if nothing was saved since.
  useEffect(() => {
    let day = dayKey(new Date());
    const id = window.setInterval(() => {
      const now = dayKey(new Date());
      if (now === day) return;
      day = now;
      void refreshStats();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [refreshStats]);

  useEffect(() => {
    // Cleanup can run before boot has registered anything (StrictMode, hot reload):
    // whatever registers after that is removed right away.
    let cancelled = false;
    const unsubs: Array<() => void> = [];
    const keep = (unlisten: () => void) => {
      if (cancelled) unlisten();
      else unsubs.push(unlisten);
    };

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

      keep(await listen<TimerSnapshot>("timer-tick", (e) => setSnapshot(e.payload)));
      keep(
        await listen<PhaseEvent>("timer-phase", (e) => {
          setSnapshot(e.payload.snapshot);
          setHybridBell(false);
        }),
      );
      keep(await listen("hybrid-bell", () => setHybridBell(true)));
      keep(
        await listen("stats-updated", () => {
          void refreshStats();
        }),
      );
      keep(
        await listen("techniques-updated", () => {
          void api.listTechniques().then(setTechniques);
        }),
      );
      keep(
        await listen("open-settings", () => {
          window.dispatchEvent(new CustomEvent("tempura:open-settings"));
        }),
      );
      keep(
        await listen("open-about", () => {
          window.dispatchEvent(new CustomEvent("tempura:open-about"));
        }),
      );
    }

    void boot();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
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

  const countAway = useCallback(async () => {
    setSnapshot(await api.countAway());
    await refreshStats();
  }, [refreshStats]);

  const dismissAway = useCallback(async () => {
    setSnapshot(await api.dismissAway());
  }, []);

  const reloadTechniques = useCallback(async () => {
    setTechniques(await api.listTechniques());
  }, []);

  // The engine ticks every 250 ms while a session runs. Only the clock needs every
  // tick, so the live snapshot is returned on its own and `session` keeps a stable
  // identity until something coarser changes (running, paused, phase, techniques…).
  const { running, paused, awaitingStart, phase } = snapshot;
  const session = useMemo(
    () => ({
      ready,
      running,
      paused,
      awaitingStart,
      phase,
      techniques,
      selectedId,
      setSelectedId,
      stats,
      todayHours,
      hybridBell,
      start,
      pause,
      resume,
      skip,
      reset,
      stop,
      continueFlow,
      countAway,
      dismissAway,
      reloadTechniques,
      refreshStats,
    }),
    [
      ready,
      running,
      paused,
      awaitingStart,
      phase,
      techniques,
      selectedId,
      stats,
      todayHours,
      hybridBell,
      start,
      pause,
      resume,
      skip,
      reset,
      stop,
      continueFlow,
      countAway,
      dismissAway,
      reloadTechniques,
      refreshStats,
    ],
  );

  return { snapshot, session };
}
