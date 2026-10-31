use crate::db::Database;
use crate::engine::EngineHandle;
use crate::export::ExportFormat;
use crate::models::{
    validate_id, AppInfo, AppSettings, DayStats, PeriodStats, StatsRange, Technique, TechniqueInput, TimerSnapshot,
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
    engine.resume_or_take_break(&app)
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
pub fn timer_count_away(app: AppHandle, engine: State<'_, EngineHandle>) -> Result<TimerSnapshot, String> {
    engine.count_away(&app)
}

#[tauri::command]
pub fn timer_dismiss_away(app: AppHandle, engine: State<'_, EngineHandle>) -> Result<TimerSnapshot, String> {
    engine.dismiss_away(&app)
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
    app: AppHandle,
    state: State<'_, AppState>,
    input: TechniqueInput,
) -> Result<Technique, String> {
    let input = input.validated()?;
    let tech = state
        .db
        .lock()
        .create_technique(input)
        .map_err(|e| e.to_string())?;
    let _ = app.emit("techniques-updated", ());
    Ok(tech)
}

#[tauri::command]
pub fn update_technique(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    input: TechniqueInput,
) -> Result<Technique, String> {
    validate_id(&id)?;
    let input = input.validated()?;
    let tech = state
        .db
        .lock()
        .update_technique(&id, input)
        .map_err(|e| e.to_string())?;
    let _ = app.emit("techniques-updated", ());
    Ok(tech)
}

#[tauri::command]
pub fn delete_technique(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    validate_id(&id)?;
    state
        .db
        .lock()
        .delete_technique(&id)
        .map_err(|e| e.to_string())?;
    let _ = app.emit("techniques-updated", ());
    Ok(())
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<AppSettings, String> {
    state.db.lock().get_settings().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_system_locale() -> String {
    crate::i18n::resolve_locale("")
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
    engine.update_tray(&app);
    #[cfg(desktop)]
    crate::hotkeys::apply(&app, &settings.global_hotkeys);
    let _ = app.emit("settings-updated", &settings);
    Ok(settings)
}

/// Whether global shortcuts work in this session, and which ones another app owns.
#[tauri::command]
pub fn get_hotkey_report(hotkeys: State<'_, crate::hotkeys::HotkeyState>) -> crate::hotkeys::HotkeyReport {
    hotkeys.report()
}

/// Wayland: ask the desktop for the shortcuts, or open its dialog to change them.
/// False when that didn't happen (the user cancelled, say); the report says so.
#[cfg(target_os = "linux")]
#[tauri::command]
pub async fn setup_portal_hotkeys(app: AppHandle) -> bool {
    crate::portal::setup(&app).await.is_ok()
}

/// Only Linux has a shortcuts portal; elsewhere Tempura records keys itself.
#[cfg(not(target_os = "linux"))]
#[tauri::command]
pub async fn setup_portal_hotkeys() -> bool {
    false
}

#[tauri::command]
pub fn get_stats(state: State<'_, AppState>) -> Result<DayStats, String> {
    state.db.lock().day_stats().map_err(|e| e.to_string())
}

/// Stats for local days `from..=to` (`YYYY-MM-DD`), compared with
/// `compare_from..=compare_to` when both are given, else the same number of days before.
#[tauri::command]
pub fn get_period_stats(
    state: State<'_, AppState>,
    from: String,
    to: String,
    compare_from: Option<String>,
    compare_to: Option<String>,
) -> Result<PeriodStats, String> {
    let day = |s: &str| chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| format!("not a date: {s:?}"));
    let compare = match (compare_from, compare_to) {
        (Some(a), Some(b)) => Some((day(&a)?, day(&b)?)),
        (None, None) => None,
        _ => return Err("compare_from and compare_to go together".into()),
    };
    state
        .db
        .lock()
        .period_stats(day(&from)?, day(&to)?, compare)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_stats_range(state: State<'_, AppState>, days: i64) -> Result<StatsRange, String> {
    state.db.lock().range_stats(days).map_err(|e| e.to_string())
}

/// Save every session as CSV or JSON where the user picks. `None` when they cancel.
#[tauri::command]
pub async fn export_sessions(
    window: tauri::WebviewWindow,
    state: State<'_, AppState>,
    format: ExportFormat,
    title: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let rows = state.db.lock().export_rows().map_err(|e| e.to_string())?;
    let contents = crate::export::render(format, &rows, &chrono::Local);
    let ext = format.extension();
    let file_name = format!("tempura-sessions-{}.{ext}", chrono::Local::now().format("%Y-%m-%d"));
    // Async commands run off the main thread, where the blocking dialog is allowed.
    let Some(path) = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title(title)
        .set_file_name(&file_name)
        .add_filter(ext.to_uppercase(), &[ext])
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let mut path = path.into_path().map_err(|e| e.to_string())?;
    // GTK doesn't add the filter's extension back if the user erased it.
    if path.extension().is_none() {
        path.set_extension(ext);
    }
    std::fs::write(&path, contents).map_err(|e| e.to_string())?;
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned());
    Ok(Some(name.unwrap_or(file_name)))
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        name: "Tempura".into(),
        version: env!("CARGO_PKG_VERSION").into(),
        privacy: String::new(),
        debug: cfg!(debug_assertions),
        notification_backend: crate::notify::backend_label().into(),
    }
}

/// Fires a sample OS notification through the same path as phase alerts.
/// Release builds omit this command — UI hiding is not IPC lockdown.
#[cfg(debug_assertions)]
#[tauri::command]
pub fn debug_test_notification(
    app: AppHandle,
    engine: State<'_, EngineHandle>,
) -> Result<(), String> {
    let settings = engine.settings();
    crate::notify::show_result(
        &app,
        "Tempura",
        "Test notification · Focus complete",
        !settings.sound_enabled,
    )
}

/// Open the Feedback discussion in the host browser (Linux: AppImage-safe env).
#[tauri::command]
pub fn open_feedback_url() -> Result<(), String> {
    crate::open_url::open_feedback_url()
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
