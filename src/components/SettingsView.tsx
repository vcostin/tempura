import { useTranslation } from "react-i18next";
import { LOCALES } from "../lib/i18n";
import { isMacPlatform } from "../lib/shortcuts";
import type { AppSettings } from "../lib/types";
import { THEMES } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { GlobalHotkeysSection } from "./GlobalHotkeysSection";
import { ScrollPanel } from "./ScrollPanel";
import { Select } from "./Select";

interface Props {
  settings: AppSettings;
  onPatch: (partial: Partial<AppSettings>) => Promise<void>;
  /** Counts shown on the Techniques link. */
  techniqueCounts: { mine: number; builtIn: number };
  onClose: () => void;
  desktop: boolean;
  autostart: boolean;
  autostartAvailable: boolean;
  onToggleAutostart: (enabled: boolean) => Promise<void>;
  onOpenTechniques: () => void;
  onOpenAbout?: () => void;
  onOpenShortcuts: () => void;
  onQuit?: () => void;
}

export function SettingsView(props: Props) {
  const { t, i18n } = useTranslation();
  const { settings } = props;

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
          {isMacPlatform() && (
            <label className="toggle-row">
              <span>{t("settings.menuBarCountdown")}</span>
              <button
                type="button"
                className="toggle"
                role="switch"
                aria-checked={settings.menuBarCountdown}
                onClick={() => void props.onPatch({ menuBarCountdown: !settings.menuBarCountdown })}
              />
            </label>
          )}
          {props.onQuit && (
            <button type="button" className="btn btn-ghost settings-quit" onClick={props.onQuit}>
              {t("settings.quit")}
            </button>
          )}
        </section>
      )}

      {props.desktop && (
        <GlobalHotkeysSection
          hotkeys={settings.globalHotkeys}
          onChange={(globalHotkeys) => props.onPatch({ globalHotkeys })}
        />
      )}

      <section className="section">
        <h2>{t("settings.techniques")}</h2>
        <button type="button" className="link-row" onClick={props.onOpenTechniques}>
          <span>
            <span className="link-row-title">{t("settings.manageTechniques")}</span>
            <span className="link-row-meta">
              {t("settings.techniquesMeta", props.techniqueCounts)}
            </span>
          </span>
          <span className="link-row-chevron" aria-hidden="true">
            ›
          </span>
        </button>
      </section>

      <p className="settings-foot">
        <button type="button" className="linkish" onClick={props.onOpenShortcuts}>
          {t("shortcuts.open")}
        </button>
        {props.onOpenAbout && (
          <button type="button" className="linkish" onClick={props.onOpenAbout}>
            {t("settings.openAbout")}
          </button>
        )}
      </p>
    </ScrollPanel>
  );
}
