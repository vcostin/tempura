import type { TimerSnapshot } from "../lib/types";

interface Props {
  snapshot: TimerSnapshot;
}

const R = 46;
const C = 2 * Math.PI * R;

export function ProgressRing({ snapshot }: Props) {
  const { durationSecs, remainingSecs, elapsedSecs, isFlow, phase, running } = snapshot;

  let progress = 0;
  if (isFlow && phase === "focus") {
    // Gentle breathing progress for count-up (loops every 60s visually)
    progress = running ? (elapsedSecs % 60) / 60 : 0;
  } else if (durationSecs > 0) {
    progress = 1 - remainingSecs / durationSecs;
  }

  const offset = C * (1 - Math.min(1, Math.max(0, progress)));

  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="motion-safe">
      <circle className="ring-track" cx="50" cy="50" r={R} />
      <circle
        className="ring-progress"
        cx="50"
        cy="50"
        r={R}
        strokeDasharray={C}
        strokeDashoffset={offset}
      />
    </svg>
  );
}
