//! Open a URL in the host browser.
//!
//! Linux AppImages prepend `APPDIR` into `LD_LIBRARY_PATH` / `XDG_DATA_DIRS` / related
//! vars (AppImageKit #124, tauri#10617). `xdg-open` then loads bundled libs and fails
//! to launch the system browser. `tauri dev` is not under AppRun, so it works.
//! We spawn `/usr/bin/xdg-open` (then `gio open`) with those AppDir prefixes stripped.

use std::process::{Command, Stdio};

#[allow(dead_code)] // pinned Discussion #5; asserted in tests, frontend has its own copy
pub const FEEDBACK_URL: &str = "https://github.com/vcostin/tempura/discussions/5";
const FEEDBACK_PREFIX: &str = "https://github.com/vcostin/tempura/discussions/";

pub fn is_allowed_feedback_url(url: &str) -> bool {
    let Some(rest) = url.strip_prefix(FEEDBACK_PREFIX) else {
        return false;
    };
    !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
}

/// Open an allowlisted feedback discussion in the system browser.
pub fn open_feedback_url(url: &str) -> Result<(), String> {
    if !is_allowed_feedback_url(url) {
        return Err("URL is not an allowed feedback discussion".into());
    }
    open_in_host_browser(url)
}

fn open_in_host_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        return open_linux(url);
    }
    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        cmd.arg(url);
        return run_opener(&mut cmd, "open");
    }
    #[cfg(target_os = "windows")]
    {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", url]);
        return run_opener(&mut cmd, "cmd start");
    }
    #[cfg(not(any(target_os = "linux", target_os = "macos", target_os = "windows")))]
    {
        let _ = url;
        Err("Opening URLs is not supported on this platform".into())
    }
}

#[cfg(target_os = "linux")]
fn open_linux(url: &str) -> Result<(), String> {
    let mut last_err = String::from("no host opener found");
    for (bin, extra) in [("/usr/bin/xdg-open", None), ("/usr/bin/gio", Some("open"))] {
        let mut cmd = Command::new(bin);
        if let Some(sub) = extra {
            cmd.arg(sub);
        }
        cmd.arg(url);
        sanitize_linux_opener_env(&mut cmd);
        match run_opener(&mut cmd, bin) {
            Ok(()) => return Ok(()),
            Err(e) => last_err = e,
        }
    }
    Err(last_err)
}

fn run_opener(cmd: &mut Command, label: &str) -> Result<(), String> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to start {label}: {e}"))?;
    // Reap so we don't leave zombies if xdg-open returns quickly.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// Strip AppImage/AppRun prefixes so the host `xdg-open` sees a normal desktop env.
/// No-op when `APPDIR` is unset (`tauri dev`).
#[cfg(target_os = "linux")]
pub fn sanitize_linux_opener_env(cmd: &mut Command) {
    let Some(appdir) = std::env::var_os("APPDIR") else {
        return;
    };
    let appdir = appdir.to_string_lossy();
    if appdir.is_empty() {
        return;
    }
    let appdir = appdir.as_ref();

    const PATH_VARS: &[&str] = &[
        "PATH",
        "LD_LIBRARY_PATH",
        "LD_PRELOAD",
        "XDG_DATA_DIRS",
        "XDG_CONFIG_DIRS",
        "QT_PLUGIN_PATH",
        "QT_QPA_PLATFORM_PLUGIN_PATH",
        "GTK_PATH",
        "GI_TYPELIB_PATH",
        "GST_PLUGIN_SYSTEM_PATH",
        "GST_PLUGIN_SYSTEM_PATH_1_0",
        "GST_PLUGIN_PATH",
        "PYTHONPATH",
        "PERLLIB",
        "PERL5LIB",
    ];
    for key in PATH_VARS {
        if let Ok(val) = std::env::var(key) {
            let cleaned = strip_appdir_prefixes(&val, appdir);
            if cleaned.is_empty() {
                cmd.env_remove(key);
            } else {
                cmd.env(key, cleaned);
            }
        }
    }

    const UNSET_IF_UNDER_APPDIR: &[&str] = &[
        "LD_PRELOAD",
        "GTK_EXE_PREFIX",
        "GTK_DATA_PREFIX",
        "GTK_IM_MODULE_FILE",
        "GIO_MODULE_DIR",
        "GSETTINGS_SCHEMA_DIR",
        "GDK_PIXBUF_MODULE_FILE",
        "GDK_PIXBUF_MODULEDIR",
        "PYTHONHOME",
    ];
    for key in UNSET_IF_UNDER_APPDIR {
        if let Ok(val) = std::env::var(key) {
            if val.split(':').any(|part| part.starts_with(appdir)) {
                cmd.env_remove(key);
            }
        }
    }
}

#[cfg(any(test, target_os = "linux"))]
pub fn strip_appdir_prefixes(value: &str, appdir: &str) -> String {
    value
        .split(':')
        .filter(|part| !part.is_empty() && !part.starts_with(appdir))
        .collect::<Vec<_>>()
        .join(":")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_pinned_discussion() {
        assert!(is_allowed_feedback_url(FEEDBACK_URL));
        assert!(is_allowed_feedback_url(
            "https://github.com/vcostin/tempura/discussions/12"
        ));
    }

    #[test]
    fn rejects_other_urls() {
        assert!(!is_allowed_feedback_url("https://github.com/vcostin/tempura"));
        assert!(!is_allowed_feedback_url(
            "https://github.com/vcostin/tempura/discussions/5/extra"
        ));
        assert!(!is_allowed_feedback_url("https://evil.example/discussions/5"));
        assert!(!is_allowed_feedback_url(
            "https://github.com/vcostin/tempura/discussions/"
        ));
        assert!(!is_allowed_feedback_url("file:///etc/passwd"));
    }

    #[test]
    fn strips_appdir_from_colon_paths() {
        let appdir = "/tmp/.mount_TempuraXXXX";
        let polluted = format!("{appdir}/usr/lib:/usr/lib:/lib");
        assert_eq!(strip_appdir_prefixes(&polluted, appdir), "/usr/lib:/lib");
        assert_eq!(
            strip_appdir_prefixes(&format!("{appdir}/usr/share"), appdir),
            ""
        );
    }
}
