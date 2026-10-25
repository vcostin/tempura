import type { Page } from "@playwright/test";

/**
 * A tiny in-page stand-in for the Rust backend so flows that save techniques
 * can run in the Vite shell. It answers the commands the UI calls, keeps
 * techniques in memory, and emits `techniques-updated` like `commands.rs`.
 * `window.__tempuraMock` lets a test push timer states and backend events.
 */
export async function installTauriMock(page: Page) {
  await page.addInitScript(() => {
    const now = "2026-01-01T00:00:00Z";
    const sys = (
      id: string,
      name: string,
      focus: number,
      short: number,
      long: number,
      cycles: number,
      mode: string,
      flowRatio: number | null = null,
    ) => ({
      id,
      name,
      kind: "system",
      focusSecs: focus * 60,
      shortBreakSecs: short * 60,
      longBreakSecs: long * 60,
      cyclesBeforeLong: cycles,
      flowRatio,
      accent: null,
      mode,
      createdAt: now,
      updatedAt: now,
    });
    const techniques: Record<string, unknown>[] = [
      sys("classic", "Classic", 25, 5, 15, 4, "classic"),
      sys("sprint", "Sprint", 15, 3, 15, 4, "classic"),
      sys("deep", "Deep", 50, 10, 20, 3, "classic"),
      sys("fifty-two-seventeen", "52/17", 52, 17, 30, 2, "classic"),
      sys("ultradian", "Ultradian", 90, 20, 30, 2, "classic"),
      sys("flowtime", "Flowtime", 0, 0, 0, 1, "flowtime", 0.2),
      sys("hybrid", "Hybrid", 25, 5, 15, 4, "hybrid", 0.2),
    ];
    let settings = {
      theme: "batter",
      notificationsEnabled: true,
      soundEnabled: true,
      halfwayTick: false,
      defaultTechniqueId: "classic",
      startMinimized: false,
      workingOn: "",
      locale: "en",
      checkUpdatesOnLaunch: false,
      hiddenTechniqueIds: [] as string[],
      autoContinue: true,
      menuBarCountdown: true,
      globalHotkeys: { toggle: "", skip: "", show: "", portal: false },
    };
    let snapshot = {
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
    let hotkeyReport: Record<string, unknown> = {
      mode: "keys",
      inUse: [],
      command: "/usr/bin/tempura",
      portalShortcuts: [],
      portalProblem: false,
    };
    // What the desktop's shortcuts dialog "assigns" when setup is asked; null = the user cancels.
    let exportResult: string | null | Error = "tempura-sessions";
    let portalAssigns: { action: string; trigger: string }[] | null = [
      { action: "toggle", trigger: "Ctrl+Alt+P" },
      { action: "skip", trigger: "" },
      { action: "show", trigger: "Super+T" },
    ];
    // An empty range, until a test sets one.
    let statsRange: Record<string, unknown> = {
      days: 7,
      focusSecs: 0,
      completedCycles: 0,
      sessions: 0,
      streakDays: 0,
      buckets: [],
      byLabel: [],
      byTechnique: [],
    };
    let nextId = 1;
    let nextCallback = 1;
    const callbacks = new Map<number, (payload: unknown) => void>();
    const listeners = new Map<string, number[]>();

    function emit(event: string, payload: unknown = null) {
      for (const handler of listeners.get(event) ?? []) {
        callbacks.get(handler)?.({ event, id: handler, payload });
      }
    }

    type Args = Record<string, any>;
    const commands: Record<string, (args: Args) => unknown> = {
      get_timer_state: () => snapshot,
      timer_resume: () => {
        snapshot = { ...snapshot, paused: false, awaitingStart: false, awaySecs: 0 };
        return snapshot;
      },
      timer_count_away: () => {
        snapshot = { ...snapshot, paused: false, awaySecs: 0 };
        return snapshot;
      },
      timer_dismiss_away: () => {
        snapshot = { ...snapshot, awaySecs: 0 };
        return snapshot;
      },
      list_techniques: () => techniques.map((t) => ({ ...t })),
      get_settings: () => settings,
      update_settings: (a) => {
        // Like `AppSettings::validated`: the default technique is never hidden.
        settings = {
          ...a.settings,
          hiddenTechniqueIds: a.settings.hiddenTechniqueIds.filter(
            (id: string) => id !== a.settings.defaultTechniqueId,
          ),
        };
        return settings;
      },
      get_system_locale: () => "en",
      get_stats: () => ({ focusSecsToday: 0, completedCyclesToday: 0, sessionsToday: 0, streakDays: 0 }),
      get_stats_range: (a) => ({ ...statsRange, days: a.days }),
      export_sessions: (a) => {
        if (exportResult instanceof Error) throw exportResult;
        return exportResult && `${exportResult}.${a.format}`;
      },
      get_hotkey_report: () => hotkeyReport,
      setup_portal_hotkeys: () => {
        hotkeyReport = { ...hotkeyReport, portalProblem: !portalAssigns, portalShortcuts: portalAssigns ?? [] };
        return !!portalAssigns;
      },
      get_app_info: () => ({
        name: "Tempura",
        version: "0.0.0-test",
        privacy: "",
        debug: false,
        notificationBackend: "mock",
      }),
      create_technique: (a) => {
        const tech = {
          ...a.input,
          id: `custom-${nextId++}`,
          kind: "custom",
          createdAt: now,
          updatedAt: now,
        };
        techniques.push(tech);
        emit("techniques-updated");
        return tech;
      },
      update_technique: (a) => {
        const i = techniques.findIndex((t) => t.id === a.id);
        techniques[i] = { ...techniques[i], ...a.input };
        emit("techniques-updated");
        return techniques[i];
      },
      delete_technique: (a) => {
        const i = techniques.findIndex((t) => t.id === a.id);
        techniques.splice(i, 1);
        emit("techniques-updated");
        return null;
      },
      "plugin:event|listen": (a) => {
        listeners.set(a.event, [...(listeners.get(a.event) ?? []), a.handler]);
        return a.handler;
      },
      "plugin:notification|is_permission_granted": () => true,
      "plugin:autostart|is_enabled": () => false,
    };

    // Test hooks: push a timer state or a backend event, and see which commands ran.
    const calls: string[] = [];
    (window as any).__tempuraMock = {
      calls,
      emit,
      setSnapshot(partial: Record<string, unknown>) {
        snapshot = { ...snapshot, ...partial } as typeof snapshot;
        emit("timer-tick", snapshot);
      },
      setStatsRange(range: Record<string, unknown>) {
        statsRange = { ...statsRange, ...range };
      },
      setHotkeyReport(report: Record<string, unknown>) {
        hotkeyReport = { ...hotkeyReport, ...report };
      },
      /** What the save dialog does next: a file name without extension, null to cancel, or an Error. */
      setExportResult(result: string | null | { error: string }) {
        exportResult = result && typeof result === "object" ? new Error(result.error) : result;
      },
      setPortalAssigns(assigns: { action: string; trigger: string }[] | null) {
        portalAssigns = assigns;
      },
    };

    (window as any).__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
    (window as any).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      transformCallback(callback: (payload: unknown) => void) {
        const id = nextCallback++;
        callbacks.set(id, callback);
        return id;
      },
      unregisterCallback(id: number) {
        callbacks.delete(id);
      },
      async invoke(cmd: string, args: Args = {}) {
        calls.push(cmd);
        const handler = commands[cmd];
        return handler ? structuredClone(handler(args)) : null;
      },
      convertFileSrc: (path: string) => path,
    };
  });
}
