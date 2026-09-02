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

/// Own visibility flag — Wayland's `is_visible()` is not trustworthy.
static WINDOW_SHOWN: AtomicBool = AtomicBool::new(true);

/// Orange shrimp mark — same geometry as the app icon (works on light and dark chrome).
const TRAY_ICON: Image<'_> = include_image!("icons/tray-32.png");

/// Window / app icon (sage squircle + shrimp mark).
pub const APP_ICON: Image<'_> = include_image!("icons/icon.png");

/// Long-lived tray menu items. Mutate in place — never call `TrayIcon::set_menu`
/// on the timer path; on macOS that dismisses an open status-item menu.
struct TrayMenuItems {
    visibility: MenuItem<tauri::Wry>,
    status: MenuItem<tauri::Wry>,
    toggle: MenuItem<tauri::Wry>,
    skip: MenuItem<tauri::Wry>,
    settings: MenuItem<tauri::Wry>,
    quit: MenuItem<tauri::Wry>,
}

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
    set_window_shown(&win.app_handle(), true);
}

pub fn hide_window(win: &WebviewWindow) {
    let _ = win.hide();
    mark_linux_csd_stale();
    set_window_shown(&win.app_handle(), false);
}

pub fn hide_native_window(window: &Window) {
    let _ = window.hide();
    mark_linux_csd_stale();
    set_window_shown(&window.app_handle(), false);
}

fn set_window_shown(app: &AppHandle, shown: bool) {
    WINDOW_SHOWN.store(shown, Ordering::Relaxed);
    if let Some(items) = app.try_state::<TrayMenuItems>() {
        let locale = app.state::<EngineHandle>().locale();
        let _ = items.visibility.set_text(visibility_label(&locale, shown));
    }
}

fn visibility_label(locale: &str, shown: bool) -> String {
    if shown {
        crate::i18n::t(locale, "tray.hideWindow")
    } else {
        crate::i18n::t(locale, "tray.showWindow")
    }
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
    let locale = app.state::<EngineHandle>().locale();
    let visibility = MenuItem::with_id(
        app,
        "visibility",
        visibility_label(&locale, true),
        true,
        None::<&str>,
    )?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let toggle = MenuItem::with_id(
        app,
        "toggle",
        crate::i18n::t(&locale, "tray.start"),
        true,
        None::<&str>,
    )?;
    let skip = MenuItem::with_id(
        app,
        "skip",
        crate::i18n::t(&locale, "tray.skipPhase"),
        false,
        None::<&str>,
    )?;
    let status = MenuItem::with_id(
        app,
        "status",
        crate::i18n::t(&locale, "tray.statusReady"),
        false,
        None::<&str>,
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let settings = MenuItem::with_id(
        app,
        "settings",
        crate::i18n::t(&locale, "tray.openSettings"),
        true,
        None::<&str>,
    )?;
    let sep3 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(
        app,
        "quit",
        crate::i18n::t(&locale, "tray.quit"),
        true,
        None::<&str>,
    )?;

    let menu = Menu::with_items(
        app,
        &[&visibility, &sep1, &status, &toggle, &skip, &sep2, &settings, &sep3, &quit],
    )?;

    app.manage(TrayMenuItems {
        visibility,
        status,
        toggle,
        skip,
        settings,
        quit,
    });

    let _tray = TrayIconBuilder::with_id("main")
        .icon(TRAY_ICON)
        .menu(&menu)
        .tooltip(crate::i18n::t(&locale, "tray.tooltipReady"))
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
        "visibility" => {
            if WINDOW_SHOWN.load(Ordering::Relaxed) {
                hide_main(app);
            } else {
                restore_main(app);
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
    let locale = app.state::<EngineHandle>().locale();
    let tooltip = EngineHandle::format_tooltip(snap, &locale);
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(&tooltip));
    }

    let Some(items) = app.try_state::<TrayMenuItems>() else {
        return;
    };

    let toggle_label = if !snap.running {
        crate::i18n::t(&locale, "tray.start")
    } else if snap.paused {
        crate::i18n::t(&locale, "tray.resume")
    } else {
        crate::i18n::t(&locale, "tray.pause")
    };
    let _ = items.toggle.set_text(toggle_label);
    let _ = items
        .skip
        .set_enabled(snap.running && snap.phase != Phase::Idle);
    let _ = items.status.set_text(status_text(snap, &locale));
    let _ = items
        .visibility
        .set_text(visibility_label(&locale, WINDOW_SHOWN.load(Ordering::Relaxed)));
    let _ = items
        .settings
        .set_text(crate::i18n::t(&locale, "tray.openSettings"));
    let _ = items.quit.set_text(crate::i18n::t(&locale, "tray.quit"));
}

fn status_text(snap: &TimerSnapshot, locale: &str) -> String {
    if !snap.running {
        return crate::i18n::t(locale, "tray.statusReady");
    }
    let phase = crate::i18n::phase_label(locale, snap.phase.as_str());
    let (m, s) = if snap.is_flow && snap.phase == Phase::Focus {
        (snap.elapsed_secs / 60, snap.elapsed_secs % 60)
    } else {
        (snap.remaining_secs / 60, snap.remaining_secs % 60)
    };
    let time = format!("{m:02}:{s:02}");
    crate::i18n::t_vars(
        locale,
        "tray.statusRunning",
        &[("phase", &phase), ("time", &time)],
    )
}
