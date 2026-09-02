//! Desktop notifications — delivery only; no custom banner icons.
//!
//! ## macOS limitation
//! Banner icon / click target are owned by macOS app identity
//! (`UNUserNotificationCenter` + signed `.app`). Without an Apple Developer ID
//! that is **impossible** to fake. AppleScript always attributes to Script
//! Editor (and a click may open Script Editor — we cannot suppress that).
//! We do not open Tempura on notification click.
//!
//! We try `UNUserNotificationCenter` when authorization works; otherwise
//! AppleScript so banners still appear.
//!
//! ## Linux / Windows
//! Plain `notify_rust` text notifications (OS default attribution).

#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::AppHandle;

#[cfg(target_os = "macos")]
static UN_READY: AtomicBool = AtomicBool::new(false);

fn dev_log(msg: impl AsRef<str>) {
    if cfg!(debug_assertions) || tauri::is_dev() {
        eprintln!("[tempura:notify] {}", msg.as_ref());
    }
}

/// Call once from app setup: request UN authorization when possible.
pub fn init(_app: &AppHandle) {
    #[cfg(target_os = "macos")]
    {
        init_macos_un();
    }
}

#[cfg(target_os = "macos")]
fn init_macos_un() {
    match mac_usernotifications::check_bundle() {
        Ok(()) => dev_log("macos · bundle identifier present"),
        Err(err) => {
            dev_log(format!(
                "macos · no bundle id ({err}) — UN unavailable, AppleScript fallback"
            ));
            return;
        }
    }

    match mac_usernotifications::blocking::request_auth() {
        Ok(true) => {
            UN_READY.store(true, Ordering::SeqCst);
            dev_log("macos · UNUserNotificationCenter authorized");
        }
        Ok(false) => {
            dev_log("macos · UN authorization denied by user");
        }
        Err(err) => {
            dev_log(format!("macos · UN request_auth failed: {err}"));
        }
    }
}

#[cfg(target_os = "macos")]
fn escape_applescript(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Show a desktop notification.
pub fn show(app: &AppHandle, title: &str, body: &str, silent: bool) {
    let _ = show_result(app, title, body, silent);
}

/// Same as [`show`], but returns the error so debug UI can surface it.
pub fn show_result(
    app: &AppHandle,
    title: &str,
    body: &str,
    silent: bool,
) -> Result<(), String> {
    match show_inner(app, title, body, silent) {
        Ok(()) => {
            dev_log(format!("ok · “{title}” — {body}"));
            Ok(())
        }
        Err(err) => {
            dev_log(format!("FAILED: {err}"));
            Err(err)
        }
    }
}

fn show_inner(
    app: &AppHandle,
    title: &str,
    body: &str,
    silent: bool,
) -> Result<(), String> {
    dev_log(format!(
        "sending · title={title:?} body={body:?} silent={silent}"
    ));

    #[cfg(target_os = "macos")]
    {
        let _ = app;
        if UN_READY.load(Ordering::SeqCst) {
            return show_macos_un(title, body, silent);
        }
        dev_log("macos · UN not ready — AppleScript fallback (Script Editor attribution)");
        show_macos_osascript(title, body, silent)
    }

    #[cfg(not(target_os = "macos"))]
    {
        show_notify_rust(app, title, body)
    }
}

#[cfg(target_os = "macos")]
fn show_macos_un(title: &str, body: &str, silent: bool) -> Result<(), String> {
    use mac_usernotifications::Notification;

    let mut n = Notification::new().title(title).message(body);
    if !silent {
        n = n.default_sound();
    }

    let handle = n
        .send_blocking()
        .map_err(|err| format!("UNUserNotificationCenter: {err}"))?;

    // Fire-and-forget: no click handler (we don't restore Tempura on tap).
    let _ = handle;

    Ok(())
}

#[cfg(target_os = "macos")]
fn show_macos_osascript(title: &str, body: &str, silent: bool) -> Result<(), String> {
    let title_e = escape_applescript(title);
    let body_e = escape_applescript(body);
    let script = if silent {
        format!(r#"display notification "{body_e}" with title "{title_e}""#)
    } else {
        format!(
            r#"display notification "{body_e}" with title "{title_e}" sound name "Glass""#
        )
    };

    dev_log(format!("macos · osascript: {script}"));

    let output = std::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .map_err(|err| format!("osascript spawn: {err}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !stdout.is_empty() {
        dev_log(format!("osascript stdout: {stdout}"));
    }
    if !stderr.is_empty() {
        dev_log(format!("osascript stderr: {stderr}"));
    }

    if output.status.success() {
        Ok(())
    } else {
        Err(format!(
            "osascript exited {}: {}",
            output.status,
            if stderr.is_empty() { stdout } else { stderr }
        ))
    }
}

#[cfg(not(target_os = "macos"))]
fn show_notify_rust(app: &AppHandle, title: &str, body: &str) -> Result<(), String> {
    let mut notification = notify_rust::Notification::new();
    notification.summary(title).body(body).appname("Tempura");

    #[cfg(windows)]
    {
        use std::path::MAIN_SEPARATOR as SEP;
        if let Ok(exe) = tauri::utils::platform::current_exe() {
            if let Some(exe_dir) = exe.parent() {
                let curr_dir = exe_dir.display().to_string();
                let is_dev_target = curr_dir.ends_with(format!("{SEP}target{SEP}debug").as_str())
                    || curr_dir.ends_with(format!("{SEP}target{SEP}release").as_str());
                if !is_dev_target {
                    notification.app_id(&app.config().identifier);
                }
            }
        }
    }

    #[cfg(not(windows))]
    {
        let _ = app;
    }

    match notification.show() {
        Ok(_handle) => {
            dev_log("show() returned ok");
            Ok(())
        }
        Err(err) => Err(format!("show(): {err}")),
    }
}

/// Backend label for the Debug page.
pub fn backend_label() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        if UN_READY.load(Ordering::SeqCst) {
            "UNUserNotificationCenter"
        } else {
            "AppleScript (Script Editor)"
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        "notify-rust"
    }
}
