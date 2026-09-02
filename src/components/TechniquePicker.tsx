import { useTranslation } from "react-i18next";
import type { Technique } from "../lib/types";
import { techniqueDisplayName, techniqueTooltip } from "../lib/techniqueGuide";

interface Props {
  techniques: Technique[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

export function TechniquePicker({ techniques, selectedId, onSelect, disabled }: Props) {
  const { t } = useTranslation();
  return (
    <div className="picker" role="listbox" aria-label={t("picker.aria")}>
      {techniques.map((tech) => (
        <button
          key={tech.id}
          type="button"
          className="chip"
          role="option"
          aria-selected={tech.id === selectedId}
          aria-pressed={tech.id === selectedId}
          disabled={disabled}
          onClick={() => onSelect(tech.id)}
          title={techniqueTooltip(tech)}
          aria-description={techniqueTooltip(tech)}
        >
          {techniqueDisplayName(tech)}
        </button>
      ))}
    </div>
  );
}
