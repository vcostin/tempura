#[cfg(target_os = "linux")]
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(target_os = "linux")]
use std::time::Duration;

use crate::engine::EngineHandle;
use crate::models::{Phase, TimerSnapshot};
use tauri::{
    image::Image,
    include_image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewWindow, Window,
};

/// GTK/Wayland (KDE especially) leaves CSD buttons dead after hide→show until
/// a compositor configure. Set when we restore so the next focus can heal it.
#[cfg(target_os = "linux")]
static LINUX_CSD_NEEDS_HEAL: AtomicBool = AtomicBool::new(false);

/// Orange shrimp mark — same geometry as the app icon (works on light and dark chrome).
const TRAY_ICON: Image<'_> = include_image!("icons/tray-32.png");

/// Window / app icon (sage squircle + shrimp mark).
pub const APP_ICON: Image<'_> = include_image!("icons/icon.png");

pub fn restore_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        restore_window(&win);
    }
}

pub fn hide_main(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        hide_window(&win);
    }
}

pub fn restore_window(win: &WebviewWindow) {
    let _ = win.unminimize();
    let _ = win.show();
    let _ = win.set_focus();
    #[cfg(target_os = "linux")]
    {
        // Wayland often reports hidden windows as still visible, so always
        // poke CSD after a restore rather than trusting is_visible().
        LINUX_CSD_NEEDS_HEAL.store(true, Ordering::Relaxed);
        schedule_linux_csd_heal(win);
    }
}

pub fn hide_window(win: &WebviewWindow) {
    let _ = win.hide();
    mark_linux_csd_stale();
}

pub fn hide_native_window(window: &Window) {
    let _ = window.hide();
    mark_linux_csd_stale();
}

pub fn mark_linux_csd_stale() {
    #[cfg(target_os = "linux")]
    LINUX_CSD_NEEDS_HEAL.store(true, Ordering::Relaxed);
}

/// GTK/KDE Wayland: CSD min/max/close ignore clicks after hide→show until a
/// configure event. Toggling resizable forces one without a maximize flash.
/// https://github.com/tauri-apps/tauri/issues/11856
#[cfg(target_os = "linux")]
pub fn heal_linux_csd_if_needed(window: &Window) {
    if LINUX_CSD_NEEDS_HEAL.swap(false, Ordering::Relaxed) {
        linux_csd_heal(window);
    }
}

#[cfg(target_os = "linux")]
fn linux_csd_heal(window: &Window) {
    let resizable = window.is_resizable().unwrap_or(true);
    let _ = window.set_resizable(false);
    let _ = window.set_resizable(resizable);
}

#[cfg(target_os = "linux")]
fn schedule_linux_csd_heal(win: &WebviewWindow) {
    let win = win.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(150));
        if matches!(win.is_visible(), Ok(false)) {
            return;
        }
        let resizable = win.is_resizable().unwrap_or(true);
        let _ = win.set_resizable(false);
        let _ = win.set_resizable(resizable);
        LINUX_CSD_NEEDS_HEAL.store(false, Ordering::Relaxed);
    });
}

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

    let _tray = TrayIconBuilder::with_id("main")
        .icon(TRAY_ICON)
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
                restore_main(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        "show" => restore_main(app),
        "hide" => hide_main(app),
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
            restore_main(app);
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
