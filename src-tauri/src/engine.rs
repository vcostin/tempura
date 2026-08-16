use crate::db::Database;
use crate::models::{AppSettings, Phase, Technique, TimerSnapshot};
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant, SystemTime};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone)]
pub struct EngineHandle {
    inner: Arc<Mutex<Engine>>,
    stop_flag: Arc<AtomicBool>,
}

struct Engine {
    snapshot: TimerSnapshot,
    technique: Option<Technique>,
    settings: AppSettings,
    session_id: Option<String>,
    focus_secs_completed: i64,
    phase_deadline: Option<Instant>,
    phase_started: Option<Instant>,
    paused_remaining: Option<Duration>,
    last_wall: SystemTime,
    halfway_sent: bool,
    flow_break_secs: i64,
    allow_quit: bool,
}

impl Default for Engine {
    fn default() -> Self {
        Self {
            snapshot: TimerSnapshot::default(),
            technique: None,
            settings: AppSettings::default(),
            session_id: None,
            focus_secs_completed: 0,
            phase_deadline: None,
            phase_started: None,
            paused_remaining: None,
            last_wall: SystemTime::now(),
            halfway_sent: false,
            flow_break_secs: 0,
            allow_quit: false,
        }
    }
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseEvent {
    pub phase: Phase,
    pub previous: Phase,
    pub snapshot: TimerSnapshot,
    pub reason: String,
}

impl EngineHandle {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Engine::default())),
            stop_flag: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn allow_quit(&self) -> bool {
        self.inner.lock().allow_quit
    }

    pub fn set_allow_quit(&self, allow: bool) {
        self.inner.lock().allow_quit = allow;
    }

    pub fn snapshot(&self) -> TimerSnapshot {
        self.inner.lock().snapshot.clone()
    }

    pub fn settings(&self) -> AppSettings {
        self.inner.lock().settings.clone()
    }

    pub fn load_settings(&self, settings: AppSettings) {
        let mut eng = self.inner.lock();
        eng.settings = settings.clone();
        eng.snapshot.working_on = settings.working_on;
    }

    pub fn start_ticker(self, app: AppHandle) {
        let stop = self.stop_flag.clone();
        thread::Builder::new()
            .name("tempura-timer".into())
            .spawn(move || {
                while !stop.load(Ordering::SeqCst) {
                    self.tick(&app);
                    thread::sleep(Duration::from_millis(250));
                }
            })
            .expect("spawn timer thread");
    }

    fn with_db<T>(app: &AppHandle, f: impl FnOnce(&Database) -> Result<T, crate::db::DbError>) -> Result<T, String> {
        let state = app.state::<crate::AppState>();
        let db = state.db.lock();
        f(&db).map_err(|e| e.to_string())
    }

    pub fn start(&self, app: &AppHandle, technique_id: Option<String>) -> Result<TimerSnapshot, String> {
        let settings = Self::with_db(app, |db| db.get_settings())?;
        let tech_id = technique_id.unwrap_or_else(|| settings.default_technique_id.clone());
        let technique = Self::with_db(app, |db| {
            db.get_technique(&tech_id)?
                .ok_or_else(|| crate::db::DbError::Message("technique not found".into()))
        })?;
        let session_id = Self::with_db(app, |db| db.start_session(&technique.id))?;

        let mut eng = self.inner.lock();
        eng.settings = settings;
        eng.technique = Some(technique.clone());
        eng.session_id = Some(session_id);
        eng.focus_secs_completed = 0;
        eng.snapshot = TimerSnapshot {
            phase: Phase::Idle,
            remaining_secs: 0,
            elapsed_secs: 0,
            duration_secs: 0,
            paused: false,
            running: true,
            cycle: 0,
            technique_id: Some(technique.id.clone()),
            technique_name: Some(technique.name.clone()),
            mode: technique.mode.clone(),
            is_flow: technique.mode == "flowtime",
            hybrid_switched: false,
            working_on: eng.settings.working_on.clone(),
        };
        eng.halfway_sent = false;
        eng.flow_break_secs = 0;
        eng.paused_remaining = None;

        let previous = Phase::Idle;
        Self::enter_focus(&mut eng);
        let snap = eng.snapshot.clone();
        drop(eng);

        self.emit_phase(app, previous, Phase::Focus, "start");
        self.emit_tick(app);
        self.update_tray(app);
        Ok(snap)
    }

    pub fn pause(&self, app: &AppHandle) -> Result<TimerSnapshot, String> {
        let mut eng = self.inner.lock();
        if !eng.snapshot.running || eng.snapshot.paused || eng.snapshot.phase == Phase::Idle {
            return Ok(eng.snapshot.clone());
        }
        let remaining = eng
            .phase_deadline
            .map(|d| d.saturating_duration_since(Instant::now()))
            .unwrap_or_default();
        if eng.snapshot.is_flow && eng.snapshot.phase == Phase::Focus {
            // Flowtime: freeze elapsed
            let elapsed = eng
                .phase_started
                .map(|s| s.elapsed())
                .unwrap_or_default();
            eng.paused_remaining = Some(elapsed);
        } else {
            eng.paused_remaining = Some(remaining);
        }
        eng.phase_deadline = None;
        eng.snapshot.paused = true;
        let snap = eng.snapshot.clone();
        drop(eng);
        self.emit_tick(app);
        self.update_tray(app);
        Ok(snap)
    }

    pub fn resume(&self, app: &AppHandle) -> Result<TimerSnapshot, String> {
        let mut eng = self.inner.lock();
        if !eng.snapshot.running || !eng.snapshot.paused {
            return Ok(eng.snapshot.clone());
        }
        let paused = eng.paused_remaining.take().unwrap_or_default();
        eng.snapshot.paused = false;
        eng.last_wall = SystemTime::now();

        if eng.snapshot.is_flow && eng.snapshot.phase == Phase::Focus {
            eng.phase_started = Some(Instant::now() - paused);
            eng.phase_deadline = None;
        } else {
            eng.phase_started = Some(Instant::now());
            eng.phase_deadline = Some(Instant::now() + paused);
        }
        let snap = eng.snapshot.clone();
        drop(eng);
        self.emit_tick(app);
        self.update_tray(app);
        Ok(snap)
    }

    pub fn skip(&self, app: &AppHandle) -> Result<TimerSnapshot, String> {
        let previous;
        {
            let mut eng = self.inner.lock();
            if !eng.snapshot.running {
                return Ok(eng.snapshot.clone());
            }
            previous = eng.snapshot.phase;
            Self::complete_phase(&mut eng, true);
        }
        let phase = self.inner.lock().snapshot.phase;
        self.emit_phase(app, previous, phase, "skip");
        self.persist_progress(app);
        self.emit_tick(app);
        self.update_tray(app);
        Ok(self.snapshot())
    }

    pub fn reset(&self, app: &AppHandle) -> Result<TimerSnapshot, String> {
        let previous;
        {
            let mut eng = self.inner.lock();
            previous = eng.snapshot.phase;
            if !eng.snapshot.running {
                return Ok(eng.snapshot.clone());
            }
            // Restart current phase
            match eng.snapshot.phase {
                Phase::Focus => Self::enter_focus(&mut eng),
                Phase::ShortBreak => {
                    let secs = eng.technique.as_ref().map(|t| t.short_break_secs).unwrap_or(300);
                    Self::enter_timed_phase(&mut eng, Phase::ShortBreak, secs);
                }
                Phase::LongBreak => {
                    let secs = eng.technique.as_ref().map(|t| t.long_break_secs).unwrap_or(900);
                    Self::enter_timed_phase(&mut eng, Phase::LongBreak, secs);
                }
                Phase::Idle => {}
            }
        }
        let phase = self.inner.lock().snapshot.phase;
        self.emit_phase(app, previous, phase, "reset");
        self.emit_tick(app);
        self.update_tray(app);
        Ok(self.snapshot())
    }

    pub fn stop(&self, app: &AppHandle) -> Result<TimerSnapshot, String> {
        let previous;
        let session_id;
        let focus_secs;
        let cycles;
        {
            let mut eng = self.inner.lock();
            previous = eng.snapshot.phase;
            session_id = eng.session_id.clone();
            focus_secs = eng.focus_secs_completed;
            cycles = eng.snapshot.cycle;
            eng.snapshot.running = false;
            eng.snapshot.paused = false;
            eng.snapshot.phase = Phase::Idle;
            eng.snapshot.remaining_secs = 0;
            eng.snapshot.elapsed_secs = 0;
            eng.snapshot.duration_secs = 0;
            eng.snapshot.is_flow = false;
            eng.snapshot.hybrid_switched = false;
            eng.phase_deadline = None;
            eng.phase_started = None;
            eng.paused_remaining = None;
            eng.session_id = None;
            eng.technique = None;
        }
        if let Some(id) = session_id {
            let _ = Self::with_db(app, |db| db.end_session(&id, focus_secs, cycles, true));
        }
        self.emit_phase(app, previous, Phase::Idle, "stop");
        self.emit_tick(app);
        self.update_tray(app);
        let _ = app.emit("stats-updated", ());
        Ok(self.snapshot())
    }

    /// Hybrid: continue past focus bell → switch to flowtime count-up
    pub fn continue_as_flow(&self, app: &AppHandle) -> Result<TimerSnapshot, String> {
        let mut eng = self.inner.lock();
        if eng.snapshot.mode != "hybrid" || eng.snapshot.phase != Phase::Focus {
            return Err("continue-as-flow only applies during hybrid focus".into());
        }
        if eng.snapshot.hybrid_switched && eng.snapshot.is_flow {
            return Ok(eng.snapshot.clone());
        }
        eng.snapshot.hybrid_switched = true;
        eng.snapshot.is_flow = true;
        let tech_focus = eng.technique.as_ref().map(|t| t.focus_secs).unwrap_or(25 * 60);
        let already = if eng.snapshot.remaining_secs == 0 {
            tech_focus.max(eng.snapshot.elapsed_secs)
        } else {
            (tech_focus - eng.snapshot.remaining_secs).max(0)
        };
        eng.phase_started = Some(Instant::now() - Duration::from_secs(already as u64));
        eng.phase_deadline = None;
        eng.paused_remaining = None;
        eng.snapshot.paused = false;
        eng.snapshot.duration_secs = 0;
        eng.snapshot.remaining_secs = 0;
        eng.snapshot.elapsed_secs = already;
        eng.halfway_sent = true;
        eng.last_wall = SystemTime::now();
        let snap = eng.snapshot.clone();
        drop(eng);
        self.emit_tick(app);
        self.update_tray(app);
        Ok(snap)
    }

    fn tick(&self, app: &AppHandle) {
        let mut notifications: Vec<(String, String)> = Vec::new();
        let mut phase_change: Option<(Phase, Phase)> = None;
        let mut emit_halfway = false;

        {
            let mut eng = self.inner.lock();
            if !eng.snapshot.running || eng.snapshot.paused {
                return;
            }

            // Detect OS sleep / clock skew via wall clock
            let now_wall = SystemTime::now();
            if let Ok(delta) = now_wall.duration_since(eng.last_wall) {
                if delta > Duration::from_secs(3) {
                    // Slept: advance deadline relative to Instant is automatic;
                    // Instant does not advance during sleep on most platforms.
                    // Compensate countdown by subtracting wall delta from remaining.
                    if let Some(deadline) = eng.phase_deadline {
                        let slept = delta - Duration::from_millis(250);
                        eng.phase_deadline = Some(deadline.checked_sub(slept).unwrap_or(Instant::now()));
                    }
                    if eng.snapshot.is_flow && eng.snapshot.phase == Phase::Focus {
                        if let Some(started) = eng.phase_started {
                            // For count-up, add wall sleep time to elapsed base
                            eng.phase_started = Some(started - (delta - Duration::from_millis(250)));
                        }
                    }
                }
            }
            eng.last_wall = now_wall;

            if eng.snapshot.is_flow && eng.snapshot.phase == Phase::Focus {
                let elapsed = eng
                    .phase_started
                    .map(|s| s.elapsed().as_secs() as i64)
                    .unwrap_or(0);
                eng.snapshot.elapsed_secs = elapsed;
                eng.snapshot.remaining_secs = 0;
                eng.snapshot.duration_secs = 0;
            } else if let Some(deadline) = eng.phase_deadline {
                let remaining = deadline.saturating_duration_since(Instant::now());
                let rem_secs = remaining.as_secs() as i64;
                eng.snapshot.remaining_secs = rem_secs;
                if eng.snapshot.duration_secs > 0 {
                    eng.snapshot.elapsed_secs = eng.snapshot.duration_secs - rem_secs;
                }

                // Halfway tick
                if eng.settings.halfway_tick
                    && !eng.halfway_sent
                    && eng.snapshot.duration_secs > 0
                    && rem_secs <= eng.snapshot.duration_secs / 2
                {
                    eng.halfway_sent = true;
                    emit_halfway = true;
                }

                if rem_secs <= 0 {
                    let previous = eng.snapshot.phase;

                    // Hybrid: at focus bell, emit event and wait briefly — auto-advance to break
                    // unless UI calls continue_as_flow. Default: complete to break.
                    if previous == Phase::Focus
                        && eng.snapshot.mode == "hybrid"
                        && !eng.snapshot.hybrid_switched
                    {
                        // Auto-complete to break (classic path). UI can call continue_as_flow
                        // before this if user keeps working — but timer already hit zero.
                        // Spec: "continuing past the focus bell switches to Flowtime"
                        // So at bell we notify; if user doesn't skip/stop and instead continues,
                        // they press a "Keep flowing" action. Until then, we pause at 0.
                        eng.snapshot.remaining_secs = 0;
                        eng.phase_deadline = None;
                        eng.snapshot.paused = true;
                        notifications.push((
                            "Focus complete".into(),
                            "Take a break, or keep flowing past the bell.".into(),
                        ));
                        drop(eng);
                        self.notify(app, &notifications);
                        self.emit_tick(app);
                        let _ = app.emit("hybrid-bell", ());
                        self.update_tray(app);
                        return;
                    }

                    Self::complete_phase(&mut eng, false);
                    let next = eng.snapshot.phase;
                    phase_change = Some((previous, next));

                    let title = match previous {
                        Phase::Focus => "Focus complete",
                        Phase::ShortBreak => "Break complete",
                        Phase::LongBreak => "Long break complete",
                        Phase::Idle => "Tempura",
                    };
                    let body = match next {
                        Phase::Focus => "Time to focus.".to_string(),
                        Phase::ShortBreak => "Enjoy a short break.".to_string(),
                        Phase::LongBreak => "You've earned a longer break.".to_string(),
                        Phase::Idle => "Session finished.".to_string(),
                    };
                    notifications.push((title.into(), body));
                }
            }
        }

        if emit_halfway {
            self.notify(
                app,
                &[("Halfway there".into(), "You're at the midpoint.".into())],
            );
        }

        if let Some((prev, next)) = phase_change {
            self.emit_phase(app, prev, next, "complete");
            self.persist_progress(app);
            self.notify(app, &notifications);
            let _ = app.emit("stats-updated", ());
        }

        self.emit_tick(app);
        // Update tray tooltip ~1/sec
        static LAST_TRAY: AtomicU64 = AtomicU64::new(0);
        let now_secs = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let prev = LAST_TRAY.swap(now_secs, Ordering::Relaxed);
        if now_secs != prev {
            self.update_tray(app);
        }
    }

    fn enter_focus(eng: &mut Engine) {
        let tech = eng.technique.clone();
        let Some(tech) = tech else { return };

        eng.halfway_sent = false;
        eng.last_wall = SystemTime::now();

        if tech.mode == "flowtime" || eng.snapshot.hybrid_switched {
            eng.snapshot.phase = Phase::Focus;
            eng.snapshot.is_flow = true;
            eng.snapshot.duration_secs = 0;
            eng.snapshot.remaining_secs = 0;
            eng.snapshot.elapsed_secs = 0;
            eng.phase_started = Some(Instant::now());
            eng.phase_deadline = None;
            eng.snapshot.paused = false;
            return;
        }

        let secs = tech.focus_secs;
        Self::enter_timed_phase(eng, Phase::Focus, secs);
    }

    fn enter_timed_phase(eng: &mut Engine, phase: Phase, secs: i64) {
        eng.snapshot.phase = phase;
        eng.snapshot.is_flow = false;
        eng.snapshot.duration_secs = secs;
        eng.snapshot.remaining_secs = secs;
        eng.snapshot.elapsed_secs = 0;
        eng.snapshot.paused = false;
        eng.halfway_sent = false;
        eng.phase_started = Some(Instant::now());
        eng.phase_deadline = Some(Instant::now() + Duration::from_secs(secs.max(0) as u64));
        eng.last_wall = SystemTime::now();
    }

    fn complete_phase(eng: &mut Engine, skipped: bool) {
        let phase = eng.snapshot.phase;
        let tech = eng.technique.clone();
        let Some(tech) = tech else {
            eng.snapshot.phase = Phase::Idle;
            eng.snapshot.running = false;
            return;
        };

        match phase {
            Phase::Focus => {
                let focus_done = if eng.snapshot.is_flow {
                    eng.snapshot.elapsed_secs
                } else if skipped {
                    eng.snapshot.elapsed_secs
                } else {
                    tech.focus_secs.max(eng.snapshot.elapsed_secs)
                };
                eng.focus_secs_completed += focus_done.max(0);
                eng.snapshot.cycle += 1;

                let ratio = tech
                    .flow_ratio
                    .unwrap_or(eng.settings.flow_ratio)
                    .clamp(1.0 / 9.0, 1.0 / 3.0);

                if eng.snapshot.is_flow || tech.mode == "flowtime" || eng.snapshot.hybrid_switched {
                    let break_secs = ((focus_done as f64) * ratio).round() as i64;
                    eng.flow_break_secs = break_secs.max(60);
                    eng.snapshot.hybrid_switched = false;
                    eng.snapshot.is_flow = false;
                    Self::enter_timed_phase(eng, Phase::ShortBreak, eng.flow_break_secs);
                    return;
                }

                let every_n = if eng.settings.long_break_every_n > 0 {
                    eng.settings.long_break_every_n
                } else {
                    tech.cycles_before_long
                };
                if every_n > 0 && eng.snapshot.cycle % every_n == 0 {
                    Self::enter_timed_phase(eng, Phase::LongBreak, tech.long_break_secs);
                } else {
                    Self::enter_timed_phase(eng, Phase::ShortBreak, tech.short_break_secs);
                }
            }
            Phase::ShortBreak | Phase::LongBreak => {
                // Next focus
                if tech.mode == "flowtime" {
                    eng.snapshot.is_flow = true;
                    eng.snapshot.hybrid_switched = false;
                }
                Self::enter_focus(eng);
            }
            Phase::Idle => {}
        }
    }

    fn persist_progress(&self, app: &AppHandle) {
        let (session_id, focus, cycles) = {
            let eng = self.inner.lock();
            (
                eng.session_id.clone(),
                eng.focus_secs_completed,
                eng.snapshot.cycle,
            )
        };
        if let Some(id) = session_id {
            let _ = Self::with_db(app, |db| db.bump_session_progress(&id, focus, cycles));
        }
    }

    fn emit_tick(&self, app: &AppHandle) {
        let snap = self.snapshot();
        let _ = app.emit("timer-tick", snap);
    }

    fn emit_phase(&self, app: &AppHandle, previous: Phase, phase: Phase, reason: &str) {
        let snapshot = self.snapshot();
        let _ = app.emit(
            "timer-phase",
            PhaseEvent {
                phase,
                previous,
                snapshot,
                reason: reason.into(),
            },
        );
    }

    fn notify(&self, app: &AppHandle, items: &[(String, String)]) {
        let settings = self.inner.lock().settings.clone();
        if !settings.notifications_enabled {
            return;
        }
        let silent = !settings.sound_enabled;
        for (title, body) in items {
            crate::notify::show(app, title, body, silent);
        }
    }

    pub fn update_tray(&self, app: &AppHandle) {
        crate::tray::update_tray_ui(app, &self.snapshot());
    }

    pub fn format_tooltip(snap: &TimerSnapshot) -> String {
        if !snap.running {
            return "Tempura · Ready".into();
        }
        let phase = snap.phase.label();
        if snap.paused {
            return format!("Tempura · {phase} · Paused");
        }
        if snap.is_flow && snap.phase == Phase::Focus {
            let m = snap.elapsed_secs / 60;
            let s = snap.elapsed_secs % 60;
            return format!("Tempura · {phase} · {m:02}:{s:02}");
        }
        let m = snap.remaining_secs / 60;
        let s = snap.remaining_secs % 60;
        format!("Tempura · {phase} · {m:02}:{s:02}")
    }
}
