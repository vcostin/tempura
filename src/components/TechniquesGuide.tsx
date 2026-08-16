import { CUSTOM_GUIDE, TECHNIQUE_GUIDE } from "../lib/techniqueGuide";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  onClose: () => void;
  onOpenSettings?: () => void;
}

export function TechniquesGuide({ onClose, onOpenSettings }: Props) {
  return (
    <ScrollPanel label="Techniques guide">
      <BrandHeader
        line="Techniques · pick a rhythm that fits."
        actions={
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        }
      />

      <div className="guide-list">
        {TECHNIQUE_GUIDE.map((g) => (
          <article key={g.id} className="guide-card">
            <header>
              <h3>{g.name}</h3>
              <p className="guide-best">{g.bestFor}</p>
            </header>
            <p className="guide-ratio">{g.workBreak}</p>
            <p className="guide-blurb">{g.blurb}</p>
          </article>
        ))}

        <article className="guide-card">
          <header>
            <h3>{CUSTOM_GUIDE.name}</h3>
            <p className="guide-best">{CUSTOM_GUIDE.bestFor}</p>
          </header>
          <p className="guide-ratio">{CUSTOM_GUIDE.workBreak}</p>
          <p className="guide-blurb">{CUSTOM_GUIDE.blurb}</p>
          {onOpenSettings && (
            <button type="button" className="btn btn-ghost" onClick={onOpenSettings}>
              Open Settings
            </button>
          )}
        </article>
      </div>
    </ScrollPanel>
  );
}
