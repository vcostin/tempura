mod commands;
mod db;
mod engine;
mod i18n;
mod models;
mod notify;
mod tray;

pub use commands::AppState;

use engine::EngineHandle;
use tauri::{Manager, RunEvent, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let engine = EngineHandle::new();

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            tray::restore_main(app);
        }));

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ));
    }

    builder
        .manage(engine.clone())
        .invoke_handler(tauri::generate_handler![
            commands::get_timer_state,
            commands::timer_start,
            commands::timer_pause,
            commands::timer_resume,
            commands::timer_skip,
            commands::timer_reset,
            commands::timer_stop,
            commands::timer_continue_flow,
            commands::list_techniques,
            commands::get_technique,
            commands::create_technique,
            commands::update_technique,
            commands::delete_technique,
            commands::get_settings,
            commands::get_system_locale,
            commands::update_settings,
            commands::get_stats,
            commands::get_app_info,
            commands::debug_test_notification,
            commands::request_quit,
            commands::hide_to_tray,
        ])
        .setup(move |app| {
            let app_data = app
                .path()
                .app_data_dir()
                .expect("app data dir");
            let db_path = app_data.join("tempura.db");
            let database = db::Database::open(&db_path).expect("open database");
            let settings = database.get_settings().unwrap_or_default();
            engine.load_settings(settings.clone());
            app.manage(AppState {
                db: parking_lot::Mutex::new(database),
            });

            #[cfg(desktop)]
            {
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.set_icon(tray::APP_ICON);
                }
                tray::setup_tray(app.handle())?;
                notify::init(app.handle());
            }

            let start_minimized = settings.start_minimized
                || std::env::args().any(|a| a == "--minimized");
            if start_minimized {
                if let Some(win) = app.get_webview_window("main") {
                    tray::hide_window(&win);
                }
            }

            engine.clone().start_ticker(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let engine = window.app_handle().state::<EngineHandle>();
                    if !engine.allow_quit() {
                        api.prevent_close();
                        tray::hide_native_window(window);
                    }
                }
                WindowEvent::Focused(true) => {
                    #[cfg(target_os = "linux")]
                    tray::heal_linux_csd_if_needed(window);
                }
                WindowEvent::Focused(false) => {
                    // JS hide() does not go through tray helpers; catch it here.
                    #[cfg(target_os = "linux")]
                    if !window.is_visible().unwrap_or(true) {
                        tray::mark_linux_csd_stale();
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app_handle, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                // Allow exit when tray Quit sets allow_quit; otherwise keep running in tray.
                // ExitRequested fires on last window close — prevent so tray keeps app alive.
                let engine = _app_handle.state::<EngineHandle>();
                if !engine.allow_quit() {
                    api.prevent_exit();
                }
            }
        });
}
