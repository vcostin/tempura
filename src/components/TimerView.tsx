import { useEffect, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import { formatClock, formatMinutes, phaseLabel } from "../lib/api";
import { techniqueDisplayName } from "../lib/techniqueGuide";
import { offersToCountAway, showsPaused, startPhaseKey } from "../lib/timerLabels";
import type { DayStats, Technique, TimerSnapshot } from "../lib/types";
import { BrandHeader } from "./BrandHeader";
import { ProgressRing } from "./ProgressRing";
import { RhythmCard } from "./RhythmCard";
import { TechniqueSheet } from "./TechniqueSheet";
import { TodayHours } from "./TodayHours";
import type { HideBlock } from "../state/techniqueVisibility";

interface Props {
  snapshot: TimerSnapshot;
  techniques: Technique[];
  /** The techniques on the picker; the rest are hidden from the timer. */
  visibleTechniques: Technique[];
  selectedId: string;
  onSelectTechnique: (id: string) => void;
  stats: DayStats | null;
  /** Focus seconds per local hour today; null until loaded. */
  todayHours: number[] | null;
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
  /** Opens the techniques library. */
  onOpenTechniques: () => void;
  onOpenAbout: () => void;
}

export function TimerView(props: Props) {
  const { t } = useTranslation();
  const { snapshot: s } = props;
  const autoContinueId = useId();
  const displaySecs =
    s.isFlow && s.phase === "focus" ? s.elapsedSecs : s.running ? s.remainingSecs : 0;
  const showClock = s.running || s.phase !== "idle";
  const clockText = showClock ? formatClock(displaySecs) : "––:––";
  const selected =
    props.techniques.find((tech) => tech.id === props.selectedId) ??
    props.techniques.find((tech) => tech.id === s.techniqueId) ??
    null;
  // While a session runs, the card follows the running technique.
  const cardTechnique =
    (s.running && props.techniques.find((tech) => tech.id === s.techniqueId)) || selected;
  const [sheetOpen, setSheetOpen] = useState(false);
  const cardRef = useRef<HTMLButtonElement>(null);

  // A session started elsewhere (tray, hotkey) closes the sheet: no switching mid-session.
  useEffect(() => {
    if (s.running) setSheetOpen(false);
  }, [s.running]);

  /** Close the sheet and put focus back on the card, so panels opened from the sheet return there. */
  function closeSheet() {
    // Synchronously, so the timer is no longer inert when the card takes focus.
    flushSync(() => setSheetOpen(false));
    cardRef.current?.focus({ preventScroll: true });
  }
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
        inert={sheetOpen}
        line={t("brand.tagline")}
        actions={
          <>
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
          </>
        }
      />

      <main id="timer-main" inert={sheetOpen || undefined}>
      {cardTechnique && (
        <RhythmCard
          ref={cardRef}
          technique={cardTechnique}
          snapshot={s}
          sheetOpen={sheetOpen}
          onOpenSheet={() => setSheetOpen(true)}
        />
      )}

      <div className="timer-stage">
        <div className="ring-wrap motion-safe">
          <ProgressRing snapshot={s} />
          <div className="ring-center">
            <h2 className="phase-label is-enter" key={s.phase}>
              {phaseText}
            </h2>
            <p className={clockText.length > 5 ? "clock clock--long" : "clock"} aria-hidden={showClock ? undefined : true}>
              {fixedDigits(clockText)}
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
        {s.running && !s.awaitingStart ? (
          <button
            type="button"
            className="round-btn controls-before"
            aria-label={t("timer.restartPhase")}
            title={t("timer.restartPhase")}
            onClick={props.onReset}
          >
            <RestartIcon />
          </button>
        ) : null}
        {!s.running ? (
          <button type="button" className="btn btn-primary btn-main" aria-keyshortcuts="Space" onClick={props.onStart}>
            {t("timer.start")}
          </button>
        ) : s.paused ? (
          <button type="button" className="btn btn-primary btn-main" aria-keyshortcuts="Space" onClick={props.onResume}>
            {s.awaitingStart ? t(startPhaseKey(s.phase)) : t("timer.resume")}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-main" aria-keyshortcuts="Space" onClick={props.onPause}>
            {t("timer.pause")}
          </button>
        )}
        {s.running ? (
          <button
            type="button"
            className="round-btn controls-after"
            aria-label={t("timer.skip")}
            title={t("timer.skip")}
            aria-keyshortcuts="S"
            onClick={props.onSkip}
          >
            <SkipIcon />
          </button>
        ) : null}
      </div>

      <div className="session-row">
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
        {s.running && (
          <button type="button" className="end-session" onClick={props.onStop}>
            {t("timer.endSession")}
          </button>
        )}
      </div>

      {props.stats && (
        <aside className="stats-strip" aria-label={t("timer.todayGlance")}>
          <div>
            <strong>{formatMinutes(props.stats.focusSecsToday, t)}</strong>
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
          {props.todayHours && <TodayHours hours={props.todayHours} />}
        </aside>
      )}
      </main>
      {sheetOpen && (
        <TechniqueSheet
          techniques={props.visibleTechniques}
          selectedId={props.selectedId}
          onSelect={(id) => {
            props.onSelectTechnique(id);
            closeSheet();
          }}
          onClose={closeSheet}
          onCreate={() => {
            closeSheet();
            props.onNewTechnique();
          }}
          onManage={() => {
            closeSheet();
            props.onOpenTechniques();
          }}
          hiddenCount={props.techniques.length - props.visibleTechniques.length}
          onShowHidden={() => {
            closeSheet();
            props.onShowHiddenTechniques();
          }}
          hideBlock={props.hideBlock}
          onHide={props.onHideTechnique}
          onEdit={(id) => {
            closeSheet();
            props.onEditTechnique(id);
          }}
        />
      )}
    </>
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

function RestartIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false">
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" strokeLinecap="round" />
      <path d="M4.5 4.5v4h4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Points along the reading direction, so it mirrors in RTL (see `.icon-flip`). */
function SkipIcon() {
  return (
    <svg className="icon-flip" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true" focusable="false">
      <path d="M6.5 6.5v11l8-5.5-8-5.5Z" strokeLinejoin="round" />
      <path d="M17.5 6.5v11" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The display font has no tabular figures, so each digit gets a cell of the same
 * width; otherwise the clock jiggles sideways as it ticks.
 */
function fixedDigits(text: string) {
  return Array.from(text, (ch, i) =>
    /[0-9–]/.test(ch) ? (
      <span key={i} className="clock-digit">
        {ch}
      </span>
    ) : (
      ch
    ),
  );
}
