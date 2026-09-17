import { useState } from "react";
import { useTranslation } from "react-i18next";
import { enableDebugAccess, isDebugAccessEnabled } from "../lib/debugAccess";
import { openFeedback } from "../lib/platform";
import type { AppInfo } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  info: AppInfo | null;
  onClose: () => void;
  /** After unlocking debug access in a release build. */
  onDebugUnlocked?: () => void;
}

export function AboutView(props: Props) {
  const { t } = useTranslation();
  const [versionClicks, setVersionClicks] = useState(0);

  return (
    <ScrollPanel label={t("about.panel")}>
      <BrandHeader
        line={t("about.line")}
        actions={
          <button
            type="button"
            className="icon-btn"
            data-dialog-close
            aria-label={t("about.close")}
            onClick={props.onClose}
          >
            ✕
          </button>
        }
      />

      <section className="section">
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
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: "0.85rem" }}
            onClick={() => void openFeedback()}
          >
            {t("settings.sendFeedback")}
          </button>
        </div>
      </section>
    </ScrollPanel>
  );
}
