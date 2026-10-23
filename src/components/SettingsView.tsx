import { useTranslation } from "react-i18next";
import { formatTechniqueRhythm } from "../lib/api";
import { LOCALES } from "../lib/i18n";
import type { AppSettings, Technique } from "../lib/types";
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
  onNewTechnique: () => void;
  onEditTechnique: (id: string) => void;
  onOpenAbout?: () => void;
  onQuit?: () => void;
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
        onNew={props.onNewTechnique}
        onEdit={props.onEditTechnique}
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
  onNew: () => void;
  onEdit: (id: string) => void;
}

function CustomRecipes({ customs, onNew, onEdit }: RecipeProps) {
  const { t } = useTranslation();

  return (
    <section className="section">
      <h2>{t("settings.customTechniques")}</h2>

      {customs.length === 0 && <p className="empty-note">{t("settings.recipesEmpty")}</p>}

      {customs.length > 0 && (
        <div className="tech-list">
          {customs.map((tech) => (
            <div key={tech.id} className="tech-row">
              <div>
                <strong dir="auto">{tech.name}</strong>
                <div className="meta">{formatTechniqueRhythm(tech)}</div>
              </div>
              <div className="tech-row-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  aria-label={`${t("settings.edit")}: ${tech.name}`}
                  onClick={() => onEdit(tech.id)}
                >
                  {t("settings.edit")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button
        type="button"
        className={customs.length === 0 ? "btn btn-primary" : "btn btn-ghost"}
        onClick={onNew}
      >
        {t("settings.newTechnique")}
      </button>
    </section>
  );
}
