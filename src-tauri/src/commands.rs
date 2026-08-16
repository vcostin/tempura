use crate::db::Database;
use crate::engine::EngineHandle;
use crate::models::{
    validate_id, AppInfo, AppSettings, DayStats, Technique, TechniqueInput, TimerSnapshot,
};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter, State};

pub struct AppState {
    pub db: Mutex<Database>,
}

#[tauri::command]
pub fn get_timer_state(engine: State<'_, EngineHandle>) -> TimerSnapshot {
    engine.snapshot()
}

#[tauri::command]
pub fn timer_start(
    app: AppHandle,
    engine: State<'_, EngineHandle>,
    technique_id: Option<String>,
) -> Result<TimerSnapshot, String> {
    if let Some(id) = technique_id.as_deref() {
        validate_id(id)?;
    }
    engine.start(&app, technique_id)
}

#[tauri::command]
pub fn timer_pause(app: AppHandle, engine: State<'_, EngineHandle>) -> Result<TimerSnapshot, String> {
    engine.pause(&app)
}

#[tauri::command]
pub fn timer_resume(
    app: AppHandle,
    engine: State<'_, EngineHandle>,
) -> Result<TimerSnapshot, String> {
    // Hybrid bell: resume means take the break
    let snap = engine.snapshot();
    if snap.running
        && snap.paused
        && snap.mode == "hybrid"
        && snap.phase == crate::models::Phase::Focus
        && snap.remaining_secs == 0
        && !snap.hybrid_switched
    {
        return engine.skip(&app);
    }
    engine.resume(&app)
}

#[tauri::command]
pub fn timer_skip(app: AppHandle, engine: State<'_, EngineHandle>) -> Result<TimerSnapshot, String> {
    engine.skip(&app)
}

#[tauri::command]
pub fn timer_reset(app: AppHandle, engine: State<'_, EngineHandle>) -> Result<TimerSnapshot, String> {
    engine.reset(&app)
}

#[tauri::command]
pub fn timer_stop(app: AppHandle, engine: State<'_, EngineHandle>) -> Result<TimerSnapshot, String> {
    engine.stop(&app)
}

#[tauri::command]
pub fn timer_continue_flow(
    app: AppHandle,
    engine: State<'_, EngineHandle>,
) -> Result<TimerSnapshot, String> {
    engine.continue_as_flow(&app)
}

#[tauri::command]
pub fn list_techniques(state: State<'_, AppState>) -> Result<Vec<Technique>, String> {
    state.db.lock().list_techniques().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_technique(state: State<'_, AppState>, id: String) -> Result<Option<Technique>, String> {
    validate_id(&id)?;
    state
        .db
        .lock()
        .get_technique(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_technique(
    state: State<'_, AppState>,
    input: TechniqueInput,
) -> Result<Technique, String> {
    let input = input.validated()?;
    state
        .db
        .lock()
        .create_technique(input)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_technique(
    state: State<'_, AppState>,
    id: String,
    input: TechniqueInput,
) -> Result<Technique, String> {
    validate_id(&id)?;
    let input = input.validated()?;
    state
        .db
        .lock()
        .update_technique(&id, input)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_technique(state: State<'_, AppState>, id: String) -> Result<(), String> {
    validate_id(&id)?;
    state
        .db
        .lock()
        .delete_technique(&id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    state.db.lock().get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_settings(
    app: AppHandle,
    state: State<'_, AppState>,
    engine: State<'_, EngineHandle>,
    settings: AppSettings,
) -> Result<AppSettings, String> {
    let settings = settings.validated()?;
    state
        .db
        .lock()
        .update_settings(&settings)
        .map_err(|e| e.to_string())?;
    engine.load_settings(settings.clone());
    let _ = app.emit("settings-updated", &settings);
    Ok(settings)
}

#[tauri::command]
pub fn get_stats(state: State<'_, AppState>) -> Result<DayStats, String> {
    state.db.lock().day_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Tempura".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        privacy: "Your data stays on this machine. No accounts, no cloud, no sync.".into(),
        debug: cfg!(debug_assertions),
    }
}

/// Fires a sample OS notification through the same path as phase alerts.
/// Available in all builds so the invoke stays registered; no-ops outside debug.
#[tauri::command]
pub fn debug_test_notification(
    app: AppHandle,
    engine: State<'_, EngineHandle>,
) -> Result<(), String> {
    if !cfg!(debug_assertions) {
        return Err("Test notifications are only available in debug builds.".into());
    }
    let settings = engine.settings();
    crate::notify::show_result(
        &app,
        "Tempura",
        "Test notification · Focus complete",
        !settings.sound_enabled,
    )
}

#[tauri::command]
pub fn hide_to_tray(app: AppHandle) {
    crate::tray::hide_main(&app);
}

#[tauri::command]
pub fn request_quit(app: AppHandle, engine: State<'_, EngineHandle>) {
    engine.set_allow_quit(true);
    let _ = engine.stop(&app);
    app.exit(0);
}
