use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Phase {
    Idle,
    Focus,
    ShortBreak,
    LongBreak,
}

impl Phase {
    pub fn label(self) -> &'static str {
        match self {
            Phase::Idle => "Ready",
            Phase::Focus => "Focus",
            Phase::ShortBreak => "Short break",
            Phase::LongBreak => "Long break",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TechniqueKind {
    System,
    Custom,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Technique {
    pub id: String,
    pub name: String,
    pub kind: TechniqueKind,
    pub focus_secs: i64,
    pub short_break_secs: i64,
    pub long_break_secs: i64,
    pub cycles_before_long: i64,
    pub flow_ratio: Option<f64>,
    pub accent: Option<String>,
    pub mode: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TechniqueInput {
    pub name: String,
    pub focus_secs: i64,
    pub short_break_secs: i64,
    pub long_break_secs: i64,
    pub cycles_before_long: i64,
    pub flow_ratio: Option<f64>,
    pub accent: Option<String>,
    pub mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: String,
    pub notifications_enabled: bool,
    pub sound_enabled: bool,
    pub halfway_tick: bool,
    pub default_technique_id: String,
    pub start_minimized: bool,
    pub long_break_every_n: i64,
    pub flow_ratio: f64,
    pub working_on: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "batter".into(),
            notifications_enabled: true,
            sound_enabled: true,
            halfway_tick: false,
            default_technique_id: "classic".into(),
            start_minimized: false,
            long_break_every_n: 4,
            flow_ratio: 0.2,
            working_on: String::new(),
        }
    }
}

pub const THEME_IDS: &[&str] = &["batter", "mist", "grove", "dusk", "sandstone"];
pub const TECHNIQUE_MODES: &[&str] = &["classic", "flowtime", "hybrid"];
const NAME_MAX: usize = 80;
const ID_MAX: usize = 64;
const WORKING_ON_MAX: usize = 200;
const ACCENT_MAX: usize = 16;
const SECS_MAX: i64 = 8 * 60 * 60;
const CYCLES_MIN: i64 = 1;
const CYCLES_MAX: i64 = 12;
const FLOW_RATIO_MIN: f64 = 1.0 / 9.0;
const FLOW_RATIO_MAX: f64 = 1.0 / 3.0;

pub fn validate_id(id: &str) -> Result<(), String> {
    if id.is_empty() || id.len() > ID_MAX {
        return Err("invalid id".into());
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err("invalid id".into());
    }
    Ok(())
}

fn reject_control(s: &str, label: &str) -> Result<(), String> {
    if s.chars().any(|c| c.is_control()) {
        return Err(format!("{label} contains control characters"));
    }
    Ok(())
}

fn clamp_flow_ratio(ratio: f64) -> Result<f64, String> {
    if !ratio.is_finite() {
        return Err("flow ratio must be a finite number".into());
    }
    if ratio < FLOW_RATIO_MIN || ratio > FLOW_RATIO_MAX {
        return Err("flow ratio must be between 1/9 and 1/3".into());
    }
    Ok(ratio)
}

fn validate_secs(value: i64, label: &str, allow_zero: bool) -> Result<i64, String> {
    let min = if allow_zero { 0 } else { 1 };
    if value < min || value > SECS_MAX {
        return Err(format!("{label} must be between {min} and {SECS_MAX} seconds"));
    }
    Ok(value)
}

impl TechniqueInput {
    pub fn validated(mut self) -> Result<Self, String> {
        self.name = self.name.trim().to_string();
        if self.name.is_empty() {
            self.name = "Custom".into();
        }
        if self.name.chars().count() > NAME_MAX {
            return Err(format!("name must be at most {NAME_MAX} characters"));
        }
        reject_control(&self.name, "name")?;

        let mode = self
            .mode
            .as_deref()
            .unwrap_or("classic")
            .trim()
            .to_ascii_lowercase();
        if !TECHNIQUE_MODES.contains(&mode.as_str()) {
            return Err("mode must be classic, flowtime, or hybrid".into());
        }
        let allow_zero = mode == "flowtime";
        self.mode = Some(mode);

        self.focus_secs = validate_secs(self.focus_secs, "focus", allow_zero)?;
        self.short_break_secs = validate_secs(self.short_break_secs, "short break", true)?;
        self.long_break_secs = validate_secs(self.long_break_secs, "long break", true)?;

        if self.cycles_before_long < CYCLES_MIN || self.cycles_before_long > CYCLES_MAX {
            return Err(format!(
                "cycles before long break must be {CYCLES_MIN}–{CYCLES_MAX}"
            ));
        }

        if let Some(ratio) = self.flow_ratio {
            self.flow_ratio = Some(clamp_flow_ratio(ratio)?);
        }

        if let Some(accent) = self.accent.take() {
            let accent = accent.trim().to_string();
            if accent.is_empty() {
                self.accent = None;
            } else {
                if accent.len() > ACCENT_MAX {
                    return Err("accent is too long".into());
                }
                if !accent.chars().all(|c| c.is_ascii_hexdigit() || c == '#') {
                    return Err("accent must be a hex color".into());
                }
                self.accent = Some(accent);
            }
        }

        Ok(self)
    }
}

impl AppSettings {
    pub fn validated(mut self) -> Result<Self, String> {
        self.theme = self.theme.trim().to_ascii_lowercase();
        if !THEME_IDS.contains(&self.theme.as_str()) {
            return Err("unknown theme".into());
        }

        self.default_technique_id = self.default_technique_id.trim().to_string();
        validate_id(&self.default_technique_id)?;

        if self.long_break_every_n < CYCLES_MIN || self.long_break_every_n > CYCLES_MAX {
            return Err(format!(
                "long break every N must be {CYCLES_MIN}–{CYCLES_MAX}"
            ));
        }

        self.flow_ratio = clamp_flow_ratio(self.flow_ratio)?;

        self.working_on = self
            .working_on
            .chars()
            .filter(|c| *c == ' ' || *c == '\t' || !c.is_control())
            .take(WORKING_ON_MAX)
            .collect();

        Ok(self)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSnapshot {
    pub phase: Phase,
    pub remaining_secs: i64,
    pub elapsed_secs: i64,
    pub duration_secs: i64,
    pub paused: bool,
    pub running: bool,
    pub cycle: i64,
    pub technique_id: Option<String>,
    pub technique_name: Option<String>,
    pub mode: String,
    pub is_flow: bool,
    pub hybrid_switched: bool,
    pub working_on: String,
}

impl Default for TimerSnapshot {
    fn default() -> Self {
        Self {
            phase: Phase::Idle,
            remaining_secs: 0,
            elapsed_secs: 0,
            duration_secs: 0,
            paused: false,
            running: false,
            cycle: 0,
            technique_id: None,
            technique_name: None,
            mode: "classic".into(),
            is_flow: false,
            hybrid_switched: false,
            working_on: String::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DayStats {
    pub focus_secs_today: i64,
    pub completed_cycles_today: i64,
    pub sessions_today: i64,
    pub streak_days: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub privacy: String,
    /// True for `tauri:dev` / debug builds — gates developer-only UI.
    pub debug: bool,
    /// Which desktop notification backend is active (Debug page).
    pub notification_backend: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn classic_input() -> TechniqueInput {
        TechniqueInput {
            name: "Deep work".into(),
            focus_secs: 25 * 60,
            short_break_secs: 5 * 60,
            long_break_secs: 15 * 60,
            cycles_before_long: 4,
            flow_ratio: None,
            accent: Some("#6B8F71".into()),
            mode: Some("classic".into()),
        }
    }

    #[test]
    fn technique_accepts_normal_custom() {
        let v = classic_input().validated().unwrap();
        assert_eq!(v.name, "Deep work");
        assert_eq!(v.mode.as_deref(), Some("classic"));
    }

    #[test]
    fn technique_rejects_huge_focus() {
        let mut input = classic_input();
        input.focus_secs = 99 * 60 * 60;
        assert!(input.validated().is_err());
    }

    #[test]
    fn technique_rejects_unknown_mode() {
        let mut input = classic_input();
        input.mode = Some("shell".into());
        assert!(input.validated().is_err());
    }

    #[test]
    fn flowtime_allows_zero_focus() {
        let input = TechniqueInput {
            name: "Flow".into(),
            focus_secs: 0,
            short_break_secs: 0,
            long_break_secs: 0,
            cycles_before_long: 1,
            flow_ratio: Some(0.2),
            accent: None,
            mode: Some("flowtime".into()),
        };
        assert!(input.validated().is_ok());
    }

    #[test]
    fn settings_rejects_unknown_theme() {
        let mut s = AppSettings::default();
        s.theme = "not-a-theme".into();
        assert!(s.validated().is_err());
    }

    #[test]
    fn settings_truncates_working_on() {
        let mut s = AppSettings::default();
        s.working_on = "x".repeat(500);
        let v = s.validated().unwrap();
        assert_eq!(v.working_on.chars().count(), 200);
    }

    #[test]
    fn validate_id_allows_custom_uuid() {
        assert!(validate_id("custom-550e8400-e29b-41d4-a716-446655440000").is_ok());
        assert!(validate_id("../etc/passwd").is_err());
        assert!(validate_id("").is_err());
    }
}
