use crate::engine::EngineHandle;
use crate::models::{Phase, TimerSnapshot};
use dark_light::Mode;
use std::sync::atomic::{AtomicU8, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{
    image::Image,
    include_image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};

/// Dark shrimp silhouette — for light system chrome.
const TRAY_ICON_FOR_LIGHT: Image<'_> = include_image!("icons/tray-32-dark.png");
/// Light shrimp silhouette — for dark system chrome.
const TRAY_ICON_FOR_DARK: Image<'_> = include_image!("icons/tray-32-light.png");

/// Window / app icon (minimalist shrimp, embedded at compile time).
pub const APP_ICON: Image<'_> = include_image!("icons/icon.png");

const MODE_LIGHT: u8 = 0;
const MODE_DARK: u8 = 1;

fn mode_tag(mode: Mode) -> u8 {
    match mode {
        Mode::Dark => MODE_DARK,
        Mode::Light | Mode::Unspecified => MODE_LIGHT,
    }
}

fn tray_image_for(mode: Mode) -> Image<'static> {
    match mode {
        Mode::Dark => TRAY_ICON_FOR_DARK.clone(),
        Mode::Light | Mode::Unspecified => TRAY_ICON_FOR_LIGHT.clone(),
    }
}

fn detect_mode() -> Mode {
    dark_light::detect().unwrap_or(Mode::Unspecified)
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

    let mode = detect_mode();
    let icon = tray_image_for(mode);

    #[allow(unused_mut)]
    let mut builder = TrayIconBuilder::with_id("main")
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
        });

    // macOS: treat silhouette as a template so the OS tints it for the menu bar.
    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true);
    }

    let _tray = builder.build(app)?;

    start_theme_watcher(app.clone());
    Ok(())
}

fn start_theme_watcher(app: AppHandle) {
    static LAST: AtomicU8 = AtomicU8::new(255);
    LAST.store(mode_tag(detect_mode()), Ordering::Relaxed);

    thread::Builder::new()
        .name("tempura-theme".into())
        .spawn(move || loop {
            thread::sleep(Duration::from_secs(2));
            let mode = detect_mode();
            let tag = mode_tag(mode);
            if LAST.swap(tag, Ordering::Relaxed) == tag {
                continue;
            }
            if let Some(tray) = app.tray_by_id("main") {
                let icon = tray_image_for(mode);
                #[cfg(target_os = "macos")]
                let _ = tray.set_icon_with_as_template(Some(icon), true);
                #[cfg(not(target_os = "macos"))]
                let _ = tray.set_icon(Some(icon));
            }
        })
        .expect("spawn theme watcher");
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
