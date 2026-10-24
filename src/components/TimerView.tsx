import { useId } from "react";
import { useTranslation } from "react-i18next";
import { formatClock, formatMinutes, formatTechniqueRhythm, phaseLabel } from "../lib/api";
import { guideForTechnique, techniqueDisplayName } from "../lib/techniqueGuide";
import { offersToCountAway, showsPaused, startPhaseKey } from "../lib/timerLabels";
import type { DayStats, Technique, TimerSnapshot } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ProgressRing } from "./ProgressRing";
import { TechniquePicker } from "./TechniquePicker";
import type { HideBlock } from "../state/techniqueVisibility";

interface Props {
  snapshot: TimerSnapshot;
  techniques: Technique[];
  /** The techniques on the picker; the rest are hidden from the timer. */
  visibleTechniques: Technique[];
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
  onCountAway: () => void;
  onDismissAway: () => void;
  autoContinue: boolean;
  onAutoContinue: (enabled: boolean) => void;
  onNewTechnique: () => void;
  onShowHiddenTechniques: () => void;
  hideBlock: (id: string) => HideBlock;
  onHideTechnique: (tech: Technique) => void;
  onEditTechnique: (id: string) => void;
  onOpenSettings: () => void;
  onOpenStats: () => void;
  /** Opens the techniques library, optionally at one technique. */
  onOpenTechniques: (focusId?: string) => void;
  onOpenAbout: () => void;
  onOpenDebug?: () => void;
}

export function TimerView(props: Props) {
  const { t } = useTranslation();
  const { snapshot: s } = props;
  const autoContinueId = useId();
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

  const phaseText = showsPaused(s) ? t("phase.paused") : phaseLabel(s.phase, t);

  return (
    <>
      <BrandHeader
        line={t("brand.tagline")}
        actions={
          <>
            <button
              type="button"
              className="icon-btn"
              data-open-panel="techniques"
              aria-haspopup="dialog"
              aria-label={t("timer.guideAria")}
              onClick={() => props.onOpenTechniques()}
              title={t("timer.guideTitle")}
            >
              <GuideIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              data-open-panel="stats"
              aria-haspopup="dialog"
              aria-label={t("timer.statsAria")}
              onClick={props.onOpenStats}
              title={t("timer.statsTitle")}
            >
              <StatsIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              data-open-panel="settings"
              aria-haspopup="dialog"
              aria-label={t("timer.settingsAria")}
              onClick={props.onOpenSettings}
              title={t("timer.settingsTitle")}
            >
              <GearIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              data-open-panel="about"
              aria-haspopup="dialog"
              aria-label={t("timer.aboutAria")}
              onClick={props.onOpenAbout}
              title={t("timer.aboutTitle")}
            >
              <AboutIcon />
            </button>
            {props.onOpenDebug && (
              <button
                type="button"
                className="icon-btn"
                data-open-panel="debug"
                aria-haspopup="dialog"
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

      <main id="timer-main">
      <TechniquePicker
        techniques={props.visibleTechniques}
        selectedId={props.selectedId}
        onSelect={props.onSelectTechnique}
        onCreate={props.onNewTechnique}
        disabled={s.running}
        hiddenCount={props.techniques.length - props.visibleTechniques.length}
        onShowHidden={props.onShowHiddenTechniques}
        hideBlock={props.hideBlock}
        onHide={props.onHideTechnique}
        onEdit={props.onEditTechnique}
      />
      {rhythm && (
        <div className="rhythm-block">
          <p className="rhythm-summary">
            {rhythm}
          </p>
          {guide && (
            <p className="rhythm-best" title={guide.blurb}>
              {t("timer.bestFor", { value: guide.bestFor })}
              <button
                type="button"
                className="linkish"
                data-open-panel="techniques"
                aria-haspopup="dialog"
                onClick={() => props.onOpenTechniques(selected?.id)}
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
            <h2 className="phase-label is-enter" key={s.phase}>
              {phaseText}
            </h2>
            <p className="clock" aria-hidden={showClock ? undefined : true}>
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

        {s.awaySecs > 0 && (
          <div className="hybrid-banner away-banner" role="status">
            <span>{t("timer.awayPaused", { time: formatMinutes(s.awaySecs, t) })}</span>
            {offersToCountAway(s) && (
              <div className="row">
                <button type="button" className="btn btn-ghost" onClick={props.onCountAway}>
                  {t("timer.countAway")}
                </button>
                <button type="button" className="btn btn-primary" onClick={props.onDismissAway}>
                  {t("timer.dontCountAway")}
                </button>
              </div>
            )}
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
                {s.awaitingStart ? t(startPhaseKey(s.phase)) : t("timer.resume")}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={props.onPause}>
                {t("timer.pause")}
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={props.onSkip}>
              {t("timer.skip")}
            </button>
            {!s.awaitingStart && (
              <button type="button" className="btn btn-ghost" onClick={props.onReset}>
                {t("timer.reset")}
              </button>
            )}
            <button type="button" className="btn btn-danger" onClick={props.onStop}>
              {t("timer.stop")}
            </button>
          </>
        )}
      </div>

      <label className="auto-continue">
        <button
          type="button"
          className="toggle toggle--small"
          role="switch"
          aria-checked={props.autoContinue}
          aria-labelledby={`${autoContinueId}-label`}
          aria-describedby={`${autoContinueId}-hint`}
          onClick={() => props.onAutoContinue(!props.autoContinue)}
        />
        <span id={`${autoContinueId}-label`}>{t("timer.autoContinue")}</span>
        <span id={`${autoContinueId}-hint`} role="tooltip" className="hint-tooltip">
          {t("timer.autoContinueHint")}
        </span>
      </label>

      {props.stats && (
        <aside className="stats-strip" aria-label={t("timer.todayGlance")}>
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
        </aside>
      )}
      </main>
    </>
  );
}

function GuideIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 10.5v6" strokeLinecap="round" />
      <circle cx="12" cy="7.25" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function AboutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.75 9.6a2.35 2.35 0 1 1 3.4 2.1c-.7.42-1.15.9-1.15 1.8" strokeLinecap="round" />
      <circle cx="12" cy="16.7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false">
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 13a7.8 7.8 0 0 0 .1-2l2-1.5-2-3.5-2.4.5a7.6 7.6 0 0 0-1.7-1L15 3h-6l-.4 2.5a7.6 7.6 0 0 0-1.7 1L4.5 6 2.5 9.5 4.5 11a7.8 7.8 0 0 0 0 2l-2 1.5 2 3.5 2.4-.5a7.6 7.6 0 0 0 1.7 1L9 21h6l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4.5 2-3.5-2-1.5Z" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false">
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" strokeLinecap="round" />
    </svg>
  );
}

function BugIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false">
      <path
        d="M8 9.5C8 7 9.8 5 12 5s4 2 4 4.5v5c0 2.5-1.8 4.5-4 4.5s-4-2-4-4.5v-5Z"
        strokeLinecap="round"
      />
      <path d="M12 5V3M8.5 8H5M18.5 8H15M8.5 12H4M20 12h-4.5M9 16.5 6.5 19M15 16.5 17.5 19" strokeLinecap="round" />
      <path d="M10 10.5h4M10 13.5h4" strokeLinecap="round" />
    </svg>
  );
}
