//! Open a URL in the host browser.
//!
//! Linux AppImages prepend `APPDIR` into `LD_LIBRARY_PATH` / `XDG_DATA_DIRS` / related
//! vars (AppImageKit #124, tauri#10617). `xdg-open` then loads bundled libs and fails
//! to launch the system browser. `tauri dev` is not under AppRun, so it works.
//! We spawn `/usr/bin/xdg-open` (then `gio open`) with those AppDir prefixes stripped.

use std::process::{Command, Stdio};

#[cfg(any(test, target_os = "windows"))]
use std::path::PathBuf;

pub const FEEDBACK_URL: &str = "https://github.com/vcostin/tempura/discussions/5";

#[cfg(any(test, target_os = "macos"))]
const MACOS_OPEN: &str = "/usr/bin/open";

/// `%SYSTEMROOT%\System32\cmd.exe`, falling back to `C:\Windows\...` when unset.
#[cfg(any(test, target_os = "windows"))]
fn windows_cmd_exe() -> PathBuf {
    let mut path = PathBuf::from(
        std::env::var_os("SYSTEMROOT").unwrap_or_else(|| r"C:\Windows".into()),
    );
    path.push("System32");
    path.push("cmd.exe");
    path
}

/// Open the pinned Feedback discussion in the system browser.
pub fn open_feedback_url() -> Result<(), String> {
    open_in_host_browser(FEEDBACK_URL)
}

fn open_in_host_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        return open_linux(url);
    }
    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new(MACOS_OPEN);
        cmd.arg(url);
        return run_opener(&mut cmd, MACOS_OPEN);
    }
    #[cfg(target_os = "windows")]
    {
        let bin = windows_cmd_exe();
        let mut cmd = Command::new(&bin);
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
    fn opener_binaries_are_absolute() {
        assert_eq!(MACOS_OPEN, "/usr/bin/open");
        let cmd = windows_cmd_exe();
        assert_eq!(
            cmd.file_name().and_then(|n| n.to_str()),
            Some("cmd.exe")
        );
        let s = cmd.to_string_lossy();
        assert!(s.contains("System32"), "{s}");
        assert!(
            s.starts_with(r"C:\Windows") || std::env::var_os("SYSTEMROOT").is_some(),
            "{s}"
        );
    }

    #[test]
    fn pinned_feedback_url_is_discussion_five() {
        assert_eq!(
            FEEDBACK_URL,
            "https://github.com/vcostin/tempura/discussions/5"
        );
        assert!(FEEDBACK_URL.starts_with("https://"));
        assert!(!FEEDBACK_URL.contains(['?', '#']));
        assert_ne!(
            FEEDBACK_URL,
            "https://github.com/vcostin/tempura/discussions/12"
        );
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
