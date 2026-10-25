import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { isMacPlatform, keyLabel, SHORTCUT_GROUPS } from "../lib/shortcuts";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  onClose: () => void;
}

/** Every keyboard shortcut, grouped by where it works. */
export function ShortcutsView({ onClose }: Props) {
  const { t } = useTranslation();
  const mac = isMacPlatform();
  const name = (key: string) => t(`shortcuts.key_${key}`);

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
    </ScrollPanel>
  );
}
