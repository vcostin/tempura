import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { api, formatMinutes } from "../lib/api";
import { barPercent } from "../lib/statsBars";
import { techniqueDisplayName } from "../lib/techniqueGuide";
import type { ExportFormat, FocusShare, StatsPeriod, StatsRange } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  /** Today glance from the session hook — used for streak until range loads. */
  streakFallback?: number;
  onClose: () => void;
  /** Save every session as a file; the route reports the outcome. */
  onExport: (format: ExportFormat) => Promise<void>;
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

export function StatsView({ streakFallback = 0, onClose, onExport }: Props) {
  const { t, i18n } = useTranslation();
  const [period, setPeriod] = useState<StatsPeriod>(7);
  const [range, setRange] = useState<StatsRange | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
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

  const exportAs = async (format: ExportFormat) => {
    setExporting(true);
    try {
      await onExport(format);
    } finally {
      setExporting(false);
    }
  };

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
                    const pct = barPercent(b.focusSecs, maxFocus);
                    const label = shortDayLabel(b.date, period, dateLocale);
                    const value =
                      b.focusSecs > 0 ? formatMinutes(b.focusSecs) : t("stats.noFocusDay");
                    return (
                      <li key={b.date} className="stats-bars__row">
                        <span className="stats-bars__day">{label}</span>
                        <span className="stats-bars__track" aria-hidden="true">
                          <span
                            className="stats-bars__fill"
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                        <span className="stats-bars__value">{value}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <ShareBars title={t("stats.byLabel")} shares={range!.byLabel} t={t} />
            <ShareBars title={t("stats.byTechnique")} shares={range!.byTechnique} t={t} />
          </>
        )}
      </div>

      <section className="stats-export" aria-label={t("stats.export")}>
        <p className="stats-bars__label">{t("stats.export")}</p>
        <p className="hint">{t("stats.exportHint")}</p>
        <div className="stats-export__buttons">
          {(["csv", "json"] as const).map((format) => (
            <button
              key={format}
              type="button"
              className="btn btn-ghost"
              disabled={exporting}
              onClick={() => void exportAs(format)}
            >
              {t(format === "csv" ? "stats.exportCsv" : "stats.exportJson")}
            </button>
          ))}
        </div>
      </section>
    </ScrollPanel>
  );
}

/** A row's title: a label, a technique (built-ins in the user's language), "Other" or "No label". */
function shareName(share: FocusShare, t: TFunction): string {
  if (share.kind === "other") return t("stats.other");
  if (share.kind === "none") return t("stats.noLabel");
  if (share.techniqueId) {
    return techniqueDisplayName({ id: share.techniqueId, kind: "system", name: share.name });
  }
  return share.name;
}

/** Focus time split by what it was spent on, in the same bars as the daily breakdown. */
function ShareBars({ title, shares, t }: { title: string; shares: FocusShare[]; t: TFunction }) {
  if (!shares.length) return null;
  const max = Math.max(...shares.map((s) => s.focusSecs), 1);
  return (
    <section className="stats-bars" aria-label={title}>
      <p className="stats-bars__label">{title}</p>
      <ul className="stats-bars__list">
        {shares.map((share) => {
          const name = shareName(share, t);
          return (
            <li key={`${share.kind}:${share.techniqueId ?? share.name}`} className="stats-bars__row">
              <span className="stats-bars__day" title={name}>
                {name}
              </span>
              <span className="stats-bars__track" aria-hidden="true">
                <span
                  className="stats-bars__fill"
                  style={{ width: `${barPercent(share.focusSecs, max)}%` }}
                />
              </span>
              <span className="stats-bars__value">{formatMinutes(share.focusSecs, t)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
