import { useRef, useState } from "react";
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
  const versionClicks = useRef(0);
  const [feedbackOpened, setFeedbackOpened] = useState(false);

  async function sendFeedback() {
    await openFeedback();
    setFeedbackOpened(true);
  }

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
            {" · "}
            <button
              type="button"
              className="linkish"
              style={{ padding: 0, font: "inherit", color: "inherit" }}
              title="Version"
              onClick={() => {
                if (isDebugAccessEnabled(props.info?.debug)) return;
                versionClicks.current += 1;
                if (versionClicks.current >= 5) {
                  versionClicks.current = 0;
                  enableDebugAccess();
                  props.onDebugUnlocked?.();
                }
              }}
            >
              {props.info ? `v${props.info.version}` : "web"}
            </button>
          </p>
          <p style={{ margin: 0 }}>{t("settings.privacy")}</p>
          <p style={{ margin: "0.75rem 0 0" }}>{t("settings.aboutBody")}</p>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: "0.85rem" }}
            onClick={() => void sendFeedback()}
          >
            {t("settings.sendFeedback")}
          </button>
          {feedbackOpened && (
            <p className="hint" role="status" style={{ marginTop: "0.65rem" }}>
              {t("about.feedbackOpened", {
                defaultValue:
                  "Opened in your browser — check there if a tab didn't come forward.",
              })}
            </p>
          )}
        </div>
      </section>
    </ScrollPanel>
  );
}
