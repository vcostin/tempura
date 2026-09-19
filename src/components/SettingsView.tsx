import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatTechniqueRhythm } from "../lib/api";
import { LOCALES } from "../lib/i18n";
import type { AppSettings, Technique, TechniqueInput } from "../lib/types";
import { THEMES } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";
import { Select } from "./Select";

interface Props {
  settings: AppSettings;
  onPatch: (partial: Partial<AppSettings>) => Promise<void>;
  techniques: Technique[];
  onClose: () => void;
  desktop: boolean;
  autostart: boolean;
  autostartAvailable: boolean;
  onToggleAutostart: (enabled: boolean) => Promise<void>;
  onCreateTechnique: (input: TechniqueInput) => Promise<Technique>;
  onUpdateTechnique: (id: string, input: TechniqueInput) => Promise<Technique>;
  onDeleteTechnique: (id: string) => Promise<void>;
  onTechniquesChanged: () => Promise<void>;
  onOpenAbout?: () => void;
  onQuit?: () => void;
  /** Open already composing a custom technique (from the guide). */
  composeRecipe?: boolean;
}

type Draft = {
  name: string;
  focusMins: number;
  shortMins: number;
  longMins: number;
  cycles: number;
  mode: string;
  flowPct: number;
};

function blankDraft(flowRatio: number): Draft {
  return {
    name: "",
    focusMins: 25,
    shortMins: 5,
    longMins: 15,
    cycles: 4,
    mode: "classic",
    flowPct: Math.round(flowRatio * 100),
  };
}

export function SettingsView(props: Props) {
  const { t, i18n } = useTranslation();
  const { settings } = props;
  const customs = props.techniques.filter((tech) => tech.kind === "custom");

  return (
    <ScrollPanel label={t("settings.panel")}>
      <BrandHeader
        line={t("settings.line")}
        actions={
          <button
            type="button"
            className="icon-btn"
            data-dialog-close
            aria-label={t("settings.close")}
            onClick={props.onClose}
          >
            ✕
          </button>
        }
      />

      <section className="section">
        <h2>{t("settings.look")}</h2>
        <div className="field">
          <label htmlFor="locale">{t("settings.language")}</label>
          <Select
            id="locale"
            value={settings.locale || i18n.resolvedLanguage || i18n.language || "en"}
            onChange={(code) => void props.onPatch({ locale: code })}
            options={LOCALES.map((loc) => ({ value: loc.code, label: loc.nativeName }))}
          />
        </div>
        <div className="field">
          <label id="theme-label">{t("settings.theme")}</label>
          <div className="theme-grid" role="group" aria-labelledby="theme-label">
            {THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                className="theme-swatch"
                data-theme-preview={theme.id}
                aria-pressed={settings.theme === theme.id}
                onClick={() => void props.onPatch({ theme: theme.id })}
              >
                {t(`themes.${theme.id}`)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <h2>{t("settings.notifications")}</h2>
        <label className="toggle-row">
          <span>{t("settings.phaseNotifications")}</span>
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={settings.notificationsEnabled}
            onClick={() =>
              void props.onPatch({ notificationsEnabled: !settings.notificationsEnabled })
            }
          />
        </label>
        <label className="toggle-row">
          <span>{t("settings.gentleSound")}</span>
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={settings.soundEnabled}
            onClick={() => void props.onPatch({ soundEnabled: !settings.soundEnabled })}
          />
        </label>
        <label className="toggle-row">
          <span>{t("settings.halfwayTick")}</span>
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={settings.halfwayTick}
            onClick={() => void props.onPatch({ halfwayTick: !settings.halfwayTick })}
          />
        </label>
      </section>

      {props.desktop && (
        <section className="section">
          <h2>{t("settings.desktop")}</h2>
          {props.autostartAvailable && (
            <label className="toggle-row">
              <span>{t("settings.launchAtLogin")}</span>
              <button
                type="button"
                className="toggle"
                role="switch"
                aria-checked={props.autostart}
                onClick={() => void props.onToggleAutostart(!props.autostart)}
              />
            </label>
          )}
          <label className="toggle-row">
            <span>{t("settings.startMinimized")}</span>
            <button
              type="button"
              className="toggle"
              role="switch"
              aria-checked={settings.startMinimized}
              onClick={() => void props.onPatch({ startMinimized: !settings.startMinimized })}
            />
          </label>
          {props.onQuit && (
            <button type="button" className="btn btn-ghost settings-quit" onClick={props.onQuit}>
              {t("settings.quit")}
            </button>
          )}
        </section>
      )}

      <CustomRecipes
        customs={customs}
        flowRatio={settings.flowRatio}
        composeOnOpen={props.composeRecipe}
        onCreate={props.onCreateTechnique}
        onUpdate={props.onUpdateTechnique}
        onDelete={props.onDeleteTechnique}
        onChanged={props.onTechniquesChanged}
      />

      {props.onOpenAbout && (
        <p className="settings-foot">
          <button type="button" className="linkish" onClick={props.onOpenAbout}>
            {t("settings.openAbout")}
          </button>
        </p>
      )}
    </ScrollPanel>
  );
}

interface RecipeProps {
  customs: Technique[];
  flowRatio: number;
  composeOnOpen?: boolean;
  onCreate: (input: TechniqueInput) => Promise<Technique>;
  onUpdate: (id: string, input: TechniqueInput) => Promise<Technique>;
  onDelete: (id: string) => Promise<void>;
  onChanged: () => Promise<void>;
}

function CustomRecipes({
  customs,
  flowRatio,
  composeOnOpen,
  onCreate,
  onUpdate,
  onDelete,
  onChanged,
}: RecipeProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<Draft>(() => blankDraft(flowRatio));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [composing, setComposing] = useState(Boolean(composeOnOpen));
  const [error, setError] = useState<string | null>(null);

  function closeForm() {
    setComposing(false);
    setEditingId(null);
    setError(null);
    setDraft(blankDraft(flowRatio));
  }

  function startCreate() {
    setEditingId(null);
    setError(null);
    setDraft(blankDraft(flowRatio));
    setComposing(true);
  }

  function startEdit(tech: Technique) {
    setEditingId(tech.id);
    setError(null);
    setDraft({
      name: tech.name,
      focusMins: Math.round(tech.focusSecs / 60),
      shortMins: Math.round(tech.shortBreakSecs / 60),
      longMins: Math.round(tech.longBreakSecs / 60),
      cycles: tech.cyclesBeforeLong,
      mode: tech.mode,
      flowPct: Math.round((tech.flowRatio ?? flowRatio) * 100),
    });
    setComposing(true);
  }

  async function saveCustom(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const usesFlow = draft.mode === "flowtime" || draft.mode === "hybrid";
    const input: TechniqueInput = {
      name: draft.name.trim() || t("settings.defaultCustomName"),
      focusSecs: Math.round(draft.focusMins * 60),
      shortBreakSecs: Math.round(draft.shortMins * 60),
      longBreakSecs: Math.round(draft.longMins * 60),
      cyclesBeforeLong: draft.cycles,
      flowRatio: usesFlow ? draft.flowPct / 100 : null,
      mode: draft.mode,
      accent: "#6B8F71",
    };
    try {
      if (editingId) {
        await onUpdate(editingId, input);
      } else {
        await onCreate(input);
      }
      closeForm();
      await onChanged();
    } catch (err) {
      setError(String(err));
    }
  }

  async function removeCustom(id: string) {
    try {
      await onDelete(id);
      if (editingId === id) closeForm();
      await onChanged();
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <section className="section">
      <h2>{t("settings.customTechniques")}</h2>

      {customs.length === 0 && !composing && (
        <p className="empty-note">{t("settings.recipesEmpty")}</p>
      )}

      {customs.length > 0 && (
        <div className="tech-list">
          {customs.map((tech) => (
            <div
              key={tech.id}
              className={editingId === tech.id ? "tech-row is-editing" : "tech-row"}
            >
              <div>
                <strong dir="auto">{tech.name}</strong>
                <div className="meta">{formatTechniqueRhythm(tech, flowRatio)}</div>
              </div>
              <div className="tech-row-actions">
                <button type="button" className="btn btn-ghost" onClick={() => startEdit(tech)}>
                  {t("settings.edit")}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  aria-label={`${t("settings.delete")}: ${tech.name}`}
                  onClick={() => void removeCustom(tech.id)}
                >
                  {t("settings.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!composing ? (
        <button
          type="button"
          className={customs.length === 0 ? "btn btn-primary" : "btn btn-ghost"}
          onClick={startCreate}
        >
          {t("settings.newTechnique")}
        </button>
      ) : (
        <form className="recipe-form" onSubmit={saveCustom}>
          <div className="field">
            <label htmlFor="c-name">
              {editingId ? t("settings.editTechnique") : t("settings.newTechnique")}
            </label>
            <input
              id="c-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t("settings.namePlaceholder")}
              required
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label htmlFor="c-mode">{t("settings.mode")}</label>
            <Select
              id="c-mode"
              value={draft.mode}
              onChange={(mode) => setDraft({ ...draft, mode })}
              options={[
                { value: "classic", label: t("settings.modeClassic") },
                { value: "flowtime", label: t("settings.modeFlowtime") },
                { value: "hybrid", label: t("settings.modeHybrid") },
              ]}
            />
          </div>
          {draft.mode !== "flowtime" && (
            <div className="field-grid">
              <div className="field">
                <label htmlFor="c-focus">{t("settings.focusMinutes")}</label>
                <input
                  id="c-focus"
                  type="number"
                  min={1}
                  value={draft.focusMins}
                  onChange={(e) => setDraft({ ...draft, focusMins: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="c-short">{t("settings.shortBreak")}</label>
                <input
                  id="c-short"
                  type="number"
                  min={1}
                  value={draft.shortMins}
                  onChange={(e) => setDraft({ ...draft, shortMins: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="c-long">{t("settings.longBreak")}</label>
                <input
                  id="c-long"
                  type="number"
                  min={1}
                  value={draft.longMins}
                  onChange={(e) => setDraft({ ...draft, longMins: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="c-cycles">{t("settings.cyclesBeforeLong")}</label>
                <input
                  id="c-cycles"
                  type="number"
                  min={1}
                  value={draft.cycles}
                  onChange={(e) => setDraft({ ...draft, cycles: Number(e.target.value) })}
                />
              </div>
            </div>
          )}
          {(draft.mode === "flowtime" || draft.mode === "hybrid") && (
            <div className="field">
              <label htmlFor="c-flow">{t("settings.flowRatio")}</label>
              <input
                id="c-flow"
                type="range"
                min={11}
                max={33}
                value={draft.flowPct}
                onChange={(e) => setDraft({ ...draft, flowPct: Number(e.target.value) })}
              />
              <span className="hint">
                {t("settings.flowHint", {
                  ratio: (draft.flowPct / 100).toFixed(2),
                  inverse: Math.round(100 / draft.flowPct),
                })}
              </span>
            </div>
          )}
          {error && (
            <p className="hint" style={{ color: "var(--danger)" }}>
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {editingId ? t("settings.saveChanges") : t("settings.addTechnique")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeForm}>
              {t("settings.cancel")}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
