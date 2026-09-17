import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, formatMinutes } from "../lib/api";
import type { StatsPeriod, StatsRange } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  /** Today glance from the session hook — used for streak until range loads. */
  streakFallback?: number;
  onClose: () => void;
}

const PERIODS: StatsPeriod[] = [1, 7, 30];

function periodLabelKey(days: StatsPeriod): "stats.periodToday" | "stats.period7" | "stats.period30" {
  if (days === 1) return "stats.periodToday";
  if (days === 7) return "stats.period7";
  return "stats.period30";
}

function shortDayLabel(isoDate: string, days: StatsPeriod, locale: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (days === 1) {
    return date.toLocaleDateString(locale, { weekday: "long", month: "short", day: "numeric" });
  }
  if (days <= 7) {
    return date.toLocaleDateString(locale, { weekday: "short" });
  }
  return date.toLocaleDateString(locale, { month: "short", day: "numeric" });
}

export function StatsView({ streakFallback = 0, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<StatsPeriod>(7);
  const [range, setRange] = useState<StatsRange | null>(null);
  const [loading, setLoading] = useState(true);
  const dateLocale = i18n.resolvedLanguage || i18n.language;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const next = await api.getStatsRange(period);
        if (!cancelled) setRange(next);
      } catch {
        if (!cancelled) setRange(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const maxFocus = useMemo(() => {
    if (!range?.buckets.length) return 0;
    return Math.max(...range.buckets.map((b) => b.focusSecs), 1);
  }, [range]);

  const hasAny = (range?.focusSecs ?? 0) > 0 || (range?.sessions ?? 0) > 0;
  const streak = range?.streakDays ?? streakFallback;

  return (
    <ScrollPanel label={t("stats.panel")}>
      <BrandHeader
        line={t("stats.line")}
        actions={
          <button
            type="button"
            className="icon-btn"
            data-dialog-close
            aria-label={t("stats.close")}
            onClick={onClose}
          >
            ✕
          </button>
        }
      />

      <div className="stats-period" role="group" aria-label={t("stats.periodAria")}>
        {PERIODS.map((days) => (
          <button
            key={days}
            type="button"
            className="chip"
            aria-pressed={period === days}
            onClick={() => setPeriod(days)}
          >
            {t(periodLabelKey(days))}
          </button>
        ))}
      </div>

      <div aria-busy={loading || undefined}>
        {loading && !range ? (
          <p className="hint">{t("stats.loading")}</p>
        ) : !hasAny ? (
          <p className="hint">{t("stats.empty")}</p>
        ) : (
          <>
            <div className="stats-strip stats-strip--page" aria-label={t("stats.aria")}>
              <div>
                <strong>{formatMinutes(range!.focusSecs)}</strong>
                {t("stats.focusTime")}
              </div>
              <div>
                <strong>{range!.completedCycles}</strong>
                {t("stats.cyclesFinished")}
              </div>
              <div>
                <strong>{range!.sessions}</strong>
                {t("stats.sessions")}
              </div>
              <div>
                <strong>{streak}</strong>
                {t("stats.dayStreak")}
              </div>
            </div>

            {period > 1 && (
              <div className="stats-bars" aria-label={t("stats.dailyBreakdown")}>
                <p className="stats-bars__label">{t("stats.dailyBreakdown")}</p>
                <ul className="stats-bars__list">
                  {range!.buckets.map((b) => {
                    const pct = Math.round((b.focusSecs / maxFocus) * 100);
                    const label = shortDayLabel(b.date, period, dateLocale);
                    const value =
                      b.focusSecs > 0 ? formatMinutes(b.focusSecs) : t("stats.noFocusDay");
                    return (
                      <li key={b.date} className="stats-bars__row">
                        <span className="stats-bars__day">{label}</span>
                        <span className="stats-bars__track" aria-hidden="true">
                          <span
                            className="stats-bars__fill"
                            style={{ width: `${b.focusSecs > 0 ? Math.max(pct, 4) : 0}%` }}
                          />
                        </span>
                        <span className="stats-bars__value">{value}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </ScrollPanel>
  );
}
