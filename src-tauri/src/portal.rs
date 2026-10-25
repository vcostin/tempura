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
    active: Mutex<Option<Active>>,
}

impl PortalState {
    pub fn available(&self) -> bool {
        self.available.load(Ordering::Relaxed)
    }
}

/// Look for the portal once at startup; if the user set shortcuts up before,
/// bind them again (the desktop remembers their keys, so no dialog this time).
pub fn init(app: &AppHandle, enabled: bool) {
    let app = app.clone();
    async_runtime::spawn(async move {
        // Tells the portal which desktop entry this unsandboxed process is.
        // Without it the desktop guesses from the launching process (a terminal, say).
        if let Err(e) = ashpd::register_host_app(APP_ID.try_into().expect("valid app id")).await {
            eprintln!("tempura: couldn't register {APP_ID} with the portal: {e}");
        }
        let available = GlobalShortcuts::new().await.is_ok();
        app.state::<PortalState>().available.store(available, Ordering::Relaxed);
        hotkeys::update_report(&app, |r| {
            r.mode = if available { HotkeyMode::Portal } else { HotkeyMode::Commands };
        });
        if available && enabled {
            let _ = bind(&app).await;
        }
    });
}

/// Follow the "set up" flag in settings: bind when on, close the session when off.
pub fn sync(app: &AppHandle, enabled: bool) {
    let app = app.clone();
    async_runtime::spawn(async move {
        let state = app.state::<PortalState>();
        if !state.available() {
            return;
        }
        let running = state.active.lock().await.is_some();
        if enabled && !running {
            let _ = bind(&app).await;
        } else if !enabled && running {
            close(&app).await;
        }
    });
}

/// Ask the desktop for the shortcuts (its dialog shows for any not yet assigned),
/// or, once they exist, open the desktop's dialog to change them.
pub async fn setup(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<PortalState>();
    {
        let active = state.active.lock().await;
        if let Some(active) = active.as_ref() {
            if active.proxy.version() >= 2 {
                return active
                    .proxy
                    .configure_shortcuts(&active.session, None, ConfigureShortcutsOptions::default())
                    .await
                    .map_err(|e| e.to_string());
            }
            // Older portals (KDE today) can't reopen their dialog for keys they
            // already know, so open the desktop's own shortcuts page instead.
            let desktop = std::env::var("XDG_CURRENT_DESKTOP").unwrap_or_default();
            if let Some((program, args)) = system_shortcuts_page(&desktop) {
                if std::process::Command::new(program).args(args).spawn().is_ok() {
                    return Ok(());
                }
            }
        }
    }
    close(app).await;
    bind(app).await
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

async fn bind(app: &AppHandle) -> Result<(), String> {
    let result = try_bind(app).await;
    hotkeys::update_report(app, |r| r.portal_problem = result.is_err());
    result
}

async fn try_bind(app: &AppHandle) -> Result<(), String> {
    let proxy = GlobalShortcuts::new().await.map_err(|e| e.to_string())?;
    let session = proxy
        .create_session(CreateSessionOptions::default())
        .await
        .map_err(|e| e.to_string())?;
    let locale = app.state::<EngineHandle>().locale();
    let wanted: Vec<NewShortcut> = SHORTCUTS
        .iter()
        .map(|(id, _, label)| NewShortcut::new(*id, crate::i18n::t(&locale, label)))
        .collect();
    let bound = proxy
        .bind_shortcuts(&session, &wanted, None, BindShortcutsOptions::default())
        .await
        .and_then(|request| request.response())
        .map_err(|e| e.to_string());
    let bound = match bound {
        Ok(bound) => bound,
        Err(e) => {
            let _ = session.close().await;
            return Err(e);
        }
    };
    let shortcuts = assigned(bound.shortcuts().iter().map(|s| (s.id(), s.trigger_description())));
    hotkeys::update_report(app, |r| r.portal_shortcuts = shortcuts);

    let mut listeners = Vec::new();
    if let Ok(mut pressed) = proxy.receive_activated().await {
        let app = app.clone();
        listeners.push(async_runtime::spawn(async move {
            while let Some(event) = pressed.next().await {
                match action_for(event.shortcut_id()) {
                    // Wayland won't let a window raise itself; the desktop's token for
                    // this key press is what allows Tempura to come forward.
                    Some(Action::Show) if !crate::tray::main_in_front(&app) => {
                        present_main(&app, activation_token(event.options()))
                    }
                    Some(action) => actions::run(&app, action),
                    None => {}
                }
            }
        }));
    }
    if let Ok(mut changed) = proxy.receive_shortcuts_changed().await {
        let app = app.clone();
        listeners.push(async_runtime::spawn(async move {
            while let Some(event) = changed.next().await {
                let shortcuts =
                    assigned(event.shortcuts().iter().map(|s| (s.id(), s.trigger_description())));
                hotkeys::update_report(&app, |r| r.portal_shortcuts = shortcuts);
            }
        }));
    }

    *app.state::<PortalState>().active.lock().await = Some(Active { proxy, session, listeners });
    Ok(())
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

async fn close(app: &AppHandle) {
    let active = app.state::<PortalState>().active.lock().await.take();
    if let Some(active) = active {
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
