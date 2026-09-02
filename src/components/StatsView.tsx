import { useTranslation } from "react-i18next";
import { formatMinutes } from "../lib/api";
import type { DayStats } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  stats: DayStats | null;
  onClose: () => void;
}

export function StatsView({ stats, onClose }: Props) {
  const { t } = useTranslation();
  return (
    <ScrollPanel label={t("stats.panel")}>
      <BrandHeader
        line={t("stats.line")}
        actions={
          <button type="button" className="icon-btn" aria-label={t("stats.close")} onClick={onClose}>
            ✕
          </button>
        }
      />
      {!stats ? (
        <p className="hint">{t("stats.empty")}</p>
      ) : (
        <div className="stats-strip stats-strip--page" aria-label={t("stats.aria")}>
          <div>
            <strong>{formatMinutes(stats.focusSecsToday)}</strong>
            {t("stats.focusTime")}
          </div>
          <div>
            <strong>{stats.completedCyclesToday}</strong>
            {t("stats.cyclesFinished")}
          </div>
          <div>
            <strong>{stats.sessionsToday}</strong>
            {t("stats.sessions")}
          </div>
          <div>
            <strong>{stats.streakDays}</strong>
            {t("stats.dayStreak")}
          </div>
        </div>
      )}
    </ScrollPanel>
  );
}
