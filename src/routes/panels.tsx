import { useRef } from "react";
import { Navigate, useParams, useSearchParams } from "react-router";
import { AboutView } from "../components/AboutView";
import { DebugView } from "../components/DebugView";
import { SettingsView } from "../components/SettingsView";
import { StatsView } from "../components/StatsView";
import { TechniqueEditor } from "../components/TechniqueEditor";
import { TechniquesGuide } from "../components/TechniquesGuide";
import { api } from "../lib/api";
import { isDebugAccessEnabled } from "../lib/debugAccess";
import { useSessionContext, useSettingsContext } from "../state/AppState";
import { useShell } from "./TimerLayout";

export function SettingsRoute() {
  const session = useSessionContext();
  const settingsApi = useSettingsContext();
  const { openPanel, closePanel, openTechniqueEditor } = useShell();
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
      onNewTechnique={() => openTechniqueEditor()}
      onEditTechnique={(id) => openTechniqueEditor({ id })}
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
  const { closePanel, openTechniqueEditor } = useShell();
  return <TechniquesGuide onClose={closePanel} onNewTechnique={() => openTechniqueEditor()} />;
}

/** `/techniques/new` (optionally `?from=<id>`) and `/techniques/:id/edit`. */
export function TechniqueEditorRoute() {
  const session = useSessionContext();
  const settingsApi = useSettingsContext();
  const { goBack } = useShell();
  const { id } = useParams();
  const [params] = useSearchParams();
  const editing = id ? session.techniques.find((tech) => tech.id === id) : undefined;
  const fromId = params.get("from");
  const source = fromId ? session.techniques.find((tech) => tech.id === fromId) : undefined;
  const deletedRef = useRef(false);

  if (id && (!editing || editing.kind !== "custom")) {
    // Just deleted: the list can refresh before history pops, so don't redirect over it.
    if (deletedRef.current) return null;
    // Unknown or built-in technique: nothing to edit here.
    return <Navigate to="/" replace />;
  }

  function select(techId: string) {
    if (session.snapshot.running) return;
    session.setSelectedId(techId);
    if (techId !== settingsApi.settings.defaultTechniqueId) {
      void settingsApi.patch({ defaultTechniqueId: techId });
    }
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
                await settingsApi.deleteTechnique(editing.id);
              } catch (err) {
                deletedRef.current = false;
                throw err;
              }
              if (session.selectedId === editing.id) select("classic");
              await session.reloadTechniques();
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
