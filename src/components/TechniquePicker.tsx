import type { Technique } from "../lib/types";
import { techniqueTooltip } from "../lib/techniqueGuide";

interface Props {
  techniques: Technique[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export function TechniquePicker({ techniques, selectedId, onSelect, disabled }: Props) {
  return (
    <div className="picker" role="listbox" aria-label="Focus technique">
      {techniques.map((t) => (
        <button
          key={t.id}
          type="button"
          className="chip"
          role="option"
          aria-selected={t.id === selectedId}
          aria-pressed={t.id === selectedId}
          disabled={disabled}
          onClick={() => onSelect(t.id)}
          title={techniqueTooltip(t)}
          aria-description={techniqueTooltip(t)}
        >
          {t.name}
        </button>
      ))}
    </div>
  );
}
