// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    preload_host_wayland_for_appimage();
    tempura_lib::run()
}

/// GitHub AppImages bundle Ubuntu libwayland. On Arch/Fedora Mesa that ABI
/// mismatch aborts WebKitWebProcess (`EGL_BAD_PARAMETER`) and the window stays
/// blank. `WEBKIT_DISABLE_*` is too late — EGL dies first. Preload the host
/// client so WebKit children bind the system soname. See linuxdeploy
/// excludelist / mesa#11316.
#[cfg(target_os = "linux")]
fn preload_host_wayland_for_appimage() {
    if std::env::var_os("APPIMAGE").is_none() {
        return;
    }
    const CANDIDATES: &[&str] = &[
        "/usr/lib/libwayland-client.so.0",
        "/usr/lib64/libwayland-client.so.0",
        "/usr/lib/x86_64-linux-gnu/libwayland-client.so.0",
        "/usr/lib/aarch64-linux-gnu/libwayland-client.so.0",
    ];
    let Some(lib) = CANDIDATES
        .iter()
        .copied()
        .find(|path| std::path::Path::new(path).exists())
    else {
        return;
    };
    let preload = match std::env::var("LD_PRELOAD") {
        Ok(existing) if !existing.is_empty() => {
            if existing.split(':').any(|entry| entry == lib) {
                return;
            }
            format!("{lib}:{existing}")
        }
        _ => lib.to_string(),
    };
    // SAFETY: main() has not started Tauri/GTK threads yet.
    unsafe { std::env::set_var("LD_PRELOAD", preload) };
}
