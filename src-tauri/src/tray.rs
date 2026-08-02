use crate::engine::EngineHandle;
use crate::models::{Phase, TimerSnapshot};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let toggle = MenuItem::with_id(app, "toggle", "Start", true, None::<&str>)?;
    let skip = MenuItem::with_id(app, "skip", "Skip phase", true, None::<&str>)?;
    let status = MenuItem::with_id(app, "status", "Ready", false, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "Open Settings", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&show, &hide, &sep1, &status, &toggle, &skip, &sep2, &settings, &sep3, &quit],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("default window icon");

    let _tray = TrayIconBuilder::with_id("main")
        .icon(icon)
        .menu(&menu)
        .tooltip("Tempura · Ready")
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            handle_menu(app, event.id.as_ref());
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(win) = app.get_webview_window("main") {
                    let _ = win.show();
                    let _ = win.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "show" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
        }
        "hide" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.hide();
            }
        }
        "toggle" => {
            let engine = app.state::<EngineHandle>();
            let snap = engine.snapshot();
            if !snap.running {
                let _ = engine.start(app, None);
            } else if snap.paused {
                let _ = engine.resume(app);
            } else {
                let _ = engine.pause(app);
            }
        }
        "skip" => {
            let engine = app.state::<EngineHandle>();
            let _ = engine.skip(app);
        }
        "settings" => {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.set_focus();
            }
            let _ = app.emit("open-settings", ());
        }
        "quit" => {
            let engine = app.state::<EngineHandle>();
            engine.set_allow_quit(true);
            let _ = engine.stop(app);
            app.exit(0);
        }
        _ => {}
    }
}

pub fn update_tray_ui(app: &AppHandle, snap: &TimerSnapshot) {
    let tooltip = EngineHandle::format_tooltip(snap);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(&tooltip));
    }

    // Rebuild menu labels via recreating items is heavy; update what we can.
    // Tauri 2 MenuItem doesn't expose easy get-by-id mutation from outside,
    // so rebuild a lightweight menu.
    let _ = rebuild_menu(app, snap);
}

fn rebuild_menu(app: &AppHandle, snap: &TimerSnapshot) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let toggle_label = if !snap.running {
        "Start"
    } else if snap.paused {
        "Resume"
    } else {
        "Pause"
    };
    let toggle = MenuItem::with_id(app, "toggle", toggle_label, true, None::<&str>)?;
    let skip = MenuItem::with_id(
        app,
        "skip",
        "Skip phase",
        snap.running && snap.phase != Phase::Idle,
        None::<&str>,
    )?;

    let status_text = {
        let phase = snap.phase.label();
        if !snap.running {
            "Status · Ready".to_string()
        } else if snap.is_flow && snap.phase == Phase::Focus {
            let m = snap.elapsed_secs / 60;
            let s = snap.elapsed_secs % 60;
            format!("Status · {phase} · {m:02}:{s:02}")
        } else {
            let m = snap.remaining_secs / 60;
            let s = snap.remaining_secs % 60;
            format!("Status · {phase} · {m:02}:{s:02}")
        }
    };
    let status = MenuItem::with_id(app, "status", status_text, false, None::<&str>)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(app, "settings", "Open Settings", true, None::<&str>)?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &show, &hide, &sep1, &status, &toggle, &skip, &sep2, &settings, &sep3, &quit,
        ],
    )?;

    if let Some(tray) = app.tray_by_id("main") {
        tray.set_menu(Some(menu))?;
    }
    Ok(())
}
