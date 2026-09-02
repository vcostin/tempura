import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatTechniqueRhythm } from "../lib/api";
import { enableDebugAccess, isDebugAccessEnabled } from "../lib/debugAccess";
import { LOCALES } from "../lib/i18n";
import { guideForTechnique, techniqueDisplayName } from "../lib/techniqueGuide";
import type { AppInfo, AppSettings, Technique, TechniqueInput } from "../lib/types";
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
  info: AppInfo | null;
  onCreateTechnique: (input: TechniqueInput) => Promise<Technique>;
  onUpdateTechnique: (id: string, input: TechniqueInput) => Promise<Technique>;
  onDeleteTechnique: (id: string) => Promise<void>;
  onTechniquesChanged: () => Promise<void>;
  onOpenGuide?: () => void;
  onQuit?: () => void;
  /** After unlocking debug access in a release build. */
  onDebugUnlocked?: () => void;
}

export function SettingsView(props: Props) {
  const { t, i18n } = useTranslation();
  const { settings } = props;
  const [draft, setDraft] = useState({
    name: "",
    focusMins: 25,
    shortMins: 5,
    longMins: 15,
    cycles: 4,
    mode: "classic",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versionClicks, setVersionClicks] = useState(0);

  async function saveCustom(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const input: TechniqueInput = {
      name: draft.name.trim() || t("settings.defaultCustomName"),
      focusSecs: Math.round(draft.focusMins * 60),
      shortBreakSecs: Math.round(draft.shortMins * 60),
      longBreakSecs: Math.round(draft.longMins * 60),
      cyclesBeforeLong: draft.cycles,
      flowRatio: draft.mode === "flowtime" || draft.mode === "hybrid" ? settings.flowRatio : null,
      mode: draft.mode,
      accent: "#6B8F71",
    };
    try {
      if (editingId) {
        await props.onUpdateTechnique(editingId, input);
      } else {
        await props.onCreateTechnique(input);
      }
      setDraft({
        name: "",
        focusMins: 25,
        shortMins: 5,
        longMins: 15,
        cycles: 4,
        mode: "classic",
      });
      setEditingId(null);
      await props.onTechniquesChanged();
    } catch (err) {
      setError(String(err));
    }
  }

  function startEdit(tech: Technique) {
    if (tech.kind === "system") return;
    setEditingId(tech.id);
    setDraft({
      name: tech.name,
      focusMins: Math.round(tech.focusSecs / 60),
      shortMins: Math.round(tech.shortBreakSecs / 60),
      longMins: Math.round(tech.longBreakSecs / 60),
      cycles: tech.cyclesBeforeLong,
      mode: tech.mode,
    });
  }

  return (
    <ScrollPanel label={t("settings.panel")}>
      <BrandHeader
        line={t("settings.line")}
        actions={
          <button type="button" className="icon-btn" aria-label={t("settings.close")} onClick={props.onClose}>
            ✕
          </button>
        }
      />

      <section className="section">
        <h3>{t("settings.language")}</h3>
        <div className="field">
          <label htmlFor="locale">{t("settings.language")}</label>
          <Select
            id="locale"
            value={settings.locale || i18n.resolvedLanguage || i18n.language || "en"}
            onChange={(code) => void props.onPatch({ locale: code })}
            options={LOCALES.map((loc) => ({ value: loc.code, label: loc.nativeName }))}
          />
        </div>
      </section>

      <section className="section">
        <h3>{t("settings.theme")}</h3>
        <div className="theme-grid">
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
      </section>

      <section className="section">
        <h3>{t("settings.sessionDefaults")}</h3>
        <div className="field">
          <label htmlFor="default-tech">{t("settings.defaultTechnique")}</label>
          <Select
            id="default-tech"
            value={settings.defaultTechniqueId}
            onChange={(id) => void props.onPatch({ defaultTechniqueId: id })}
            options={props.techniques.map((tech) => ({
              value: tech.id,
              label: `${techniqueDisplayName(tech)} — ${formatTechniqueRhythm(tech, settings.flowRatio)}`,
            }))}
          />
        </div>
        <div className="field">
          <label htmlFor="long-n">{t("settings.longBreakEvery")}</label>
          <input
            id="long-n"
            type="number"
            min={1}
            max={12}
            value={settings.longBreakEveryN}
            onChange={(e) =>
              void props.onPatch({ longBreakEveryN: Number(e.target.value) || 4 })
            }
          />
        </div>
        <div className="field">
          <label htmlFor="flow-ratio">{t("settings.flowRatio")}</label>
          <input
            id="flow-ratio"
            type="range"
            min={11}
            max={33}
            value={Math.round(settings.flowRatio * 100)}
            onChange={(e) =>
              void props.onPatch({ flowRatio: Number(e.target.value) / 100 })
            }
          />
          <span className="hint">
            {t("settings.flowHint", {
              ratio: settings.flowRatio.toFixed(2),
              inverse: Math.round(1 / settings.flowRatio),
            })}
          </span>
        </div>
      </section>

      <section className="section">
        <h3>{t("settings.notifications")}</h3>
        <div className="toggle-row">
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
        </div>
        <div className="toggle-row">
          <span>{t("settings.gentleSound")}</span>
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={settings.soundEnabled}
            onClick={() => void props.onPatch({ soundEnabled: !settings.soundEnabled })}
          />
        </div>
        <div className="toggle-row">
          <span>{t("settings.halfwayTick")}</span>
          <button
            type="button"
            className="toggle"
            role="switch"
            aria-checked={settings.halfwayTick}
            onClick={() => void props.onPatch({ halfwayTick: !settings.halfwayTick })}
          />
        </div>
      </section>

      {props.desktop && (
        <section className="section">
          <h3>{t("settings.desktop")}</h3>
          {props.autostartAvailable && (
            <div className="toggle-row">
              <span>{t("settings.launchAtLogin")}</span>
              <button
                type="button"
                className="toggle"
                role="switch"
                aria-checked={props.autostart}
                onClick={() => void props.onToggleAutostart(!props.autostart)}
              />
            </div>
          )}
          <div className="toggle-row">
            <span>{t("settings.startMinimized")}</span>
            <button
              type="button"
              className="toggle"
              role="switch"
              aria-checked={settings.startMinimized}
              onClick={() => void props.onPatch({ startMinimized: !settings.startMinimized })}
            />
          </div>
          {props.onQuit && (
            <button type="button" className="btn btn-ghost" style={{ marginTop: "0.75rem" }} onClick={props.onQuit}>
              {t("settings.quit")}
            </button>
          )}
        </section>
      )}

      <section className="section">
        <h3>{t("settings.customTechniques")}</h3>
        <div className="tech-list">
          {props.techniques.map((tech) => (
            <div key={tech.id} className="tech-row">
              <div>
                <strong>{techniqueDisplayName(tech)}</strong>
                <div className="meta">
                  {tech.kind === "system" ? t("settings.builtIn") : t("settings.customKind")}
                  {" · "}
                  {formatTechniqueRhythm(tech, settings.flowRatio)}
                  {" · "}
                  {t("timer.bestFor", { value: guideForTechnique(tech).bestFor })}
                </div>
              </div>
              {tech.kind === "custom" && (
                <div style={{ display: "flex", gap: "0.35rem" }}>
                  <button type="button" className="btn btn-ghost" onClick={() => startEdit(tech)}>
                    {t("settings.edit")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() =>
                      void props.onDeleteTechnique(tech.id).then(() => props.onTechniquesChanged())
                    }
                  >
                    {t("settings.delete")}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={saveCustom} style={{ marginTop: "1rem" }}>
          <div className="field">
            <label htmlFor="c-name">{editingId ? t("settings.editTechnique") : t("settings.newTechnique")}</label>
            <input
              id="c-name"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t("settings.namePlaceholder")}
              required
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
            <>
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
            </>
          )}
          {error && <p className="hint" style={{ color: "var(--danger)" }}>{error}</p>}
          <button type="submit" className="btn btn-primary">
            {editingId ? t("settings.saveChanges") : t("settings.addTechnique")}
          </button>
          {editingId && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginInlineStart: "0.5rem" }}
              onClick={() => setEditingId(null)}
            >
              {t("settings.cancel")}
            </button>
          )}
        </form>
      </section>

      <section className="section">
        <h3>{t("settings.about")}</h3>
        <div className="privacy-note">
          <p style={{ margin: "0 0 0.5rem" }}>
            <strong>{props.info?.name ?? "Tempura"}</strong>
            {props.info ? (
              <>
                {" · "}
                <button
                  type="button"
                  className="linkish"
                  style={{ padding: 0, font: "inherit", color: "inherit" }}
                  title="Version"
                  onClick={() => {
                    if (isDebugAccessEnabled(props.info?.debug)) return;
                    const next = versionClicks + 1;
                    setVersionClicks(next);
                    if (next >= 5) {
                      enableDebugAccess();
                      setVersionClicks(0);
                      props.onDebugUnlocked?.();
                    }
                  }}
                >
                  v{props.info.version}
                </button>
              </>
            ) : null}
          </p>
          <p style={{ margin: 0 }}>{t("settings.privacy")}</p>
          <p style={{ margin: "0.75rem 0 0" }}>{t("settings.aboutBody")}</p>
          {props.onOpenGuide && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ marginTop: "0.85rem" }}
              onClick={props.onOpenGuide}
            >
              {t("settings.techniquesGuide")}
            </button>
          )}
        </div>
      </section>
    </ScrollPanel>
  );
}
