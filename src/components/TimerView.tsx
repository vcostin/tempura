import { useTranslation } from "react-i18next";
import { formatClock, formatTechniqueRhythm, phaseLabel } from "../lib/api";
import { guideForTechnique, techniqueDisplayName } from "../lib/techniqueGuide";
import type { DayStats, Technique, TimerSnapshot } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ProgressRing } from "./ProgressRing";
import { TechniquePicker } from "./TechniquePicker";

interface Props {
  snapshot: TimerSnapshot;
  techniques: Technique[];
  selectedId: string;
  onSelectTechnique: (id: string) => void;
  stats: DayStats | null;
  hybridBell: boolean;
  workingOn: string;
  onWorkingOn: (value: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onSkip: () => void;
  onReset: () => void;
  onStop: () => void;
  onContinueFlow: () => void;
  onOpenSettings: () => void;
  onOpenStats: () => void;
  onOpenGuide: () => void;
  onOpenDebug?: () => void;
}

export function TimerView(props: Props) {
  const { t } = useTranslation();
  const { snapshot: s } = props;
  const displaySecs =
    s.isFlow && s.phase === "focus" ? s.elapsedSecs : s.running ? s.remainingSecs : 0;
  const showClock = s.running || s.phase !== "idle";
  const selected =
    props.techniques.find((tech) => tech.id === props.selectedId) ??
    props.techniques.find((tech) => tech.id === s.techniqueId) ??
    null;
  const rhythm = selected ? formatTechniqueRhythm(selected) : null;
  const guide = selected ? guideForTechnique(selected) : null;
  const shownName = selected
    ? techniqueDisplayName(selected)
    : s.techniqueId
      ? techniqueDisplayName({
          id: s.techniqueId,
          kind: "system",
          name: s.techniqueName ?? "",
        })
      : s.techniqueName;

  return (
    <>
      <BrandHeader
        line={t("brand.tagline")}
        actions={
          <>
            <button
              type="button"
              className="icon-btn"
              aria-label={t("timer.guideAria")}
              onClick={props.onOpenGuide}
              title={t("timer.guideTitle")}
            >
              <GuideIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={t("timer.statsAria")}
              onClick={props.onOpenStats}
              title={t("timer.statsTitle")}
            >
              <StatsIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={t("timer.settingsAria")}
              onClick={props.onOpenSettings}
              title={t("timer.settingsTitle")}
            >
              <GearIcon />
            </button>
            {props.onOpenDebug && (
              <button
                type="button"
                className="icon-btn"
                aria-label="Debug"
                onClick={props.onOpenDebug}
                title="Debug"
              >
                <BugIcon />
              </button>
            )}
          </>
        }
      />

      <TechniquePicker
        techniques={props.techniques}
        selectedId={props.selectedId}
        onSelect={props.onSelectTechnique}
        disabled={s.running}
      />
      {rhythm && (
        <div className="rhythm-block">
          <p className="rhythm-summary" aria-live="polite">
            {rhythm}
          </p>
          {guide && (
            <p className="rhythm-best" title={guide.blurb}>
              {t("timer.bestFor", { value: guide.bestFor })}
              <button
                type="button"
                className="linkish"
                onClick={props.onOpenGuide}
              >
                {t("timer.learnMore")}
              </button>
            </p>
          )}
        </div>
      )}

      <div className="timer-stage">
        <div className="ring-wrap motion-safe">
          <ProgressRing snapshot={s} />
          <div className="ring-center">
            <p className="phase-label is-enter" key={s.phase}>
              {s.paused && s.running ? t("phase.paused") : phaseLabel(s.phase, t)}
            </p>
            <p className="clock" aria-live="polite">
              {showClock ? formatClock(displaySecs) : "––:––"}
            </p>
            {(shownName || selected) && (
              <p className="technique-name">
                {shownName}
                {s.cycle > 0 ? t("timer.cycle", { count: s.cycle }) : ""}
                {s.hybridSwitched ? t("timer.flowing") : ""}
              </p>
            )}
          </div>
        </div>

        {props.hybridBell && (
          <div className="hybrid-banner" role="status">
            <span>{t("timer.hybridBell")}</span>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={props.onContinueFlow}>
                {t("timer.keepFlowing")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={props.onResume}>
                {t("timer.takeBreak")}
              </button>
            </div>
          </div>
        )}

        <div className="working-on">
          <input
            type="text"
            placeholder={t("timer.workingOn")}
            value={props.workingOn}
            onChange={(e) => props.onWorkingOn(e.target.value)}
            aria-label={t("timer.workingOnAria")}
          />
        </div>
      </div>

      <div className="controls">
        {!s.running ? (
          <button type="button" className="btn btn-primary" onClick={props.onStart}>
            {t("timer.start")}
          </button>
        ) : (
          <>
            {s.paused ? (
              <button type="button" className="btn btn-primary" onClick={props.onResume}>
                {t("timer.resume")}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={props.onPause}>
                {t("timer.pause")}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={props.onSkip}>
              {t("timer.skip")}
            </button>
            <button type="button" className="btn btn-ghost" onClick={props.onReset}>
              {t("timer.reset")}
            </button>
            <button type="button" className="btn btn-danger" onClick={props.onStop}>
              {t("timer.stop")}
            </button>
          </>
        )}
      </div>

      {props.stats && (
        <div className="stats-strip" aria-label={t("timer.todayGlance")}>
          <div>
            <strong>{Math.round(props.stats.focusSecsToday / 60)}m</strong>
            {t("timer.focusedToday")}
          </div>
          <div>
            <strong>{props.stats.completedCyclesToday}</strong>
            {t("timer.cycles", { count: props.stats.completedCyclesToday })}
          </div>
          <div>
            <strong>{props.stats.streakDays}</strong>
            {t("timer.dayStreak")}
          </div>
        </div>
      )}
    </>
  );
}

function GuideIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v6" strokeLinecap="round" />
      <circle cx="12" cy="7.25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.5-2-3.5-2.4.5a7.6 7.6 0 0 0-1.7-1L15 3h-6l-.4 2.5a7.6 7.6 0 0 0-1.7 1L4.5 6 2.5 9.5 4.5 11a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.5 2.4-.5a7.6 7.6 0 0 0 1.7 1L9 21h6l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4.5 2-3.5-2-1.5Z" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" strokeLinecap="round" />
    </svg>
  );
}

function BugIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        d="M8 9.5C8 7 9.8 5 12 5s4 2 4 4.5v5c0 2.5-1.8 4.5-4 4.5s-4-2-4-4.5v-5Z"
        strokeLinecap="round"
      />
      <path d="M12 5V3M8.5 8H5M18.5 8H15M8.5 12H4M20 12h-4.5M9 16.5 6.5 19M15 16.5 17.5 19" strokeLinecap="round" />
      <path d="M10 10.5h4M10 13.5h4" strokeLinecap="round" />
    </svg>
  );
}
