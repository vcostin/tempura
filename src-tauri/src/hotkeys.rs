//! Opt-in global hotkeys: keys that act on the timer while Tempura is in the
//! background. Nothing is registered until the user records a shortcut, every
//! shortcut needs Ctrl, Alt or Super (so typing is never captured), and a key
//! another app already owns is reported, never taken.
//!
//! The plugin can't grab keys on Wayland; there Tempura asks the desktop through
//! its GlobalShortcuts portal (see `portal.rs`), and where no portal exists the
//! Settings page points to the `tempura --toggle` style commands (`actions.rs`).

use std::str::FromStr;

use parking_lot::Mutex;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{
    GlobalShortcutExt, Modifiers, Shortcut, ShortcutEvent, ShortcutState,
};

use crate::actions::{self, Action};
use crate::models::GlobalHotkeys;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HotkeyProblem {
    /// Not a key combination the plugin understands.
    Invalid,
    /// No Ctrl, Alt or Super: it would swallow ordinary typing.
    NeedsModifier,
}

/// Parse a recorded shortcut ("Control+Alt+KeyP") and check it leaves typing alone.
pub fn check(accelerator: &str) -> Result<Shortcut, HotkeyProblem> {
    let shortcut = Shortcut::from_str(accelerator).map_err(|_| HotkeyProblem::Invalid)?;
    let typing_safe = Modifiers::CONTROL | Modifiers::ALT | Modifiers::SUPER | Modifiers::META;
    if !shortcut.mods.intersects(typing_safe) {
        return Err(HotkeyProblem::NeedsModifier);
    }
    Ok(shortcut)
}

/// The recorded shortcuts with their actions, skipping the empty ones.
pub fn bindings(hotkeys: &GlobalHotkeys) -> [(&'static str, Action, &str); 3] {
    [
        ("toggle", Action::Toggle, hotkeys.toggle.as_str()),
        ("skip", Action::Skip, hotkeys.skip.as_str()),
        ("show", Action::Show, hotkeys.show.as_str()),
    ]
}

/// Wayland sessions can't grab global keys through the plugin.
pub fn session_supports_hotkeys(session_type: Option<&str>, wayland_display: Option<&str>) -> bool {
    if cfg!(not(target_os = "linux")) {
        return true;
    }
    let wayland = session_type.is_some_and(|t| t.eq_ignore_ascii_case("wayland"))
        || wayland_display.is_some_and(|d| !d.is_empty());
    !wayland
}

/// How this session offers global shortcuts.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum HotkeyMode {
    /// Tempura records and registers the keys itself.
    #[default]
    Keys,
    /// Wayland with a GlobalShortcuts portal: the desktop's dialog picks the keys.
    Portal,
    /// Wayland without a portal: Settings lists commands to bind in the system settings.
    Commands,
}

/// What the Settings page shows next to each shortcut.
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyReport {
    pub mode: HotkeyMode,
    /// Actions ("toggle", "skip", "show") whose shortcut another app already owns.
    pub in_use: Vec<String>,
    /// How to run this Tempura from a system shortcut: the AppImage itself when
    /// running from one (its mounted binary moves every launch), else this executable.
    pub command: String,
    /// The keys the desktop assigned through the portal; empty until set up.
    #[cfg(target_os = "linux")]
    pub portal_shortcuts: Vec<crate::portal::PortalShortcut>,
    /// The desktop refused or failed to bind the shortcuts the last time we asked.
    pub portal_problem: bool,
}

pub fn launch_command() -> String {
    std::env::var("APPIMAGE")
        .ok()
        .filter(|path| !path.is_empty())
        .or_else(|| std::env::current_exe().ok().map(|p| p.display().to_string()))
        .unwrap_or_else(|| "tempura".into())
}

#[derive(Default)]
pub struct HotkeyState {
    applied: Mutex<Option<GlobalHotkeys>>,
    bound: Mutex<Vec<(Shortcut, Action)>>,
    report: Mutex<HotkeyReport>,
}

impl HotkeyState {
    pub fn report(&self) -> HotkeyReport {
        self.report.lock().clone()
    }
}

/// Change the report and tell the Settings page to fetch it again.
pub fn update_report(app: &AppHandle, change: impl FnOnce(&mut HotkeyReport)) {
    change(&mut app.state::<HotkeyState>().report.lock());
    let _ = app.emit("hotkeys-changed", ());
}

/// Release our old shortcuts and register the recorded ones. A no-op when nothing changed.
pub fn apply(app: &AppHandle, hotkeys: &GlobalHotkeys) {
    let state = app.state::<HotkeyState>();
    let previous = state.applied.lock().replace(hotkeys.clone());
    if previous.as_ref() == Some(hotkeys) {
        return;
    }
    let manager = app.global_shortcut();
    for (shortcut, _) in state.bound.lock().drain(..) {
        let _ = manager.unregister(shortcut);
    }

    let supported = session_supports_hotkeys(
        std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
        std::env::var("WAYLAND_DISPLAY").ok().as_deref(),
    );
    let mut in_use = Vec::new();
    if supported {
        let mut bound = state.bound.lock();
        for (name, action, accelerator) in bindings(hotkeys) {
            let Ok(shortcut) = check(accelerator) else { continue };
            match manager.register(shortcut) {
                Ok(()) => bound.push((shortcut, action)),
                // The OS refuses a combination another app has grabbed: report it, don't fight.
                Err(_) => in_use.push(name.to_string()),
            }
        }
    }
    update_report(app, |report| {
        report.in_use = in_use;
        report.command = launch_command();
        if supported {
            report.mode = HotkeyMode::Keys;
        }
    });

    #[cfg(target_os = "linux")]
    if !supported {
        if previous.is_none() {
            // First run: until the portal answers, offer the commands.
            update_report(app, |report| report.mode = HotkeyMode::Commands);
            crate::portal::init(app, hotkeys.portal);
        } else {
            crate::portal::sync(app, hotkeys.portal);
        }
    }
}

pub fn on_shortcut(app: &AppHandle, shortcut: &Shortcut, event: ShortcutEvent) {
    if event.state != ShortcutState::Pressed {
        return;
    }
    let action = app
        .state::<HotkeyState>()
        .bound
        .lock()
        .iter()
        .find(|(bound, _)| bound == shortcut)
        .map(|(_, action)| *action);
    if let Some(action) = action {
        actions::run(app, action);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_shortcuts_with_ctrl_alt_or_super() {
        assert!(check("Control+Alt+KeyP").is_ok());
        assert!(check("Super+Shift+Digit1").is_ok());
        assert!(check("Alt+F5").is_ok());
    }

    #[test]
    fn refuses_shortcuts_that_would_capture_typing() {
        assert_eq!(check("KeyP"), Err(HotkeyProblem::NeedsModifier));
        assert_eq!(check("Shift+KeyP"), Err(HotkeyProblem::NeedsModifier));
        assert_eq!(check("Space"), Err(HotkeyProblem::NeedsModifier));
    }

    #[test]
    fn refuses_what_it_cannot_parse() {
        assert_eq!(check(""), Err(HotkeyProblem::Invalid));
        assert_eq!(check("Control+"), Err(HotkeyProblem::Invalid));
        assert_eq!(check("Control+NotAKey"), Err(HotkeyProblem::Invalid));
    }

    #[test]
    fn bindings_pair_each_action_with_its_shortcut() {
        let hotkeys = GlobalHotkeys {
            toggle: "Control+Alt+KeyP".into(),
            skip: String::new(),
            show: "Control+Alt+KeyT".into(),
            portal: false,
        };
        let names: Vec<_> = bindings(&hotkeys).iter().map(|(n, a, s)| (*n, *a, s.to_string())).collect();
        assert_eq!(names[0], ("toggle", Action::Toggle, "Control+Alt+KeyP".to_string()));
        assert_eq!(names[1], ("skip", Action::Skip, String::new()));
        assert_eq!(names[2], ("show", Action::Show, "Control+Alt+KeyT".to_string()));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn wayland_sessions_are_not_supported() {
        assert!(!session_supports_hotkeys(Some("wayland"), None));
        assert!(!session_supports_hotkeys(None, Some("wayland-0")));
        assert!(session_supports_hotkeys(Some("x11"), None));
        assert!(session_supports_hotkeys(None, None));
    }
}
