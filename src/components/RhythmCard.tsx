import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { formatMinutes, formatTechniqueRhythm } from "../lib/api";
import { rhythmNumbers, setPosition } from "../lib/rhythm";
import { techniqueDisplayName, techniqueTooltip } from "../lib/techniqueGuide";
import type { Technique, TimerSnapshot } from "../lib/types";
import { RhythmStrip } from "./RhythmStrip";

interface Props {
  technique: Technique;
  snapshot: TimerSnapshot;
  sheetOpen: boolean;
  onOpenSheet: () => void;
}

/**
 * The current technique and its rhythm. Idle, it is the way to change technique
 * (it opens the sheet); while a session runs, it shows where you are in the set.
 */
export const RhythmCard = forwardRef<HTMLButtonElement, Props>(function RhythmCard(
  { technique, snapshot, sheetOpen, onOpenSheet },
  ref,
) {
  const { t } = useTranslation();
  const name = techniqueDisplayName(technique);
  const numbers = rhythmNumbers(technique) ?? t("rhythm.openEnded");

  if (snapshot.running) {
    const position = setPosition(technique, snapshot);
    const left =
      position?.remainingSecs != null
        ? t("rhythm.leftInSet", { time: formatMinutes(position.remainingSecs, t) })
        : numbers;
    return (
      <div className="rhythm-card is-running">
        <span className="rhythm-card-top">
          <span className="rhythm-card-name">{name}</span>
          <span className="rhythm-card-meta">{left}</span>
        </span>
        <RhythmStrip technique={technique} position={position} />
      </div>
    );
  }

  return (
    <button
      ref={ref}
      type="button"
      className="rhythm-card"
      aria-haspopup="dialog"
      aria-expanded={sheetOpen}
      title={techniqueTooltip(technique)}
      onClick={onOpenSheet}
    >
      <span className="rhythm-card-top">
        <span className="rhythm-card-name">{name}</span>
        <span className="rhythm-card-meta" aria-hidden="true">
          {numbers}
        </span>
        <span className="visually-hidden">{formatTechniqueRhythm(technique)}</span>
        <span className="rhythm-card-change">
          {t("rhythm.change")}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
            <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </span>
      <RhythmStrip technique={technique} />
    </button>
  );
});
