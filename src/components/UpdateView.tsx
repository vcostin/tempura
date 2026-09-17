import { useTranslation } from "react-i18next";
import type { UpdateUiStatus } from "../lib/updates";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";
import { UpdateStatusCopy } from "./UpdatesSection";

interface Props {
  currentVersion: string;
  newVersion: string;
  status: UpdateUiStatus;
  onInstall: () => void;
  onSkip: () => void;
}

export function UpdateView(props: Props) {
  const { t } = useTranslation();
  const busy =
    props.status.kind === "downloading" || props.status.kind === "installing";

  return (
    <ScrollPanel label={t("updates.panel")}>
      <BrandHeader
        line={t("updates.line")}
        actions={
          <button
            type="button"
            className="icon-btn"
            data-dialog-close
            aria-label={t("updates.close")}
            onClick={props.onSkip}
          >
            ✕
          </button>
        }
      />

      <section className="section">
        <div className="privacy-note">
          <p style={{ margin: "0 0 0.5rem" }}>
            {t("updates.available", { version: props.newVersion })}
          </p>
          <p className="hint" style={{ margin: 0 }}>
            {t("updates.currentVersion", { version: props.currentVersion })}
          </p>
          <UpdateStatusCopy
            status={
              props.status.kind === "available"
                ? { kind: "idle" }
                : props.status
            }
          />
          <div className="update-actions" style={{ marginTop: "0.85rem" }}>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={props.onInstall}
            >
              {t("updates.updateAndRestart")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={props.onSkip}
            >
              {t("updates.skip")}
            </button>
          </div>
          <p style={{ margin: "0.85rem 0 0" }}>{t("updates.privacy")}</p>
        </div>
      </section>
    </ScrollPanel>
  );
}
