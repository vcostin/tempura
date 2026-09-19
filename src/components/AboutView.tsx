import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { enableDebugAccess, isDebugAccessEnabled } from "../lib/debugAccess";
import { FEEDBACK_URL, openFeedback } from "../lib/platform";
import type { AppInfo } from "../lib/types";
import type { UpdateUiStatus } from "../lib/updates";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";
import { UpdatesSection } from "./UpdatesSection";

interface Props {
  info: AppInfo | null;
  onClose: () => void;
  /** After unlocking debug access in a release build. */
  onDebugUnlocked?: () => void;
  updater?: {
    autoCheck: boolean;
    onToggleAutoCheck: () => void;
    status: UpdateUiStatus;
    onCheck: () => void;
    onInstall: () => void;
  };
}

export function AboutView(props: Props) {
  const { t } = useTranslation();
  const versionClicks = useRef(0);
  const [feedbackStatus, setFeedbackStatus] = useState<"opened" | "failed" | null>(null);
  const [copied, setCopied] = useState(false);

  async function sendFeedback() {
    const opened = await openFeedback();
    setFeedbackStatus(opened ? "opened" : "failed");
  }

  async function copyFeedbackUrl() {
    try {
      await navigator.clipboard.writeText(FEEDBACK_URL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be denied; the URL is still on screen to select */
    }
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
          <p className="hint" style={{ margin: "0.7rem 0 0" }}>
            {t("about.feedbackLinkHint")}
          </p>
          <p className="feedback-fallback">
            <a
              className="linkish feedback-url"
              href={FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                event.preventDefault();
                void sendFeedback();
              }}
            >
              {FEEDBACK_URL}
            </a>
            <button type="button" className="linkish" onClick={() => void copyFeedbackUrl()}>
              {copied ? t("about.feedbackCopied") : t("about.copyFeedbackUrl")}
            </button>
          </p>
          {feedbackStatus === "opened" && (
            <p className="hint" role="status" style={{ marginTop: "0.5rem" }}>
              {t("about.feedbackOpened")}
            </p>
          )}
          {feedbackStatus === "failed" && (
            <p className="hint" role="status" style={{ marginTop: "0.5rem" }}>
              {t("about.feedbackOpenFailed")}
            </p>
          )}
        </div>
      </section>

      {props.updater && (
        <UpdatesSection
          autoCheck={props.updater.autoCheck}
          onToggleAutoCheck={props.updater.onToggleAutoCheck}
          status={props.updater.status}
          onCheck={props.updater.onCheck}
          onInstall={props.updater.onInstall}
        />
      )}
    </ScrollPanel>
  );
}
