import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useParams, useSearchParams } from "react-router";
import { AboutView } from "../components/AboutView";
import { DebugView } from "../components/DebugView";
import { SettingsView } from "../components/SettingsView";
import { ShortcutsView } from "../components/ShortcutsView";
import { StatsView } from "../components/StatsView";
import { TechniqueEditor } from "../components/TechniqueEditor";
import { TechniquesLibrary, type LibraryTab } from "../components/TechniquesLibrary";
import { api } from "../lib/api";
import { isDebugAccessEnabled } from "../lib/debugAccess";
import type { Technique, TechniqueInput } from "../lib/types";
import { useSessionContext, useSettingsContext } from "../state/AppState";
import { useTechniqueVisibility } from "../state/techniqueVisibility";
import { useShell } from "./TimerLayout";

/** Make a technique the current and default one; a no-op while a session runs. */
function useSelectTechnique() {
  const session = useSessionContext();
  const settingsApi = useSettingsContext();
  return (id: string) => {
    if (session.snapshot.running) return;
    session.setSelectedId(id);
    const { defaultTechniqueId, hiddenTechniqueIds } = settingsApi.settings;
    if (id !== defaultTechniqueId || hiddenTechniqueIds.includes(id)) {
      // Picking a hidden technique brings it back to the timer.
      void settingsApi.patch({
        defaultTechniqueId: id,
        hiddenTechniqueIds: hiddenTechniqueIds.filter((h) => h !== id),
      });
    }
  };
}

export function SettingsRoute() {
  const session = useSessionContext();
  const settingsApi = useSettingsContext();
  const { openPanel, closePanel } = useShell();
  return (
    <SettingsView
      settings={settingsApi.settings}
      onPatch={settingsApi.patch}
      techniqueCounts={{
        mine: session.techniques.filter((tech) => tech.kind === "custom").length,
        builtIn: session.techniques.filter((tech) => tech.kind === "system").length,
      }}
      onClose={closePanel}
      desktop={settingsApi.desktop}
      autostart={settingsApi.autostart}
      autostartAvailable={settingsApi.autostartAvailable}
      onToggleAutostart={settingsApi.toggleAutostart}
      onOpenTechniques={() => openPanel("techniques")}
      onOpenAbout={() => openPanel("about")}
      onOpenShortcuts={() => openPanel("shortcuts")}
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
      onOpenShortcuts={() => openPanel("shortcuts")}
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

export function ShortcutsRoute() {
  const { goBack } = useShell();
  return <ShortcutsView onClose={goBack} />;
}

export function StatsRoute() {
  const session = useSessionContext();
  const { closePanel } = useShell();
  return <StatsView streakFallback={session.stats?.streakDays ?? 0} onClose={closePanel} />;
}

/** Tab the library reopens on for the rest of this app session. */
let lastLibraryTab: LibraryTab | undefined;

export function TechniquesRoute() {
  const session = useSessionContext();
  const select = useSelectTechnique();
  const deleteTechnique = useDeleteTechnique();
  const { closePanel, openTechniqueEditor, showToast } = useShell();
  const visibility = useTechniqueVisibility(showToast);
  const [params] = useSearchParams();
  return (
    <TechniquesLibrary
      showHidden={params.get("hidden") === "1"}
      isHidden={visibility.isHidden}
      hideBlock={visibility.hideBlock}
      onSetHidden={(tech, hidden) => visibility.setHidden(tech, hidden, false)}
      techniques={session.techniques}
      selectedId={session.selectedId}
      running={session.snapshot.running}
      focusId={params.get("focus") ?? undefined}
      tab={lastLibraryTab}
      onTabChange={(tab) => {
        lastLibraryTab = tab;
      }}
      onUse={(id) => {
        select(id);
        closePanel();
      }}
      onNew={() => {
        lastLibraryTab = "mine";
        openTechniqueEditor();
      }}
      onEdit={(id) => openTechniqueEditor({ id })}
      onDelete={(tech) => void deleteTechnique(tech)}
      onCustomize={(id) => {
        lastLibraryTab = "mine";
        openTechniqueEditor({ from: id });
      }}
      onClose={closePanel}
    />
  );
}

function toInput(tech: Technique): TechniqueInput {
  return {
    name: tech.name,
    focusSecs: tech.focusSecs,
    shortBreakSecs: tech.shortBreakSecs,
    longBreakSecs: tech.longBreakSecs,
    cyclesBeforeLong: tech.cyclesBeforeLong,
    flowRatio: tech.flowRatio,
    accent: tech.accent,
    mode: tech.mode,
  };
}

/** Delete a custom technique and offer Undo, which recreates it (under a new id). */
function useDeleteTechnique() {
  const { t } = useTranslation();
  const session = useSessionContext();
  const settingsApi = useSettingsContext();
  const select = useSelectTechnique();
  const { showToast } = useShell();
  return async (tech: Technique) => {
    const wasSelected = session.selectedId === tech.id;
    await settingsApi.deleteTechnique(tech.id);
    if (wasSelected) select("classic");
    await session.reloadTechniques();
    showToast({
      message: t("toast.deleted", { name: tech.name }),
      actionLabel: t("toast.undo"),
      onAction: () => {
        void settingsApi.createTechnique(toInput(tech)).then(async (restored) => {
          if (wasSelected) select(restored.id);
          await session.reloadTechniques();
        });
      },
    });
  };
}

/** `/techniques/new` (optionally `?from=<id>`) and `/techniques/:id/edit`. */
export function TechniqueEditorRoute() {
  const session = useSessionContext();
  const settingsApi = useSettingsContext();
  const { goBack } = useShell();
  const deleteTechnique = useDeleteTechnique();
  const { id } = useParams();
  const [params] = useSearchParams();
  const editing = id ? session.techniques.find((tech) => tech.id === id) : undefined;
  const fromId = params.get("from");
  const source = fromId ? session.techniques.find((tech) => tech.id === fromId) : undefined;
  const deletedRef = useRef(false);
  const select = useSelectTechnique();

  if (id && (!editing || editing.kind !== "custom")) {
    // Just deleted: the list can refresh before history pops, so don't redirect over it.
    if (deletedRef.current) return null;
    // Unknown or built-in technique: nothing to edit here.
    return <Navigate to="/" replace />;
  }

  return (
    <TechniqueEditor
      key={id ?? `new:${fromId ?? ""}`}
      editing={editing}
      source={source}
      onClose={goBack}
      onSave={async (input) => {
        if (editing) {
          await settingsApi.updateTechnique(editing.id, input);
        } else {
          const created = await settingsApi.createTechnique(input);
          select(created.id);
        }
        await session.reloadTechniques();
        goBack();
      }}
      onDelete={
        editing
          ? async () => {
              deletedRef.current = true;
              try {
                await deleteTechnique(editing);
              } catch (err) {
                deletedRef.current = false;
                throw err;
              }
              goBack();
            }
          : undefined
      }
    />
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
