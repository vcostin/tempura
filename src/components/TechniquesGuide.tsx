import { TECHNIQUE_GUIDE } from "../lib/techniqueGuide";
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
            <h3>Custom</h3>
            <p className="guide-best">Power users</p>
          </header>
          <p className="guide-ratio">User-defined ratios + long-break cadence</p>
          <p className="guide-blurb">
            Bake your own intervals in Settings — name, focus, short break, long break,
            and how often the long rest lands.
          </p>
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
