import type { Technique } from "../lib/types";
import { rhythmSegments, type SetPosition } from "../lib/rhythm";

interface Props {
  technique: Pick<Technique, "mode" | "focusSecs" | "shortBreakSecs" | "longBreakSecs" | "cyclesBeforeLong">;
  /** While a session runs: what's done, where it is now, what's left. */
  position?: SetPosition | null;
}

/**
 * A technique's set at a glance: focus blocks, short breaks and the long break,
 * each as wide as it is long. Decorative: the same facts are in the text beside it.
 * It is a timeline, so it runs right to left in RTL, like the charts.
 */
export function RhythmStrip({ technique, position }: Props) {
  return (
    <span className="strip" aria-hidden="true">
      {rhythmSegments(technique).map((seg, i) => {
        const state = position
          ? i < position.index
            ? "done"
            : i === position.index
              ? "now"
              : "todo"
          : undefined;
        return (
          <span
            key={i}
            className={`strip-seg strip-seg--${seg.kind}`}
            data-state={state}
            style={{ flexGrow: seg.secs }}
          >
            {state === "now" && (
              <span className="strip-fill" style={{ inlineSize: `${Math.round(position!.fraction * 100)}%` }} />
            )}
          </span>
        );
      })}
    </span>
  );
}
