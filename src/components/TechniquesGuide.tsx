import { useTranslation } from "react-i18next";
import { customGuide, techniqueGuideEntries } from "../lib/techniqueGuide";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  onClose: () => void;
  onOpenSettings?: () => void;
}

export function TechniquesGuide({ onClose, onOpenSettings }: Props) {
  const { t } = useTranslation();
  const entries = techniqueGuideEntries();
  const custom = customGuide();

  return (
    <ScrollPanel label={t("guide.panel")}>
      <BrandHeader
        line={t("guide.line")}
        actions={
          <button
            type="button"
            className="icon-btn"
            data-dialog-close
            aria-label={t("guide.close")}
            onClick={onClose}
          >
            ✕
          </button>
        }
      />

      <div className="guide-list">
        {entries.map((g) => (
          <article key={g.id} className="guide-card">
            <header>
              <h2>{g.name}</h2>
              <p className="guide-best">{g.bestFor}</p>
            </header>
            <p className="guide-ratio">{g.workBreak}</p>
            <p className="guide-blurb">{g.blurb}</p>
          </article>
        ))}

        <article className="guide-card">
          <header>
            <h2>{custom.name}</h2>
            <p className="guide-best">{custom.bestFor}</p>
          </header>
          <p className="guide-ratio">{custom.workBreak}</p>
          <p className="guide-blurb">{custom.blurb}</p>
          {onOpenSettings && (
            <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
              {t("guide.openSettings")}
            </button>
          )}
        </article>
      </div>
    </ScrollPanel>
  );
}
