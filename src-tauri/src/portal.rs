//! Global shortcuts on Wayland, through the desktop's GlobalShortcuts portal.
//!
//! Wayland doesn't let apps grab keys, so Tempura asks the desktop instead: it
//! names its three actions, and GNOME or KDE shows its own dialog where the user
//! picks (or declines) the keys. The desktop owns the keys and their conflicts;
//! Tempura only hears when one is pressed. Nothing is asked until the user clicks
//! "Set up shortcuts…" in Settings, and turning them off closes the session,
//! which releases the keys.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use ashpd::desktop::global_shortcuts::{
    BindShortcutsOptions, ConfigureShortcutsOptions, GlobalShortcuts, NewShortcut,
};
use ashpd::desktop::{CreateSessionOptions, Session};
use ashpd::zvariant::OwnedValue;
use futures_util::StreamExt;
use serde::Serialize;
use tauri::async_runtime::{self, JoinHandle, Mutex};
use tauri::{AppHandle, Manager};

use crate::actions::{self, Action};
use crate::engine::EngineHandle;
use crate::hotkeys::{self, HotkeyMode};

/// Must match the desktop entry, so the desktop can name and remember the app.
const APP_ID: &str = "app.tempura.focus";

/// Portal ids for our actions, with the `shortcuts.*` string that describes each.
const SHORTCUTS: [(&str, Action, &str); 3] = [
    ("toggle", Action::Toggle, "shortcuts.startPause"),
    ("skip", Action::Skip, "shortcuts.skip"),
    ("show", Action::Show, "shortcuts.showWindow"),
];

pub fn action_for(id: &str) -> Option<Action> {
    SHORTCUTS.iter().find(|(name, ..)| *name == id).map(|(_, action, _)| *action)
}

/// A shortcut the desktop assigned, as Settings lists it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PortalShortcut {
    pub action: String,
    /// The desktop's own label for the keys, like "Ctrl+Alt+P"; empty if unassigned.
    pub trigger: String,
}

/// Our actions in a fixed order, with whatever keys the desktop reported for them.
pub fn assigned<'a>(reported: impl IntoIterator<Item = (&'a str, &'a str)>) -> Vec<PortalShortcut> {
    let reported: Vec<_> = reported.into_iter().collect();
    SHORTCUTS
        .iter()
        .map(|(id, ..)| PortalShortcut {
            action: id.to_string(),
            trigger: reported
                .iter()
                .find(|(rid, _)| rid == id)
                .map(|(_, trigger)| trigger.to_string())
                .unwrap_or_default(),
        })
        .collect()
}

struct Active {
    proxy: GlobalShortcuts,
    session: Session<GlobalShortcuts>,
    listeners: Vec<JoinHandle<()>>,
}

#[derive(Default)]
pub struct PortalState {
    available: AtomicBool,
    /// Whether settings ask for shortcuts; startup and later changes both settle on it.
    wanted: AtomicBool,
    /// Held across every bind and close, so they never overlap.
    active: Mutex<Option<Active>>,
}

/// Look for the portal once at startup; if the user set shortcuts up before,
/// bind them again (the desktop remembers their keys, so no dialog this time).
pub fn init(app: &AppHandle, enabled: bool) {
    app.state::<PortalState>().wanted.store(enabled, Ordering::Relaxed);
    let app = app.clone();
    async_runtime::spawn(async move {
        let available = portal_present().await;
        app.state::<PortalState>().available.store(available, Ordering::Relaxed);
        hotkeys::update_report(&app, |r| {
            r.mode = if available { HotkeyMode::Portal } else { HotkeyMode::Commands };
        });
        settle(&app).await;
    });
}

/// Follow the "set up" flag in settings: bind when on, close the session when off.
pub fn sync(app: &AppHandle, enabled: bool) {
    app.state::<PortalState>().wanted.store(enabled, Ordering::Relaxed);
    let app = app.clone();
    async_runtime::spawn(async move { settle(&app).await });
}

/// Bind or close so the session matches what settings want right now.
async fn settle(app: &AppHandle) {
    let state = app.state::<PortalState>();
    if !state.available.load(Ordering::Relaxed) {
        return;
    }
    let mut active = state.active.lock().await;
    let wanted = state.wanted.load(Ordering::Relaxed);
    if wanted && active.is_none() {
        let _ = bind(app, &mut active).await;
    } else if !wanted && active.is_some() {
        close(app, &mut active).await;
    }
}

/// Whether the desktop runs a GlobalShortcuts portal. Asked on a throwaway
/// connection: registering our app id must be the first call on the one that binds.
async fn portal_present() -> bool {
    let Ok(connection) = ashpd::zbus::Connection::session().await else { return false };
    let Ok(proxy) = ashpd::zbus::Proxy::new(
        &connection,
        "org.freedesktop.portal.Desktop",
        "/org/freedesktop/portal/desktop",
        "org.freedesktop.portal.GlobalShortcuts",
    )
    .await
    else {
        return false;
    };
    proxy.get_property::<u32>("version").await.is_ok()
}

/// Ask the desktop for the shortcuts (its dialog shows for any not yet assigned),
/// or, once they exist, open the desktop's dialog to change them.
pub async fn setup(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<PortalState>();
    let mut active = state.active.lock().await;
    if let Some(current) = active.as_ref() {
        if current.proxy.version() >= 2 {
            return current
                .proxy
                .configure_shortcuts(&current.session, None, ConfigureShortcutsOptions::default())
                .await
                .map_err(|e| e.to_string());
        }
        // Older portals (KDE today) can't reopen their dialog for keys they
        // already know, so open the desktop's own shortcuts page instead.
        if open_system_shortcuts_page() {
            return Ok(());
        }
        close(app, &mut active).await;
    }
    bind(app, &mut active).await
}

fn open_system_shortcuts_page() -> bool {
    let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
    let Some((program, args)) = system_shortcuts_page(&desktop) else { return false };
    match std::process::Command::new(program).args(args).spawn() {
        Ok(mut child) => {
            // Reap it when the user closes it, so no zombie lingers.
            std::thread::spawn(move || child.wait());
            true
        }
        Err(_) => false,
    }
}

/// The desktop's keyboard shortcuts settings, where portal shortcuts can be changed.
pub fn system_shortcuts_page(current_desktop: &str) -> Option<(&'static str, &'static [&'static str])> {
    let desktops: Vec<String> = current_desktop.split(':').map(str::to_ascii_lowercase).collect();
    if desktops.iter().any(|d| d == "kde") {
        Some(("systemsettings", &["kcm_keys"]))
    } else if desktops.iter().any(|d| d == "gnome") {
        Some(("gnome-control-center", &["keyboard"]))
    } else {
        None
    }
}

async fn bind(app: &AppHandle, active: &mut Option<Active>) -> Result<(), String> {
    let result = try_bind(app).await;
    hotkeys::update_report(app, |r| r.portal_problem = result.is_err());
    *active = Some(result?);
    Ok(())
}

/// The desktop names the shortcuts' owner, and shows its icon, from the menu entry
/// matching our app id. Installed packages may lack one under that id (and dev
/// builds have none), so keep a hidden one in the user's data folder.
fn ensure_desktop_entry() -> std::io::Result<()> {
    let data_home = std::env::var_os("XDG_DATA_HOME")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|home| std::path::Path::new(&home).join(".local/share")))
        .ok_or_else(|| std::io::Error::other("no home folder"))?;
    let file = format!("{APP_ID}.desktop");
    let system_dirs = std::env::var("XDG_DATA_DIRS").unwrap_or_else(|_| "/usr/local/share:/usr/share".into());
    if system_dirs.split(':').any(|dir| std::path::Path::new(dir).join("applications").join(&file).exists()) {
        return Ok(());
    }
    let icon_dir = data_home.join("icons/hicolor/128x128/apps");
    std::fs::create_dir_all(&icon_dir)?;
    std::fs::write(icon_dir.join(format!("{APP_ID}.png")), include_bytes!("../icons/128x128.png"))?;
    let apps = data_home.join("applications");
    std::fs::create_dir_all(&apps)?;
    let entry = desktop_entry(&hotkeys::launch_command());
    let path = apps.join(&file);
    if std::fs::read_to_string(&path).ok().as_deref() != Some(entry.as_str()) {
        std::fs::write(path, entry)?;
    }
    Ok(())
}

/// A hidden menu entry (no duplicate in the app menu) that names and pictures Tempura.
pub fn desktop_entry(command: &str) -> String {
    format!(
        "[Desktop Entry]\nType=Application\nName=Tempura\nComment=Focus timer\nExec={}\nIcon={APP_ID}\nTerminal=false\nNoDisplay=true\n",
        exec_argument(command)
    )
}

/// Quote one Exec argument per the Desktop Entry spec: escape for the quoted
/// argument, then again for the file's string escapes, and double `%` (field codes).
fn exec_argument(arg: &str) -> String {
    let mut quoted = String::from("\"");
    for c in arg.chars() {
        match c {
            '"' | '`' | '$' => {
                quoted.push_str("\\\\");
                quoted.push(c);
            }
            '\\' => quoted.push_str("\\\\\\\\"),
            '%' => quoted.push_str("%%"),
            c => quoted.push(c),
        }
    }
    quoted.push('"');
    quoted
}

/// Registering fails until a freshly written entry reaches the portal's app index.
fn entry_not_indexed_yet(error: &ashpd::Error) -> bool {
    error.to_string().contains("App info not found")
}

async fn try_bind(app: &AppHandle) -> Result<Active, String> {
    // The portal only accepts our app id once a desktop entry for it exists, and
    // without it the desktop guesses from the launching process (a terminal, say).
    if let Err(e) = ensure_desktop_entry() {
        eprintln!("tempura: couldn't write the desktop entry for {APP_ID}: {e}");
    }
    let app_id: ashpd::AppID = APP_ID.try_into().expect("valid app id");
    // Each try gets a fresh connection, since registering must come first on it.
    let mut attempt = 0;
    let connection = loop {
        let connection = ashpd::zbus::Connection::session().await.map_err(|e| e.to_string())?;
        match ashpd::register_host_app_with_connection(connection.clone(), app_id.clone()).await {
            Err(e) if attempt < 2 && entry_not_indexed_yet(&e) => {
                attempt += 1;
                tokio::time::sleep(std::time::Duration::from_millis(300)).await;
            }
            Err(e) => {
                // Older portals have no registry; the desktop then names us itself.
                eprintln!("tempura: couldn't register {APP_ID} with the portal: {e}");
                break connection;
            }
            Ok(()) => break connection,
        }
    };
    let proxy = GlobalShortcuts::with_connection(connection).await.map_err(|e| e.to_string())?;
    let session = proxy
        .create_session(CreateSessionOptions::default())
        .await
        .map_err(|e| e.to_string())?;
    match listen(app, &proxy, &session).await {
        Ok(listeners) => Ok(Active { proxy, session, listeners }),
        Err(e) => {
            let _ = session.close().await;
            Err(e)
        }
    }
}

/// Bind our shortcuts in the session and follow their key presses and changes.
async fn listen(
    app: &AppHandle,
    proxy: &GlobalShortcuts,
    session: &Session<GlobalShortcuts>,
) -> Result<Vec<JoinHandle<()>>, String> {
    // Subscribe first, so no press right after binding is missed.
    let mut pressed = proxy.receive_activated().await.map_err(|e| e.to_string())?;
    let changed = proxy.receive_shortcuts_changed().await.ok();

    let locale = app.state::<EngineHandle>().locale();
    let wanted: Vec<NewShortcut> = SHORTCUTS
        .iter()
        .map(|(id, _, label)| NewShortcut::new(*id, crate::i18n::t(&locale, label)))
        .collect();
    let bound = proxy
        .bind_shortcuts(session, &wanted, None, BindShortcutsOptions::default())
        .await
        .and_then(|request| request.response())
        .map_err(|e| e.to_string())?;
    let shortcuts = assigned(bound.shortcuts().iter().map(|s| (s.id(), s.trigger_description())));
    hotkeys::update_report(app, |r| r.portal_shortcuts = shortcuts);

    let mut listeners = Vec::new();
    let on_press = app.clone();
    listeners.push(async_runtime::spawn(async move {
        while let Some(event) = pressed.next().await {
            match action_for(event.shortcut_id()) {
                // Wayland won't let a window raise itself; the desktop's token for
                // this key press is what allows Tempura to come forward.
                Some(Action::Show) if !crate::tray::main_in_front(&on_press) => {
                    present_main(&on_press, activation_token(event.options()))
                }
                Some(action) => actions::run(&on_press, action),
                None => {}
            }
        }
    }));
    if let Some(mut changed) = changed {
        let on_change = app.clone();
        listeners.push(async_runtime::spawn(async move {
            while let Some(event) = changed.next().await {
                let shortcuts =
                    assigned(event.shortcuts().iter().map(|s| (s.id(), s.trigger_description())));
                hotkeys::update_report(&on_change, |r| r.portal_shortcuts = shortcuts);
            }
        }));
    }
    Ok(listeners)
}

fn activation_token(options: &HashMap<String, OwnedValue>) -> Option<String> {
    let value = options.get("activation_token")?;
    <&str>::try_from(&**value).ok().filter(|t| !t.is_empty()).map(str::to_string)
}

/// Show the window and raise it with the desktop's activation token when there is one.
fn present_main(app: &AppHandle, token: Option<String>) {
    crate::tray::restore_main(app);
    let Some(token) = token else {
        eprintln!("tempura: the desktop sent no activation token, so it may keep Tempura behind");
        return;
    };
    let Some(win) = app.get_webview_window("main") else { return };
    let _ = app.run_on_main_thread(move || {
        if let Ok(gtk_window) = win.gtk_window() {
            use gtk::prelude::GtkWindowExt;
            gtk_window.set_startup_id(&token);
            gtk_window.present();
        }
    });
}

async fn close(app: &AppHandle, active: &mut Option<Active>) {
    if let Some(active) = active.take() {
        for listener in active.listeners {
            listener.abort();
        }
        let _ = active.session.close().await;
    }
    hotkeys::update_report(app, |r| {
        r.portal_shortcuts.clear();
        r.portal_problem = false;
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_portal_ids_to_actions() {
        assert_eq!(action_for("toggle"), Some(Action::Toggle));
        assert_eq!(action_for("skip"), Some(Action::Skip));
        assert_eq!(action_for("show"), Some(Action::Show));
        assert_eq!(action_for("something-else"), None);
    }

    #[test]
    fn reads_the_activation_token_from_the_key_press() {
        let mut options = HashMap::new();
        assert_eq!(activation_token(&options), None);
        options.insert("activation_token".to_string(), OwnedValue::try_from(ashpd::zvariant::Value::from("kwin-42")).unwrap());
        assert_eq!(activation_token(&options).as_deref(), Some("kwin-42"));
        options.insert("activation_token".to_string(), OwnedValue::try_from(ashpd::zvariant::Value::from("")).unwrap());
        assert_eq!(activation_token(&options), None);
    }

    #[test]
    fn desktop_entry_names_tempura_and_quotes_the_command() {
        let entry = desktop_entry("/home/me/My Apps/Tempura.AppImage");
        assert!(entry.starts_with("[Desktop Entry]\n"));
        assert!(entry.contains("\nName=Tempura\n"));
        assert!(entry.contains("\nExec=\"/home/me/My Apps/Tempura.AppImage\"\n"));
        assert!(entry.contains("\nIcon=app.tempura.focus\n"));
        assert!(entry.contains("\nNoDisplay=true\n"));
        // `$` and `\` take two escapes (quoting, then the file's own); `%` doubles.
        assert_eq!(exec_argument("/opt/a$b"), r#""/opt/a\\$b""#);
        assert_eq!(exec_argument(r"/opt/a\b"), r#""/opt/a\\\\b""#);
        assert_eq!(exec_argument("/opt/100%"), r#""/opt/100%%""#);
    }

    #[test]
    fn finds_the_shortcuts_page_for_kde_and_gnome() {
        assert_eq!(system_shortcuts_page("KDE"), Some(("systemsettings", &["kcm_keys"][..])));
        assert_eq!(system_shortcuts_page("ubuntu:GNOME"), Some(("gnome-control-center", &["keyboard"][..])));
        assert_eq!(system_shortcuts_page("Hyprland"), None);
        assert_eq!(system_shortcuts_page(""), None);
    }

    #[test]
    fn lists_every_action_with_the_keys_the_desktop_assigned() {
        let shortcuts = assigned([("show", "Super+T"), ("toggle", "Ctrl+Alt+P"), ("other", "F1")]);
        assert_eq!(
            shortcuts,
            vec![
                PortalShortcut { action: "toggle".into(), trigger: "Ctrl+Alt+P".into() },
                PortalShortcut { action: "skip".into(), trigger: String::new() },
                PortalShortcut { action: "show".into(), trigger: "Super+T".into() },
            ]
        );
    }
}
