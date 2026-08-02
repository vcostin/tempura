import { formatMinutes } from "../lib/api";
import type { DayStats } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  stats: DayStats | null;
  onClose: () => void;
}

export function StatsView({ stats, onClose }: Props) {
  return (
    <ScrollPanel label="Stats">
      <BrandHeader
        line="Today · you can do this."
        actions={
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        }
      />
      {!stats ? (
        <p className="hint">No stats yet — start a focus rhythm.</p>
      ) : (
        <div className="stats-strip stats-strip--page" aria-label="Today’s stats">
          <div>
            <strong>{formatMinutes(stats.focusSecsToday)}</strong>
            focus time
          </div>
          <div>
            <strong>{stats.completedCyclesToday}</strong>
            cycles finished
          </div>
          <div>
            <strong>{stats.sessionsToday}</strong>
            sessions
          </div>
          <div>
            <strong>{stats.streakDays}</strong>
            day streak
          </div>
        </div>
      )}
    </ScrollPanel>
  );
}
