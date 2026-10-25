import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { api } from "../lib/api";
import {
  HOTKEY_ACTIONS,
  HOTKEY_FLAGS,
  hotkeyCaps,
  recordKey,
  takenBy,
  type GlobalHotkeys,
  type HotkeyAction,
  type HotkeyReport,
} from "../lib/hotkeys";
import { isMacPlatform } from "../lib/shortcuts";

interface Props {
  hotkeys: GlobalHotkeys;
  onChange: (next: GlobalHotkeys) => Promise<void>;
}

/** The `shortcuts.*` string naming each action. */
export const HOTKEY_LABEL_KEYS: Record<HotkeyAction, string> = {
  toggle: "shortcuts.startPause",
  skip: "shortcuts.skip",
  show: "shortcuts.showWindow",
};

/**
 * Opt-in system-wide shortcuts. Nothing is set until the user records one; the
 * backend reports shortcuts another app owns. On Wayland, where apps can't grab
 * keys, the desktop's own dialog picks them (portal), and without a portal the
 * section lists the commands to bind in the system settings instead.
 */
export function GlobalHotkeysSection({ hotkeys, onChange }: Props) {
  const { t } = useTranslation();
  const [report, setReport] = useState<HotkeyReport | null>(null);
  const [recording, setRecording] = useState<HotkeyAction | null>(null);
  const [problem, setProblem] = useState<{ action: HotkeyAction; message: string } | null>(null);
  const [copied, setCopied] = useState<HotkeyAction | null>(null);
  const [portalBusy, setPortalBusy] = useState(false);
  const mac = isMacPlatform();
  const name = (key: string) => t(`shortcuts.key_${key}`);

  const refresh = useCallback(async () => {
    try {
      setReport(await api.getHotkeyReport());
    } catch {
      setReport(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // The portal answers in the background, and the desktop can change keys at any time.
    const unlisten = listen("hotkeys-changed", () => void refresh());
    return () => {
      void unlisten.then((stop) => stop());
    };
  }, [refresh]);

  async function save(action: HotkeyAction, accelerator: string) {
    await onChange({ ...hotkeys, [action]: accelerator });
    await refresh();
  }

  function onRecordKey(action: HotkeyAction, e: KeyboardEvent<HTMLButtonElement>) {
    if (recording !== action) return;
    // While recording, keys belong to the recorder, not the window's shortcuts.
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      setRecording(null);
      return;
    }
    const result = recordKey(e.nativeEvent);
    if (result.kind === "pending") return;
    if (result.kind === "needsModifier") {
      setProblem({ action, message: t("settings.hotkeyNeedsModifier") });
      return;
    }
    const other = takenBy(hotkeys, action, result.accelerator);
    if (other) {
      setProblem({ action, message: t("settings.hotkeyTaken", { action: t(HOTKEY_LABEL_KEYS[other]) }) });
      return;
    }
    setProblem(null);
    setRecording(null);
    void save(action, result.accelerator);
  }

  async function copyCommand(action: HotkeyAction, command: string) {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(action);
      window.setTimeout(() => setCopied((c) => (c === action ? null : c)), 2000);
    } catch {
      /* clipboard may be denied; the command is still on screen to select */
    }
  }

  async function setUpPortal() {
    setPortalBusy(true);
    try {
      await api.setupPortalHotkeys();
      if (!hotkeys.portal) await onChange({ ...hotkeys, portal: true });
    } catch {
      /* cancelled or refused: the report says so */
    } finally {
      setPortalBusy(false);
      await refresh();
    }
  }

  const commandList = report && (
    <dl className="hotkey-commands">
      {HOTKEY_ACTIONS.map((action) => {
        const label = t(HOTKEY_LABEL_KEYS[action]);
        const command = `${report.command} ${HOTKEY_FLAGS[action]}`;
        return (
          <div key={action} className="hotkey-command">
            <dt>
              <span>{label}</span>
              <button
                type="button"
                className="linkish"
                aria-label={t("settings.hotkeyCopyAria", { action: label })}
                onClick={() => void copyCommand(action, command)}
              >
                {copied === action ? t("settings.hotkeyCopied") : t("settings.hotkeyCopy")}
              </button>
            </dt>
            <dd>
              <code>{withPathBreaks(command)}</code>
            </dd>
          </div>
        );
      })}
    </dl>
  );

  if (report?.mode === "commands") {
    return (
      <section className="section">
        <h2>{t("settings.hotkeys")}</h2>
        <p className="hint">{t("settings.hotkeysWayland")}</p>
        {commandList}
      </section>
    );
  }

  if (report?.mode === "portal") {
    const assigned = report.portalShortcuts ?? [];
    return (
      <section className="section">
        <h2>{t("settings.hotkeys")}</h2>
        <p className="hint">{t("settings.hotkeysPortalHint")}</p>
        {hotkeys.portal && (
          <ul className="hotkey-list">
            {HOTKEY_ACTIONS.map((action) => {
              const trigger = assigned.find((s) => s.action === action)?.trigger ?? "";
              return (
                <li key={action} className="hotkey-row hotkey-row--portal">
                  <span className="hotkey-label">{t(HOTKEY_LABEL_KEYS[action])}</span>
                  <span className="hotkey-trigger">{trigger ? <kbd>{trigger}</kbd> : t("settings.hotkeyNotSet")}</span>
                </li>
              );
            })}
          </ul>
        )}
        {report.portalProblem && (
          <p className="hotkey-problem" role="status">
            {t("settings.hotkeysPortalProblem")}
          </p>
        )}
        <div className="hotkey-portal-actions">
          <button
            type="button"
            className={`btn ${hotkeys.portal ? "btn-ghost" : "btn-primary"}`}
            disabled={portalBusy}
            onClick={() => void setUpPortal()}
          >
            {hotkeys.portal ? t("settings.hotkeysPortalChange") : t("settings.hotkeysPortalSetup")}
          </button>
          {hotkeys.portal && (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={portalBusy}
              onClick={() => void onChange({ ...hotkeys, portal: false })}
            >
              {t("settings.hotkeysPortalOff")}
            </button>
          )}
        </div>
        <details className="hotkey-commands-more">
          <summary>{t("settings.hotkeysCommandsInstead")}</summary>
          <p className="hint">{t("settings.hotkeysCommandsHint")}</p>
          {commandList}
        </details>
      </section>
    );
  }

  return (
    <section className="section">
      <h2>{t("settings.hotkeys")}</h2>
      <p className="hint">{t("settings.hotkeysHint")}</p>
      <ul className="hotkey-list">
        {HOTKEY_ACTIONS.map((action) => {
          const label = t(HOTKEY_LABEL_KEYS[action]);
          const value = hotkeys[action];
          const isRecording = recording === action;
          const caps = hotkeyCaps(value, mac, name);
          const inUse = report?.inUse.includes(action) ?? false;
          const message = problem?.action === action ? problem.message : inUse ? t("settings.hotkeyInUse") : null;
          return (
            <li key={action} className="hotkey-row">
              <span className="hotkey-label" id={`hotkey-${action}`}>
                {label}
              </span>
              <button
                type="button"
                className={`hotkey-recorder${isRecording ? " is-recording" : ""}`}
                aria-labelledby={`hotkey-${action} hotkey-${action}-value`}
                aria-describedby={message ? `hotkey-${action}-problem` : undefined}
                onClick={() => {
                  setProblem(null);
                  setRecording(isRecording ? null : action);
                }}
                onBlur={() => isRecording && setRecording(null)}
                onKeyDown={(e) => onRecordKey(action, e)}
              >
                <span id={`hotkey-${action}-value`}>
                  {isRecording ? (
                    t("settings.hotkeyPress")
                  ) : caps.length ? (
                    caps.map((cap, i) => <kbd key={i}>{cap}</kbd>)
                  ) : (
                    t("settings.hotkeyNotSet")
                  )}
                </span>
              </button>
              {value && !isRecording && (
                <button
                  type="button"
                  className="icon-btn hotkey-clear"
                  aria-label={t("settings.hotkeyClear", { action: label })}
                  onClick={() => {
                    setProblem(null);
                    void save(action, "");
                  }}
                >
                  ✕
                </button>
              )}
              {message && (
                <p id={`hotkey-${action}-problem`} className="hotkey-problem" role="status">
                  {message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Lets a long command wrap after a path separator rather than mid-word. */
function withPathBreaks(command: string) {
  return command.split("/").flatMap((part, i) => (i === 0 ? [part] : [<wbr key={i} />, "/" + part]));
}
