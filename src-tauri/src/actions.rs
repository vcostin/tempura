//! Timer actions reachable from outside the window: the tray menu, and the
//! command line (`tempura --toggle`), which the single-instance plugin hands to
//! the running app. Desktops where in-app global hotkeys can't work (Wayland)
//! bind these commands in their own keyboard settings.

use tauri::{AppHandle, Manager};

use crate::engine::EngineHandle;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    /// Start, pause or resume, like Space on the timer.
    Toggle,
    /// Skip to the next phase.
    Skip,
    /// Bring the window forward.
    Show,
}

/// The first action flag on a command line, if any.
pub fn parse_action<S: AsRef<str>>(args: &[S]) -> Option<Action> {
    args.iter().find_map(|arg| match arg.as_ref() {
        "--toggle" => Some(Action::Toggle),
        "--skip" => Some(Action::Skip),
        "--show" => Some(Action::Show),
        _ => None,
    })
}

pub fn run(app: &AppHandle, action: Action) {
    let engine = app.state::<EngineHandle>();
    match action {
        Action::Toggle => {
            let snap = engine.snapshot();
            let _ = if !snap.running {
                engine.start(app, None)
            } else if snap.paused {
                engine.resume_or_take_break(app)
            } else {
                engine.pause(app)
            };
        }
        Action::Skip => {
            if engine.snapshot().running {
                let _ = engine.skip(app);
            }
        }
        Action::Show if crate::tray::main_in_front(app) => crate::tray::hide_main(app),
        Action::Show => crate::tray::restore_main(app),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_action_flag_among_other_arguments() {
        assert_eq!(parse_action(&["tempura", "--toggle"]), Some(Action::Toggle));
        assert_eq!(parse_action(&["tempura", "--minimized", "--skip"]), Some(Action::Skip));
        assert_eq!(parse_action(&["/usr/bin/tempura", "--show"]), Some(Action::Show));
    }

    #[test]
    fn no_flag_means_no_action() {
        assert_eq!(parse_action(&["tempura"]), None);
        assert_eq!(parse_action(&["tempura", "--minimized"]), None);
        assert_eq!(parse_action::<&str>(&[]), None);
    }
}
