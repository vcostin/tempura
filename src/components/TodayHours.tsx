import { useTranslation } from "react-i18next";
import { formatMinutes } from "../lib/api";
import { hourLevel } from "../lib/todayHours";

interface Props {
  /** Focus seconds for each local hour today, 0–23. */
  hours: number[];
}

/**
 * Today in 24 cells, one per hour, darker the more focus it held; the current
 * hour is outlined. A timeline, so it runs right to left in RTL. Screen readers
 * get the same as a sentence.
 */
export function TodayHours({ hours }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const now = new Date().getHours();
  const hourName = (h: number) => new Date(2026, 0, 1, h).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const busy = hours.flatMap((secs, h) => (hourLevel(secs) > 0 ? [`${hourName(h)} ${formatMinutes(secs, t)}`] : []));
  const list = new Intl.ListFormat(locale, { style: "short", type: "conjunction" }).format(busy);

  return (
    <div className="today-hours">
      <div className="today-hours-cells" aria-hidden="true">
        {hours.map((secs, h) => (
          <span
            key={h}
            className="today-hours-cell"
            data-level={hourLevel(secs)}
            data-now={h === now ? "" : undefined}
            title={`${hourName(h)} · ${hourLevel(secs) > 0 ? formatMinutes(secs, t) : "—"}`}
          />
        ))}
      </div>
      <p className="visually-hidden">{busy.length ? t("today.byHour", { list }) : t("today.noneYet")}</p>
    </div>
  );
}
