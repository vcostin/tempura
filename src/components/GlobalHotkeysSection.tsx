import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
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
 * backend reports shortcuts another app owns, and on Wayland, where apps can't
 * grab keys, the section lists the commands to bind in system settings instead.
 */
export function GlobalHotkeysSection({ hotkeys, onChange }: Props) {
  const { t } = useTranslation();
  const [report, setReport] = useState<HotkeyReport | null>(null);
  const [recording, setRecording] = useState<HotkeyAction | null>(null);
  const [problem, setProblem] = useState<{ action: HotkeyAction; message: string } | null>(null);
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

  if (report && !report.supported) {
    return (
      <section className="section">
        <h2>{t("settings.hotkeys")}</h2>
        <p className="hint">{t("settings.hotkeysWayland")}</p>
        <dl className="hotkey-commands">
          {HOTKEY_ACTIONS.map((action) => (
            <div key={action} className="hotkey-command">
              <dt>{t(HOTKEY_LABEL_KEYS[action])}</dt>
              <dd>
                <code>{`${report.command} ${HOTKEY_FLAGS[action]}`}</code>
              </dd>
            </div>
          ))}
        </dl>
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
