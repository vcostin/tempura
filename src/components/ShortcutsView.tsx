import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { HOTKEY_ACTIONS, hotkeyCaps, type GlobalHotkeys } from "../lib/hotkeys";
import { isMacPlatform, keyLabel, SHORTCUT_GROUPS } from "../lib/shortcuts";
import { HOTKEY_LABEL_KEYS } from "./GlobalHotkeysSection";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  /** The user's system-wide shortcuts, listed when any is set. */
  globalHotkeys: GlobalHotkeys;
  onOpenSettings: () => void;
  onClose: () => void;
}

/** Every keyboard shortcut, grouped by where it works. */
export function ShortcutsView({ globalHotkeys, onOpenSettings, onClose }: Props) {
  const { t } = useTranslation();
  const mac = isMacPlatform();
  const name = (key: string) => t(`shortcuts.key_${key}`);
  const systemWide = HOTKEY_ACTIONS.filter((action) => globalHotkeys[action]);

  return (
    <ScrollPanel label={t("shortcuts.panel")}>
      <BrandHeader
        line={t("shortcuts.line")}
        actions={
          <button
            type="button"
            className="icon-btn"
            data-dialog-close
            aria-label={t("shortcuts.close")}
            onClick={onClose}
          >
            ✕
          </button>
        }
      />

      {SHORTCUT_GROUPS.map((group) => (
        <section key={group.title} className="section">
          <h2>{t(`shortcuts.${group.title}`)}</h2>
          <dl className="shortcut-list">
            {group.items.map((item) => (
              <div key={item.action} className="shortcut-row">
                <dt className="shortcut-keys">
                  {item.keys.map((combo, i) => (
                    <Fragment key={i}>
                      {i > 0 && <span className="shortcut-or">{t("shortcuts.or")}</span>}
                      {combo.map((key, j) => (
                        <Fragment key={j}>
                          {j > 0 && <span aria-hidden="true">+</span>}
                          <kbd>{keyLabel(key, mac, name)}</kbd>
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </dt>
                <dd>{t(`shortcuts.${item.action}`)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}

      <section className="section">
        <h2>{t("shortcuts.groupSystemWide")}</h2>
        {systemWide.length > 0 && (
          <dl className="shortcut-list">
            {systemWide.map((action) => (
              <div key={action} className="shortcut-row">
                <dt className="shortcut-keys">
                  {hotkeyCaps(globalHotkeys[action], mac, name).map((cap, i) => (
                    <Fragment key={i}>
                      {i > 0 && <span aria-hidden="true">+</span>}
                      <kbd>{cap}</kbd>
                    </Fragment>
                  ))}
                </dt>
                <dd>{t(HOTKEY_LABEL_KEYS[action])}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="hint">
          {systemWide.length > 0 ? t("shortcuts.systemWideSet") : t("shortcuts.systemWideNone")}{" "}
          <button type="button" className="linkish" onClick={onOpenSettings}>
            {t("shortcuts.systemWideSettings")}
          </button>
        </p>
      </section>
    </ScrollPanel>
  );
}
