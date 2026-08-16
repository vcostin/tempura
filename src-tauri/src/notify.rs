//! Desktop notifications.
//!
//! macOS: `osascript` `display notification`. The Tauri/notify-rust stack still
//! uses deprecated `NSUserNotificationCenter`, which returns success but shows
//! nothing on modern macOS. AppleScript still delivers; the banner is attributed
//! to Script Editor until Tempura runs as an installed `.app` with a modern
//! `UNUserNotificationCenter` path.
//! Linux/Windows: `notify_rust` with Tempura's icon/image when available.

use std::path::PathBuf;
use std::process::Command;
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

const ICON_PNG: &[u8] = include_bytes!("../icons/128x128.png");

static ICON_PATH: Mutex<Option<PathBuf>> = Mutex::new(None);

fn dev_log(msg: impl AsRef<str>) {
    if cfg!(debug_assertions) || tauri::is_dev() {
        eprintln!("[tempura:notify] {}", msg.as_ref());
    }
}

fn ensure_icon_file(app: &AppHandle) -> Option<PathBuf> {
    if let Ok(guard) = ICON_PATH.lock() {
        if let Some(path) = guard.as_ref() {
            if path.exists() {
                return Some(path.clone());
            }
        }
    }

    let dir = match app.path().app_cache_dir() {
        Ok(dir) => dir,
        Err(err) => {
            dev_log(format!("icon cache dir unavailable: {err}"));
            return None;
        }
    };
    let path = dir.join("notification-icon.png");
    if !path.exists() {
        if let Err(err) = std::fs::create_dir_all(&dir) {
            dev_log(format!("failed to create icon cache dir: {err}"));
            return None;
        }
        if let Err(err) = std::fs::write(&path, ICON_PNG) {
            dev_log(format!("failed to write notification icon: {err}"));
            return None;
        }
        dev_log(format!("wrote notification icon → {}", path.display()));
    }

    if let Ok(mut guard) = ICON_PATH.lock() {
        *guard = Some(path.clone());
    }
    Some(path)
}

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
    let icon = ensure_icon_file(app);
    dev_log(format!(
        "sending · title={title:?} body={body:?} silent={silent} icon={}",
        icon.as_ref()
            .map(|p| p.display().to_string())
            .unwrap_or_else(|| "none".into())
    ));

    #[cfg(target_os = "macos")]
    {
        let _ = icon;
        show_macos_osascript(title, body, silent)
    }

    #[cfg(not(target_os = "macos"))]
    {
        show_notify_rust(app, title, body, icon.as_deref())
    }
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

    let output = Command::new("osascript")
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
        dev_log(
            "macos · delivered (look under Script Editor in Notification Center; custom icons need an installed .app)",
        );
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
fn show_notify_rust(
    app: &AppHandle,
    title: &str,
    body: &str,
    icon: Option<&std::path::Path>,
) -> Result<(), String> {
    let mut notification = notify_rust::Notification::new();
    notification.summary(title).body(body);

    if let Some(path) = icon {
        let path_str = path.to_string_lossy().into_owned();
        #[cfg(all(unix, not(target_os = "macos")))]
        {
            notification.icon(&path_str);
            notification.appname("Tempura");
            dev_log(format!("linux icon={path_str}"));
        }
        #[cfg(windows)]
        {
            notification.image_path(&path_str);
            dev_log(format!("windows image_path={path_str}"));
        }
    }

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
                    dev_log(format!("windows app_id={}", app.config().identifier));
                } else {
                    dev_log("windows unpackaged · PowerShell app id");
                }
            }
        }
    }

    match notification.show() {
        Ok(_handle) => {
            dev_log("show() returned ok");
            Ok(())
        }
        Err(err) => Err(format!("show(): {err}")),
    }
}
