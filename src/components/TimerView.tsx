import { formatClock, formatTechniqueRhythm, phaseLabel } from "../lib/api";
import { guideForTechnique } from "../lib/techniqueGuide";
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
}

export function TimerView(props: Props) {
  const { snapshot: s } = props;
  const displaySecs =
    s.isFlow && s.phase === "focus" ? s.elapsedSecs : s.running ? s.remainingSecs : 0;
  const showClock = s.running || s.phase !== "idle";
  const selected =
    props.techniques.find((t) => t.id === props.selectedId) ??
    props.techniques.find((t) => t.id === s.techniqueId) ??
    null;
  const rhythm = selected ? formatTechniqueRhythm(selected) : null;
  const guide = selected ? guideForTechnique(selected) : null;

  return (
    <>
      <BrandHeader
        line="Timing that crisps."
        actions={
          <>
            <button
              type="button"
              className="icon-btn"
              aria-label="Techniques guide"
              onClick={props.onOpenGuide}
              title="What each technique is good for"
            >
              <GuideIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Today’s stats"
              onClick={props.onOpenStats}
              title="Stats"
            >
              <StatsIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Settings"
              onClick={props.onOpenSettings}
              title="Settings"
            >
              <GearIcon />
            </button>
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
              Best for: {guide.bestFor}
              <button
                type="button"
                className="linkish"
                onClick={props.onOpenGuide}
              >
                Learn more
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
              {s.paused && s.running ? "Paused" : phaseLabel(s.phase)}
            </p>
            <p className="clock" aria-live="polite">
              {showClock ? formatClock(displaySecs) : "––:––"}
            </p>
            {(s.techniqueName || selected) && (
              <p className="technique-name">
                {s.techniqueName ?? selected?.name}
                {s.cycle > 0 ? ` · cycle ${s.cycle}` : ""}
                {s.hybridSwitched ? " · flowing" : ""}
              </p>
            )}
          </div>
        </div>

        {props.hybridBell && (
          <div className="hybrid-banner" role="status">
            <span>Focus bell — take a break, or keep flowing.</span>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={props.onContinueFlow}>
                Keep flowing
              </button>
              <button type="button" className="btn btn-ghost" onClick={props.onResume}>
                Take a break
              </button>
            </div>
          </div>
        )}

        <div className="working-on">
          <input
            type="text"
            placeholder="Working on…"
            value={props.workingOn}
            onChange={(e) => props.onWorkingOn(e.target.value)}
            aria-label="What you’re working on"
          />
        </div>
      </div>

      <div className="controls">
        {!s.running ? (
          <button type="button" className="btn btn-primary" onClick={props.onStart}>
            Start
          </button>
        ) : (
          <>
            {s.paused ? (
              <button type="button" className="btn btn-primary" onClick={props.onResume}>
                Resume
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={props.onPause}>
                Pause
              </button>
            )}
            <button type="button" className="btn btn-ghost" onClick={props.onSkip}>
              Skip
            </button>
            <button type="button" className="btn btn-ghost" onClick={props.onReset}>
              Reset
            </button>
            <button type="button" className="btn btn-danger" onClick={props.onStop}>
              Stop
            </button>
          </>
        )}
      </div>

      {props.stats && (
        <div className="stats-strip" aria-label="Today at a glance">
          <div>
            <strong>{Math.round(props.stats.focusSecsToday / 60)}m</strong>
            focused today
          </div>
          <div>
            <strong>{props.stats.completedCyclesToday}</strong>
            cycles
          </div>
          <div>
            <strong>{props.stats.streakDays}</strong>
            day streak
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
