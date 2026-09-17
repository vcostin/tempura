import { useTranslation } from "react-i18next";
import type { UpdateUiStatus } from "../lib/updates";

interface Props {
  version: string;
  autoCheck: boolean;
  onToggleAutoCheck: () => void;
  status: UpdateUiStatus;
  skipped: boolean;
  onCheck: () => void;
  onInstall: () => void;
  onSkip?: () => void;
}

export function UpdatesSection(props: Props) {
  const { t } = useTranslation();
  const busy =
    props.status.kind === "checking" ||
    props.status.kind === "downloading" ||
    props.status.kind === "installing";
  const showInstall =
    props.status.kind === "available" ||
    props.status.kind === "downloading" ||
    props.status.kind === "installing";

  return (
    <section className="section">
      <h2>{t("updates.title")}</h2>
      <p className="hint" style={{ margin: "0 0 0.65rem" }}>
        {t("updates.currentVersion", { version: props.version })}
      </p>
      <label className="toggle-row">
        <span>{t("updates.autoCheck")}</span>
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={props.autoCheck}
          onClick={props.onToggleAutoCheck}
        />
      </label>
      <p className="hint" style={{ margin: "0 0 0.85rem" }}>
        {t("updates.autoCheckHint")}
      </p>
      <div className="update-actions">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={props.onCheck}
        >
          {props.status.kind === "checking" ? t("updates.checking") : t("updates.checkNow")}
        </button>
        {showInstall && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={props.onInstall}
          >
            {t("updates.updateAndRestart")}
          </button>
        )}
        {props.status.kind === "available" && props.onSkip && !props.skipped && (
          <button type="button" className="btn btn-ghost" onClick={props.onSkip}>
            {t("updates.skip")}
          </button>
        )}
      </div>
      <UpdateStatusCopy status={props.status} />
      <p className="privacy-note" style={{ marginTop: "0.85rem" }}>
        {t("updates.privacy")}
      </p>
    </section>
  );
}

export function UpdateStatusCopy({ status }: { status: UpdateUiStatus }) {
  const { t } = useTranslation();

  if (status.kind === "upToDate") {
    return (
      <p className="hint" role="status" style={{ margin: "0.65rem 0 0" }}>
        {t("updates.upToDate")}
      </p>
    );
  }
  if (status.kind === "available") {
    return (
      <p className="hint" role="status" style={{ margin: "0.65rem 0 0" }}>
        {t("updates.available", { version: status.version })}
      </p>
    );
  }
  if (status.kind === "downloading") {
    const label =
      status.percent == null
        ? t("updates.downloadingUnknown")
        : t("updates.downloading", { percent: status.percent });
    return (
      <div role="status" style={{ margin: "0.65rem 0 0" }}>
        <p className="hint" style={{ margin: 0 }}>
          {label}
        </p>
        {status.percent != null && (
          <div className="update-progress" aria-hidden="true">
            <span style={{ width: `${status.percent}%` }} />
          </div>
        )}
      </div>
    );
  }
  if (status.kind === "installing") {
    return (
      <p className="hint" role="status" style={{ margin: "0.65rem 0 0" }}>
        {t("updates.installing")}
      </p>
    );
  }
  if (status.kind === "error") {
    const key =
      status.source === "install"
        ? "updates.installError"
        : status.soft
          ? "updates.offline"
          : "updates.error";
    return (
      <p className="hint" role="status" style={{ margin: "0.65rem 0 0" }}>
        {t(key)}
      </p>
    );
  }
  return null;
}
