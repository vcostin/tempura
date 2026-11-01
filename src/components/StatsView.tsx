import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { api, formatMinutes } from "../lib/api";
import {
  REPORT_RANGES,
  canPageBack,
  canPageForward,
  chartBars,
  finishedShare,
  heatLevel,
  heatRows,
  hourTotals,
  insights,
  parseDay,
  reportPeriod,
  shiftAnchor,
  weekStartFor,
  weekdayOf,
  weekendFor,
  type ChartBar,
  type HeatRow,
  type ReportPeriod,
  type ReportRange,
} from "../lib/report";
import { techniqueDisplayName } from "../lib/techniqueGuide";
import type { ExportFormat, FocusShare, PeriodStats, TechniqueUsage } from "../lib/types";
import { barPercent } from "../lib/statsBars";
import { BrandHeader } from "./BrandHeader";
import { ScrollPanel } from "./ScrollPanel";

interface Props {
  onClose: () => void;
  /** Save every session as a file; the route reports the outcome. */
  onExport: (format: ExportFormat) => Promise<void>;
  /** Days in a row with focus, up to today (from the timer's day stats). */
  streakDays: number;
}

const RANGE_KEY = {
  day: "report.day",
  week: "report.week",
  month: "report.month",
  year: "report.year",
  all: "report.all",
} as const;

/** Any Monday: weekday `w` (0 = Monday) is this date plus `w` days. */
const A_MONDAY = { y: 2026, m: 9, d: 5 };

function weekdayName(weekday: number, locale: string, style: "long" | "short"): string {
  const date = new Date(A_MONDAY.y, A_MONDAY.m, A_MONDAY.d + weekday, 12);
  return date.toLocaleDateString(locale, { weekday: style });
}

function hourRange(hour: number, locale: string): string {
  const fmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
  return fmt.formatRange(new Date(2026, 0, 1, hour), new Date(2026, 0, 1, hour + 1));
}

function periodTitle(range: ReportRange, period: ReportPeriod, locale: string): string {
  const from = parseDay(period.full.from);
  const to = parseDay(period.full.to);
  if (range === "month") return from.toLocaleDateString(locale, { month: "long", year: "numeric" });
  if (range === "year") return from.toLocaleDateString(locale, { year: "numeric" });
  if (range === "day") {
    const sameYear = from.getFullYear() === new Date().getFullYear();
    return from.toLocaleDateString(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
      ...(sameYear ? {} : { year: "numeric" }),
    });
  }
  const opts: Intl.DateTimeFormatOptions =
    range === "week"
      ? { month: "short", day: "numeric" }
      : { year: "numeric", month: "short", day: "numeric" };
  return new Intl.DateTimeFormat(locale, opts).formatRange(from, to);
}

/** "2h more than the week before" and the like; null for all time. */
function comparisonLine(range: ReportRange, stats: PeriodStats, t: TFunction): string | null {
  if (range === "all") return null;
  const diff = stats.focusSecs - stats.previous.focusSecs;
  const unit = { day: "Day", week: "Week", month: "Month", year: "Year" }[range];
  // Under a minute either way reads as "the same".
  if (Math.abs(diff) < 60) return t(`report.same${unit}`);
  const amount = formatMinutes(Math.abs(diff), t);
  return t(diff > 0 ? `report.more${unit}` : `report.less${unit}`, { amount });
}

/** The range Stats reopens on for the rest of this app session. */
let lastRange: ReportRange = "week";

/** Stats: any day, week, month, year or all time, from `get_period_stats`. */
export function StatsView({ onClose, onExport, streakDays }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const weekStart = useMemo(() => weekStartFor(locale), [locale]);
  const weekend = useMemo(() => weekendFor(locale), [locale]);
  const [range, setRange] = useState<ReportRange>(lastRange);
  const [exporting, setExporting] = useState(false);
  const [anchor, setAnchor] = useState(() => new Date());
  const [firstDay, setFirstDay] = useState<string | null>(null);
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [heatMode, setHeatMode] = useState<"average" | "total">("average");

  const period = useMemo(
    () => reportPeriod(range, anchor, { today: new Date(), weekStart, firstDay }),
    [range, anchor, weekStart, firstDay],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    // A new range gets a fresh try: don't keep showing the last one's error.
    setFailed(false);
    api
      .getPeriodStats(period.from, period.to, period.compare)
      .then((next) => {
        if (cancelled) return;
        setStats(next);
        setFailed(false);
        setFirstDay(next.firstDay);
      })
      .catch((e) => {
        console.error(e);
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [period.from, period.to, period.compare?.from, period.compare?.to]);

  const today = new Date();
  const backOk = canPageBack(range, period, firstDay);
  const forwardOk = canPageForward(range, period, today);
  const hasFocus = (stats?.focusSecs ?? 0) > 0;
  const days = stats ? stats.buckets.length : 0;
  const isDay = range === "day";

  const exportAs = async (format: ExportFormat) => {
    setExporting(true);
    try {
      await onExport(format);
    } finally {
      setExporting(false);
    }
  };

  return (
    <ScrollPanel label={t("stats.panel")} className="panel--report">
      <div className="report">
        <BrandHeader
          line={t("stats.line")}
          actions={
            <button type="button" className="icon-btn" data-dialog-close aria-label={t("stats.close")} onClick={onClose}>
              ✕
            </button>
          }
        />

        <div className="report-controls">
          <div className="stats-period" role="group" aria-label={t("report.rangeAria")}>
            {REPORT_RANGES.map((r) => (
              <button
                key={r}
                type="button"
                className="chip"
                aria-pressed={range === r}
                onClick={() => {
                  lastRange = r;
                  setRange(r);
                  setAnchor(new Date());
                }}
              >
                {t(RANGE_KEY[r])}
              </button>
            ))}
          </div>
          <div className="report-nav">
            {range !== "all" && (
              <button type="button" className="icon-btn report-nav__step" aria-label={t("report.prev")} disabled={!backOk} onClick={() => setAnchor(shiftAnchor(range, anchor, -1))}>
                <Chevron dir="back" />
              </button>
            )}
            <h2 className="report-nav__title" aria-live="polite">
              {periodTitle(range, period, locale)}
            </h2>
            {range !== "all" && (
              <button type="button" className="icon-btn report-nav__step" aria-label={t("report.next")} disabled={!forwardOk} onClick={() => setAnchor(shiftAnchor(range, anchor, 1))}>
                <Chevron dir="forward" />
              </button>
            )}
          </div>
        </div>

        <div aria-busy={loading || undefined}>
          {loading && !stats ? (
            <p className="hint">{t("report.loading")}</p>
          ) : failed || !stats ? (
            <p className="hint">{t("report.failed")}</p>
          ) : !hasFocus ? (
            <p className="hint">{t("report.empty")}</p>
          ) : (
            <>
              <p className="report-hero">{t("report.hero", { focus: formatMinutes(stats.focusSecs, t) })}</p>
              {comparisonLine(range, stats, t) && <p className="report-delta">{comparisonLine(range, stats, t)}</p>}

              <div className="report-kpis">
                <Kpi value={formatMinutes(stats.focusSecs, t)} label={t("stats.focusTime")} />
                {!isDay && (
                  <Kpi value={stats.activeDays.toLocaleString(locale)} label={t("report.activeDaysOf", { total: days.toLocaleString(locale) })} />
                )}
                <Kpi value={stats.completedCycles.toLocaleString(locale)} label={t("stats.cyclesFinished")} />
                <Kpi value={stats.sessions.toLocaleString(locale)} label={t("stats.sessions")} />
                <Kpi value={streakDays.toLocaleString(locale)} label={t("stats.dayStreak")} />
                {!isDay && <Kpi value={stats.longestStreak.toLocaleString(locale)} label={t("report.longestStreak")} />}
              </div>

              {isDay ? (
                <section className="report-card report-card--wide" aria-labelledby="report-hours">
                  <h3 id="report-hours">{t("report.byHour")}</h3>
                  <HourBars hours={hourTotals(stats.hours)} locale={locale} t={t} />
                </section>
              ) : (
                <section className="report-card report-card--wide" aria-labelledby="report-when">
                  <div className="report-card__head">
                    <h3 id="report-when">{t("report.when")}</h3>
                    <div className="stats-period report-card__toggle" role="group" aria-label={t("report.when")}>
                      {(["average", "total"] as const).map((mode) => (
                        <button key={mode} type="button" className="chip" aria-pressed={heatMode === mode} onClick={() => setHeatMode(mode)}>
                          {t(mode === "average" ? "report.averageWeek" : "report.total")}
                        </button>
                      ))}
                    </div>
                  </div>
                  <HeatMap rows={heatRows(stats, heatMode, weekStart)} locale={locale} t={t} />
                  <Insights stats={stats} weekend={weekend} locale={locale} t={t} />
                </section>
              )}

              <div className="report-grid">
                {!isDay && (
                  <section className="report-card" aria-labelledby="report-bars">
                    <h3 id="report-bars">{t(stats.buckets.length > 62 ? "report.byMonth" : "report.byDay")}</h3>
                    <Bars bars={chartBars(stats.buckets)} weekend={weekend} locale={locale} t={t} />
                  </section>
                )}

                {stats.techniques.length > 0 && (
                  <section className="report-card" aria-labelledby="report-rhythms">
                    <h3 id="report-rhythms">{t("report.rhythms")}</h3>
                    <RhythmTable usage={stats.techniques} locale={locale} t={t} />
                  </section>
                )}

                {stats.byLabel.length > 0 && (
                  <div className="report-card">
                    <ShareBars title={t("stats.byLabel")} shares={stats.byLabel} t={t} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <section className="stats-export" aria-label={t("stats.export")}>
          <p className="stats-bars__label">{t("stats.export")}</p>
          <p className="hint">{t("stats.exportHint")}</p>
          <div className="stats-export__buttons">
            {(["csv", "json"] as const).map((format) => (
              <button key={format} type="button" className="btn btn-ghost" disabled={exporting} onClick={() => void exportAs(format)}>
                {t(format === "csv" ? "stats.exportCsv" : "stats.exportJson")}
              </button>
            ))}
          </div>
        </section>
      </div>
    </ScrollPanel>
  );
}

function Chevron({ dir }: { dir: "back" | "forward" }) {
  return (
    <svg className="report-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d={dir === "back" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="report-kpi">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

/**
 * Weekday × hour grid. The coloured grid is for the eye; a table with the same
 * minutes follows for screen readers.
 */
function HeatMap({ rows, locale, t }: { rows: HeatRow[]; locale: string; t: TFunction }) {
  const max = Math.max(0, ...rows.flatMap((r) => r.hours));
  const num = new Intl.NumberFormat(locale);
  return (
    <figure className="report-heat">
      <div className="report-heat__grid" aria-hidden="true">
        {rows.map((row) => (
          <Fragment key={row.weekday}>
            <span className="report-heat__day">{weekdayName(row.weekday, locale, "short")}</span>
            {row.hours.map((secs, hour) => (
              <span
                key={hour}
                className="report-heat__cell"
                data-level={heatLevel(secs, max)}
                title={`${weekdayName(row.weekday, locale, "long")} · ${hourRange(hour, locale)} · ${secs > 0 ? formatMinutes(secs, t) : "—"}`}
              />
            ))}
          </Fragment>
        ))}
        <span />
        {Array.from({ length: 24 }, (_, hour) => (
          <span key={hour} className="report-heat__hour">
            {hour % 3 === 0 ? num.format(hour) : ""}
          </span>
        ))}
      </div>
      <figcaption className="report-legend" aria-hidden="true">
        <span>{t("report.less")}</span>
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <i key={level} className="report-heat__cell" data-level={level} />
        ))}
        <span>{t("report.more")}</span>
      </figcaption>
      <table className="visually-hidden">
        <caption>{t("report.heatTable")}</caption>
        <thead>
          <tr>
            <td />
            {Array.from({ length: 24 }, (_, hour) => (
              <th key={hour} scope="col">
                {hourRange(hour, locale)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.weekday}>
              <th scope="row">{weekdayName(row.weekday, locale, "long")}</th>
              {row.hours.map((secs, hour) => (
                <td key={hour}>{num.format(Math.round(secs / 60))}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Insights({ stats, weekend, locale, t }: { stats: PeriodStats; weekend: number[]; locale: string; t: TFunction }) {
  const found = insights(stats.hours, weekend);
  if (!found) return null;
  const hour = new Date(2026, 0, 1, found.peakHour).toLocaleTimeString(locale, { hour: "numeric" });
  const share = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(found.weekendShare);
  return (
    <ul className="report-insights">
      <li>{t("report.peakHour", { hour })}</li>
      <li>{t("report.busiestDay", { weekday: weekdayName(found.busiestWeekday, locale, "long") })}</li>
      <li>{t("report.weekendShare", { share })}</li>
    </ul>
  );
}

function barLabel(bar: ChartBar, locale: string, long: boolean): string {
  const date = parseDay(bar.date);
  if (bar.unit === "month") {
    return date.toLocaleDateString(locale, long ? { month: "long", year: "numeric" } : { month: "short" });
  }
  return date.toLocaleDateString(locale, long ? { weekday: "long", month: "long", day: "numeric" } : { day: "numeric" });
}

/** Focus per day (or month) as columns against the period's average. */
function Bars({ bars, weekend, locale, t }: { bars: ChartBar[]; weekend: number[]; locale: string; t: TFunction }) {
  const max = Math.max(1, ...bars.map((b) => b.focusSecs));
  const average = bars.reduce((sum, b) => sum + b.focusSecs, 0) / Math.max(1, bars.length);
  const every = bars.length <= 8 ? 1 : bars.length <= 16 ? 2 : bars.length <= 31 ? 5 : 3;
  return (
    <figure className="report-bars">
      <div className="report-bars__plot" aria-hidden="true">
        {bars.map((bar) => (
          <span
            key={bar.date}
            className={`report-bars__bar${bar.unit === "day" && weekend.includes(weekdayOf(bar.date)) ? " is-weekend" : ""}`}
            style={{ height: `${barPercent(bar.focusSecs, max)}%` }}
            title={`${barLabel(bar, locale, true)} · ${bar.focusSecs > 0 ? formatMinutes(bar.focusSecs, t) : "—"}`}
          />
        ))}
        {average > 0 && (
          <div className="report-bars__avg" style={{ bottom: `${(average / max) * 100}%` }}>
            <span>{t("report.average", { value: formatMinutes(average, t) })}</span>
          </div>
        )}
      </div>
      <div className="report-bars__axis" aria-hidden="true">
        {bars.map((bar, i) => (
          <span key={bar.date}>{i % every === 0 ? barLabel(bar, locale, false) : ""}</span>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>{t(bars[0]?.unit === "month" ? "report.byMonth" : "report.byDay")}</caption>
        <tbody>
          {bars.map((bar) => (
            <tr key={bar.date}>
              <th scope="row">{barLabel(bar, locale, true)}</th>
              <td>{bar.focusSecs > 0 ? formatMinutes(bar.focusSecs, t) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A day's focus per hour, 0–23, as columns. */
function HourBars({ hours, locale, t }: { hours: number[]; locale: string; t: TFunction }) {
  const max = Math.max(1, ...hours);
  const num = new Intl.NumberFormat(locale);
  return (
    <figure className="report-bars">
      <div className="report-bars__plot" aria-hidden="true">
        {hours.map((secs, hour) => (
          <span
            key={hour}
            className="report-bars__bar"
            style={{ height: `${barPercent(secs, max)}%` }}
            title={`${hourRange(hour, locale)} · ${secs > 0 ? formatMinutes(secs, t) : "—"}`}
          />
        ))}
      </div>
      <div className="report-bars__axis" aria-hidden="true">
        {hours.map((_, hour) => (
          <span key={hour}>{hour % 3 === 0 ? num.format(hour) : ""}</span>
        ))}
      </div>
      <table className="visually-hidden">
        <caption>{t("report.byHour")}</caption>
        <tbody>
          {hours.map((secs, hour) => (
            <tr key={hour}>
              <th scope="row">{hourRange(hour, locale)}</th>
              <td>{secs > 0 ? formatMinutes(secs, t) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function usageName(u: TechniqueUsage): string {
  return u.techniqueId ? techniqueDisplayName({ id: u.techniqueId, kind: "system", name: u.name }) : u.name;
}

function RhythmTable({ usage, locale, t }: { usage: TechniqueUsage[]; locale: string; t: TFunction }) {
  const max = Math.max(1, ...usage.map((u) => u.focusSecs));
  const num = new Intl.NumberFormat(locale);
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  return (
    <>
      <div className="report-table-wrap">
        <table className="report-table">
          <thead>
            <tr>
              <th scope="col">{t("report.colRhythm")}</th>
              <th scope="col">{t("report.colFocus")}</th>
              <th scope="col">{t("report.colSessions")}</th>
              <th scope="col">{t("report.colAverage")}</th>
              <th scope="col">{t("report.colFinished")}</th>
            </tr>
          </thead>
          <tbody>
            {usage.map((u) => {
              const share = finishedShare(u);
              return (
                <tr key={u.techniqueId ?? `name:${u.name}`}>
                  <th scope="row">{usageName(u)}</th>
                  <td>
                    <span className="report-table__focus">
                      <span className="report-table__bar" aria-hidden="true">
                        <i style={{ width: `${barPercent(u.focusSecs, max)}%` }} />
                      </span>
                      {formatMinutes(u.focusSecs, t)}
                    </span>
                  </td>
                  <td>{num.format(u.sessions)}</td>
                  <td>{u.sessions > 0 ? formatMinutes(u.focusSecs / u.sessions, t) : "—"}</td>
                  <td>{share === null ? "—" : pct.format(share)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint report-hint">{t("report.finishedHint")}</p>
    </>
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
