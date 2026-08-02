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
            theme: "mist".into(),
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
}
