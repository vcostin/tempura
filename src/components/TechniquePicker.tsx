import { useTranslation } from "react-i18next";
import type { Technique } from "../lib/types";
import { techniqueDisplayName, techniqueTooltip } from "../lib/techniqueGuide";

interface Props {
  techniques: Technique[];
  selectedId: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}

/** Exclusive technique chips as a toggle group (not a listbox). */
export function TechniquePicker({ techniques, selectedId, onSelect, disabled }: Props) {
  const { t } = useTranslation();
  return (
    <div className="picker" role="group" aria-label={t("picker.aria")}>
      {techniques.map((tech) => (
        <button
          key={tech.id}
          type="button"
          className="chip"
          aria-pressed={tech.id === selectedId}
          disabled={disabled}
          onClick={() => onSelect(tech.id)}
          title={techniqueTooltip(tech)}
        >
          {techniqueDisplayName(tech)}
        </button>
      ))}
    </div>
  );
}
