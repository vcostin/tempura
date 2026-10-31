use crate::models::{
    AppSettings, DayBucket, GlobalHotkeys, DayStats, StatsRange, Technique, TechniqueInput, TechniqueKind,
    TechniqueMode, DEFAULT_FLOW_RATIO,
};
use crate::export::ExportRow;
use crate::stats::{group_focus, FocusRow, TOP_SHARES};
use chrono::{DateTime, Duration, Local, NaiveDate, NaiveDateTime, Timelike, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use thiserror::Error;
use uuid::Uuid;

/// id, name, focus, short break, long break, cycles before long, flow ratio, accent, mode
type SystemSeed<'a> = (&'a str, &'a str, i64, i64, i64, i64, Option<f64>, &'a str, TechniqueMode);

#[derive(Debug, Error)]
pub enum DbError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Message(String),
}

pub type DbResult<T> = Result<T, DbError>;

/// Best-effort `chmod`. Ignore errors (FAT, exotic mounts, vanished sidecars).
#[cfg(unix)]
fn chmod_unix(path: &Path, mode: u32) {
    use std::os::unix::fs::PermissionsExt;
    let Ok(meta) = std::fs::metadata(path) else {
        return;
    };
    let mut perms = meta.permissions();
    perms.set_mode(mode);
    let _ = std::fs::set_permissions(path, perms);
}

/// `0700` on the app-data directory. Never touch `/` or the process temp dir.
#[cfg(unix)]
fn restrict_unix_app_data_dir(dir: &Path) {
    if dir.as_os_str().is_empty() || dir == Path::new("/") {
        return;
    }
    if dir == std::env::temp_dir() {
        return;
    }
    chmod_unix(dir, 0o700);
}

/// `0600` on the DB and WAL/SHM sidecars when they exist.
#[cfg(unix)]
fn restrict_unix_db_files(path: &Path) {
    chmod_unix(path, 0o600);
    let base = path.as_os_str();
    chmod_unix(Path::new(&format!("{}-wal", base.to_string_lossy())), 0o600);
    chmod_unix(Path::new(&format!("{}-shm", base.to_string_lossy())), 0o600);
}

/// Map a naive local wall time through DST folds/gaps without panicking.
fn naive_to_local(naive: NaiveDateTime) -> DateTime<Local> {
    match naive.and_local_timezone(Local) {
        chrono::LocalResult::Single(dt) => dt,
        chrono::LocalResult::Ambiguous(earliest, _) => earliest,
        chrono::LocalResult::None => {
            let mut shifted = naive;
            for _ in 0..8 {
                shifted += Duration::minutes(15);
                match shifted.and_local_timezone(Local) {
                    chrono::LocalResult::Single(dt) | chrono::LocalResult::Ambiguous(dt, _) => {
                        return dt;
                    }
                    chrono::LocalResult::None => {}
                }
            }
            DateTime::<Utc>::from_naive_utc_and_offset(naive, Utc).with_timezone(&Local)
        }
    }
}

fn local_day_start_utc(day: NaiveDate) -> DateTime<Utc> {
    naive_to_local(day.and_hms_opt(0, 0, 0).expect("midnight")).with_timezone(&Utc)
}

fn local_from_rfc3339(started_at: &str) -> Option<NaiveDateTime> {
    DateTime::parse_from_rfc3339(started_at)
        .ok()
        .map(|dt| dt.with_timezone(&Local).naive_local())
}

fn local_date_from_rfc3339(started_at: &str) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(started_at)
        .ok()
        .map(|dt| dt.with_timezone(&Local).date_naive())
}

/// The settings row: `AppSettings` as JSON.
const SETTINGS_KEY: &str = "app";

type Migration = fn(&Connection) -> DbResult<()>;

/// Schema changes in order; `PRAGMA user_version` counts how many have run.
/// Append new ones at the end and never change one that has shipped.
const MIGRATIONS: &[Migration] = &[
    migrate_v1_baseline,
    migrate_v2_settings_json,
    migrate_v3_focus_by_day,
    migrate_v4_focus_by_hour,
];

/// The schema as it stood before versioning. Every step tolerates a database
/// that already has it, so pre-versioning databases pass through unchanged.
fn migrate_v1_baseline(conn: &Connection) -> DbResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS techniques (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            kind TEXT NOT NULL CHECK(kind IN ('system', 'custom')),
            focus_secs INTEGER NOT NULL,
            short_break_secs INTEGER NOT NULL,
            long_break_secs INTEGER NOT NULL,
            cycles_before_long INTEGER NOT NULL DEFAULT 4,
            flow_ratio REAL,
            accent TEXT,
            mode TEXT NOT NULL DEFAULT 'classic',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            technique_id TEXT,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            focus_secs_completed INTEGER NOT NULL DEFAULT 0,
            completed_cycles INTEGER NOT NULL DEFAULT 0,
            interrupted INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(technique_id) REFERENCES techniques(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
        ",
    )?;
    conn.execute_batch(
        "DELETE FROM settings WHERE key IN ('flow_ratio', 'long_break_every_n');",
    )?;
    // What each session was on: added after release, so older databases get them here.
    add_column_if_missing(conn, "sessions", "label", "TEXT NOT NULL DEFAULT ''")?;
    add_column_if_missing(conn, "sessions", "technique_name", "TEXT")?;
    // When the session last saved progress: where a crash cut it off.
    add_column_if_missing(conn, "sessions", "last_seen_at", "TEXT")?;
    Ok(())
}

/// Settings move from one row per setting into one JSON row, so a new setting
/// is a field on `AppSettings` and nothing here.
fn migrate_v2_settings_json(conn: &Connection) -> DbResult<()> {
    let settings = read_legacy_settings(conn)?;
    let json = serde_json::to_string(&settings).map_err(|e| DbError::Message(e.to_string()))?;
    conn.execute("DELETE FROM settings", [])?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)",
        params![SETTINGS_KEY, json],
    )?;
    Ok(())
}

/// Focus per local day for each session, so a session that runs past midnight
/// counts on both days. Sessions from before get their focus on the day they
/// started, which is where stats showed it until now.
fn migrate_v3_focus_by_day(conn: &Connection) -> DbResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE session_days (
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            day TEXT NOT NULL,
            focus_secs INTEGER NOT NULL,
            PRIMARY KEY (session_id, day)
        );
        CREATE INDEX idx_session_days_day ON session_days(day);
        ",
    )?;
    let sessions: Vec<(String, String, i64)> = conn
        .prepare("SELECT id, started_at, focus_secs_completed FROM sessions WHERE focus_secs_completed > 0")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;
    for (id, started_at, focus) in sessions {
        let Some(day) = local_date_from_rfc3339(&started_at) else {
            eprintln!("tempura: session {id} has an unreadable start time; its focus stays off the daily stats");
            continue;
        };
        conn.execute(
            "INSERT INTO session_days (session_id, day, focus_secs) VALUES (?1, ?2, ?3)",
            params![id, day_key(day), focus],
        )?;
    }
    Ok(())
}

/// How a day is stored: sorts and compares as text.
fn day_key(day: NaiveDate) -> String {
    day.format("%Y-%m-%d").to_string()
}

/// Focus and finished cycles per local hour for each session, replacing the
/// per-day table: day totals add up the hours, and the hours also show when in
/// the day focus happens. Days a session started on put their focus in the hour
/// it started (all that was known); a later day's focus, which only dev builds
/// of migration 3 recorded, goes to midnight. Cycles go with the start hour.
fn migrate_v4_focus_by_hour(conn: &Connection) -> DbResult<()> {
    conn.execute_batch(
        "
        CREATE TABLE session_hours (
            session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            day TEXT NOT NULL,
            hour INTEGER NOT NULL CHECK (hour BETWEEN 0 AND 23),
            focus_secs INTEGER NOT NULL DEFAULT 0,
            cycles INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (session_id, day, hour)
        );
        CREATE INDEX idx_session_hours_day ON session_hours(day);
        ",
    )?;
    let sessions: Vec<(String, String, i64)> = conn
        .prepare("SELECT id, started_at, completed_cycles FROM sessions")?
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;
    for (id, started_at, cycles) in sessions {
        let Some(start) = local_from_rfc3339(&started_at) else {
            eprintln!("tempura: session {id} has an unreadable start time; its focus stays off the hourly stats");
            continue;
        };
        let start_day = day_key(start.date());
        let start_hour = start.hour() as i64;
        let days: Vec<(String, i64)> = conn
            .prepare("SELECT day, focus_secs FROM session_days WHERE session_id = ?1")?
            .query_map(params![id], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<_, _>>()?;
        for (day, focus) in days {
            let hour = if day == start_day { start_hour } else { 0 };
            add_to_hour(conn, &id, &day, hour, focus, 0)?;
        }
        if cycles > 0 {
            add_to_hour(conn, &id, &start_day, start_hour, 0, cycles)?;
        }
    }
    conn.execute_batch("DROP TABLE session_days;")?;
    Ok(())
}

fn add_to_hour(conn: &Connection, session_id: &str, day: &str, hour: i64, focus: i64, cycles: i64) -> DbResult<()> {
    conn.execute(
        "INSERT INTO session_hours (session_id, day, hour, focus_secs, cycles) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(session_id, day, hour) DO UPDATE SET
             focus_secs = focus_secs + excluded.focus_secs,
             cycles = cycles + excluded.cycles",
        params![session_id, day, hour, focus, cycles],
    )?;
    Ok(())
}

/// Bring a session's hours up to its `focus` and `cycles` totals. No time
/// ranges: whatever changed since the last save goes to the local hour of this
/// save (`at`). Saves come at least once a minute during focus, so at most that
/// much lands in a neighbouring hour. Anything taken back (a reset focus) comes
/// off the latest hours first. Afterwards the hours add up to the totals.
fn record_progress(conn: &Connection, session_id: &str, focus: i64, cycles: i64, at: NaiveDateTime) -> DbResult<()> {
    let (recorded_focus, recorded_cycles): (i64, i64) = conn.query_row(
        "SELECT COALESCE(SUM(focus_secs), 0), COALESCE(SUM(cycles), 0) FROM session_hours WHERE session_id = ?1",
        params![session_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let focus_change = focus.max(0) - recorded_focus;
    let cycles_change = cycles.max(0) - recorded_cycles;
    let (day, hour) = (day_key(at.date()), at.hour() as i64);
    add_to_hour(conn, session_id, &day, hour, focus_change.max(0), cycles_change.max(0))?;
    take_back(conn, session_id, "focus_secs", -focus_change)?;
    take_back(conn, session_id, "cycles", -cycles_change)?;
    conn.execute(
        "DELETE FROM session_hours WHERE session_id = ?1 AND focus_secs = 0 AND cycles = 0",
        params![session_id],
    )?;
    Ok(())
}

/// Take `amount` of `column` back from a session's latest hours first.
fn take_back(conn: &Connection, session_id: &str, column: &str, mut amount: i64) -> DbResult<()> {
    if amount <= 0 {
        return Ok(());
    }
    let hours: Vec<(String, i64, i64)> = conn
        .prepare(&format!(
            "SELECT day, hour, {column} FROM session_hours
             WHERE session_id = ?1 AND {column} > 0 ORDER BY day DESC, hour DESC"
        ))?
        .query_map(params![session_id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))?
        .collect::<Result<_, _>>()?;
    for (day, hour, value) in hours {
        let cut = value.min(amount);
        conn.execute(
            &format!("UPDATE session_hours SET {column} = {column} - ?4 WHERE session_id = ?1 AND day = ?2 AND hour = ?3"),
            params![session_id, day, hour, cut],
        )?;
        amount -= cut;
        if amount == 0 {
            break;
        }
    }
    Ok(())
}

fn add_column_if_missing(conn: &Connection, table: &str, column: &str, decl: &str) -> DbResult<()> {
    let exists: bool = conn.query_row(
        &format!("SELECT COUNT(*) > 0 FROM pragma_table_info('{table}') WHERE name = ?1"),
        params![column],
        |row| row.get(0),
    )?;
    if !exists {
        conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {decl};"))?;
    }
    Ok(())
}

/// Settings as migration 1 left them: one row each, booleans as "true",
/// hidden ids comma-joined, the portal flag as "1". Only migration 2 reads this.
fn read_legacy_settings(conn: &Connection) -> DbResult<AppSettings> {
    let get = |key: &str| -> DbResult<Option<String>> {
        conn.query_row("SELECT value FROM settings WHERE key = ?1", params![key], |row| row.get(0))
            .optional()
            .map_err(Into::into)
    };
    let defaults = AppSettings::default();
    Ok(AppSettings {
        theme: get("theme")?.unwrap_or(defaults.theme),
        notifications_enabled: get("notifications_enabled")?
            .as_deref()
            .map(|v| v == "true")
            .unwrap_or(defaults.notifications_enabled),
        sound_enabled: get("sound_enabled")?
            .as_deref()
            .map(|v| v == "true")
            .unwrap_or(defaults.sound_enabled),
        halfway_tick: get("halfway_tick")?
            .as_deref()
            .map(|v| v == "true")
            .unwrap_or(defaults.halfway_tick),
        default_technique_id: get("default_technique_id")?
            .unwrap_or(defaults.default_technique_id),
        start_minimized: get("start_minimized")?
            .as_deref()
            .map(|v| v == "true")
            .unwrap_or(defaults.start_minimized),
        working_on: get("working_on")?
            .unwrap_or(defaults.working_on),
        locale: get("locale")?.unwrap_or(defaults.locale),
        check_updates_on_launch: get("check_updates_on_launch")?
            .as_deref()
            .map(|v| v == "true")
            .unwrap_or(defaults.check_updates_on_launch),
        // Comma-joined: technique ids never contain commas (see `validate_id`).
        global_hotkeys: GlobalHotkeys {
            toggle: get("hotkey_toggle")?.unwrap_or_default(),
            skip: get("hotkey_skip")?.unwrap_or_default(),
            show: get("hotkey_show")?.unwrap_or_default(),
            portal: get("hotkey_portal")?.as_deref() == Some("1"),
        },
        hidden_technique_ids: get("hidden_technique_ids")?
            .map(|v| {
                v.split(',')
                    .filter(|id| !id.is_empty())
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or(defaults.hidden_technique_ids),
        auto_continue: get("auto_continue")?
            .as_deref()
            .map(|v| v == "true")
            .unwrap_or(defaults.auto_continue),
        menu_bar_countdown: get("menu_bar_countdown")?
            .as_deref()
            .map(|v| v == "true")
            .unwrap_or(defaults.menu_bar_countdown),
    })
}

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> DbResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| DbError::Message(format!("create app data dir: {e}")))?;
            #[cfg(unix)]
            restrict_unix_app_data_dir(parent);
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "
            PRAGMA foreign_keys = ON;
            PRAGMA journal_mode = WAL;
            ",
        )?;
        let db = Self { conn };
        db.migrate()?;
        db.close_orphan_sessions()?;
        db.seed_system_techniques()?;
        #[cfg(unix)]
        restrict_unix_db_files(path);
        Ok(db)
    }

    /// Bring the schema up to date: run each migration the database hasn't had,
    /// in order, each in its own transaction with the version it reaches.
    fn migrate(&self) -> DbResult<()> {
        let current: usize = self
            .conn
            .pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0))?
            .try_into()
            .unwrap_or(0);
        if current > MIGRATIONS.len() {
            // Written by a newer Tempura: leave its schema alone.
            eprintln!("tempura: database schema {current} is newer than this build knows ({})", MIGRATIONS.len());
            return Ok(());
        }
        for (done, migration) in MIGRATIONS.iter().enumerate().skip(current) {
            let tx = self.conn.unchecked_transaction()?;
            migration(&tx)?;
            tx.pragma_update(None, "user_version", (done + 1) as i64)?;
            tx.commit()?;
        }
        Ok(())
    }

    /// Sessions still open at launch were cut off by a crash, a kill, or logout:
    /// nothing is running yet. End them where they last saved, as interrupted.
    fn close_orphan_sessions(&self) -> DbResult<()> {
        self.conn.execute(
            "UPDATE sessions SET ended_at = COALESCE(last_seen_at, started_at), interrupted = 1
             WHERE ended_at IS NULL",
            [],
        )?;
        Ok(())
    }

    fn seed_system_techniques(&self) -> DbResult<()> {
        let now = Utc::now().to_rfc3339();
        let seeds: &[SystemSeed] = &[
            (
                "classic",
                "Classic",
                25 * 60,
                5 * 60,
                15 * 60,
                4,
                None,
                "#6B8F71",
                TechniqueMode::Classic,
            ),
            (
                "sprint",
                "Sprint",
                15 * 60,
                3 * 60,
                15 * 60,
                4,
                None,
                "#C17B4A",
                TechniqueMode::Classic,
            ),
            (
                "deep",
                "Deep",
                50 * 60,
                10 * 60,
                20 * 60,
                3,
                None,
                "#4A6FA5",
                TechniqueMode::Classic,
            ),
            (
                "fifty-two-seventeen",
                "52/17",
                52 * 60,
                17 * 60,
                30 * 60,
                2,
                None,
                "#7A6B8F",
                TechniqueMode::Classic,
            ),
            (
                "ultradian",
                "Ultradian",
                90 * 60,
                20 * 60,
                30 * 60,
                2,
                None,
                "#3D7A6E",
                TechniqueMode::Classic,
            ),
            (
                "flowtime",
                "Flowtime",
                0,
                0,
                0,
                1,
                Some(DEFAULT_FLOW_RATIO),
                "#B08968",
                TechniqueMode::Flowtime,
            ),
            (
                "hybrid",
                "Hybrid",
                25 * 60,
                5 * 60,
                15 * 60,
                4,
                Some(DEFAULT_FLOW_RATIO),
                "#8B6B61",
                TechniqueMode::Hybrid,
            ),
        ];

        for (id, name, focus, short_b, long_b, cycles, flow, accent, mode) in seeds {
            self.conn.execute(
                "
                INSERT INTO techniques (
                    id, name, kind, focus_secs, short_break_secs, long_break_secs,
                    cycles_before_long, flow_ratio, accent, mode, created_at, updated_at
                ) VALUES (?1, ?2, 'system', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    focus_secs = excluded.focus_secs,
                    short_break_secs = excluded.short_break_secs,
                    long_break_secs = excluded.long_break_secs,
                    cycles_before_long = excluded.cycles_before_long,
                    flow_ratio = excluded.flow_ratio,
                    accent = excluded.accent,
                    mode = excluded.mode,
                    updated_at = excluded.updated_at
                ",
                params![id, name, focus, short_b, long_b, cycles, flow, accent, mode, now],
            )?;
        }
        Ok(())
    }

    /// The saved settings; defaults for anything not saved yet, or if the saved
    /// copy can't be read.
    pub fn get_settings(&self) -> DbResult<AppSettings> {
        let stored: Option<String> = self
            .conn
            .query_row("SELECT value FROM settings WHERE key = ?1", params![SETTINGS_KEY], |row| row.get(0))
            .optional()?;
        let mut settings = match stored.as_deref().map(serde_json::from_str::<AppSettings>) {
            Some(Ok(settings)) => settings,
            Some(Err(e)) => {
                eprintln!("tempura: saved settings unreadable, using defaults: {e}");
                AppSettings::default()
            }
            None => AppSettings::default(),
        };
        // Reserved ones saved before they were refused read as not set.
        let hotkeys = &mut settings.global_hotkeys;
        for value in [&mut hotkeys.toggle, &mut hotkeys.skip, &mut hotkeys.show] {
            *value = crate::hotkeys::usable(std::mem::take(value));
        }
        Ok(settings)
    }

    /// One row, one write: settings are saved whole or not at all.
    pub fn update_settings(&self, settings: &AppSettings) -> DbResult<()> {
        let json = serde_json::to_string(settings).map_err(|e| DbError::Message(e.to_string()))?;
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![SETTINGS_KEY, json],
        )?;
        Ok(())
    }

    fn map_technique(row: &rusqlite::Row<'_>) -> rusqlite::Result<Technique> {
        let kind_str: String = row.get(2)?;
        let kind = if kind_str == "system" {
            TechniqueKind::System
        } else {
            TechniqueKind::Custom
        };
        Ok(Technique {
            id: row.get(0)?,
            name: row.get(1)?,
            kind,
            focus_secs: row.get(3)?,
            short_break_secs: row.get(4)?,
            long_break_secs: row.get(5)?,
            cycles_before_long: row.get(6)?,
            flow_ratio: row.get(7)?,
            accent: row.get(8)?,
            mode: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }

    pub fn list_techniques(&self) -> DbResult<Vec<Technique>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT id, name, kind, focus_secs, short_break_secs, long_break_secs,
                   cycles_before_long, flow_ratio, accent, mode, created_at, updated_at
            FROM techniques
            ORDER BY
              CASE kind WHEN 'system' THEN 0 ELSE 1 END,
              name COLLATE NOCASE
            ",
        )?;
        let rows = stmt
            .query_map([], Self::map_technique)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }

    pub fn get_technique(&self, id: &str) -> DbResult<Option<Technique>> {
        self.conn
            .query_row(
                "
                SELECT id, name, kind, focus_secs, short_break_secs, long_break_secs,
                       cycles_before_long, flow_ratio, accent, mode, created_at, updated_at
                FROM techniques WHERE id = ?1
                ",
                params![id],
                Self::map_technique,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn create_technique(&self, input: TechniqueInput) -> DbResult<Technique> {
        let id = format!("custom-{}", Uuid::new_v4());
        let now = Utc::now().to_rfc3339();
        let mode = input.mode.unwrap_or_default();
        self.conn.execute(
            "
            INSERT INTO techniques (
                id, name, kind, focus_secs, short_break_secs, long_break_secs,
                cycles_before_long, flow_ratio, accent, mode, created_at, updated_at
            ) VALUES (?1, ?2, 'custom', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)
            ",
            params![
                id,
                input.name,
                input.focus_secs,
                input.short_break_secs,
                input.long_break_secs,
                input.cycles_before_long,
                input.flow_ratio,
                input.accent,
                mode,
                now
            ],
        )?;
        self.get_technique(&id)?
            .ok_or_else(|| DbError::Message("failed to load created technique".into()))
    }

    pub fn update_technique(&self, id: &str, input: TechniqueInput) -> DbResult<Technique> {
        let existing = self
            .get_technique(id)?
            .ok_or_else(|| DbError::Message("technique not found".into()))?;
        if matches!(existing.kind, TechniqueKind::System) {
            return Err(DbError::Message("system techniques are immutable".into()));
        }
        let now = Utc::now().to_rfc3339();
        let mode = input.mode.unwrap_or(existing.mode);
        self.conn.execute(
            "
            UPDATE techniques SET
                name = ?1,
                focus_secs = ?2,
                short_break_secs = ?3,
                long_break_secs = ?4,
                cycles_before_long = ?5,
                flow_ratio = ?6,
                accent = ?7,
                mode = ?8,
                updated_at = ?9
            WHERE id = ?10 AND kind = 'custom'
            ",
            params![
                input.name,
                input.focus_secs,
                input.short_break_secs,
                input.long_break_secs,
                input.cycles_before_long,
                input.flow_ratio,
                input.accent,
                mode,
                now,
                id
            ],
        )?;
        self.get_technique(id)?
            .ok_or_else(|| DbError::Message("technique not found after update".into()))
    }

    pub fn delete_technique(&self, id: &str) -> DbResult<()> {
        let existing = self
            .get_technique(id)?
            .ok_or_else(|| DbError::Message("technique not found".into()))?;
        if matches!(existing.kind, TechniqueKind::System) {
            return Err(DbError::Message(
                "system techniques cannot be deleted".into(),
            ));
        }
        self.conn.execute(
            "DELETE FROM techniques WHERE id = ?1 AND kind = 'custom'",
            params![id],
        )?;
        Ok(())
    }

    pub fn start_session(&self, technique: &Technique, label: &str) -> DbResult<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "
            INSERT INTO sessions (
                id, technique_id, technique_name, label, started_at, last_seen_at,
                focus_secs_completed, completed_cycles, interrupted
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0, 0, 0)
            ",
            params![id, technique.id, technique.name, label, now],
        )?;
        Ok(id)
    }

    pub fn end_session(
        &self,
        session_id: &str,
        focus_secs: i64,
        completed_cycles: i64,
        interrupted: bool,
        label: &str,
    ) -> DbResult<()> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.unchecked_transaction()?;
        let changed = tx.execute(
            "
            UPDATE sessions SET
                ended_at = ?1,
                focus_secs_completed = ?2,
                completed_cycles = ?3,
                interrupted = ?4,
                label = ?5
            WHERE id = ?6 AND ended_at IS NULL
            ",
            params![
                now,
                focus_secs.max(0),
                completed_cycles,
                if interrupted { 1 } else { 0 },
                label,
                session_id
            ],
        )?;
        if changed > 0 {
            record_progress(&tx, session_id, focus_secs, completed_cycles, Local::now().naive_local())?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn bump_session_progress(
        &self,
        session_id: &str,
        focus_secs: i64,
        completed_cycles: i64,
        label: &str,
    ) -> DbResult<()> {
        let now = Utc::now().to_rfc3339();
        let tx = self.conn.unchecked_transaction()?;
        let changed = tx.execute(
            "
            UPDATE sessions SET
                focus_secs_completed = ?1,
                completed_cycles = ?2,
                label = ?3,
                last_seen_at = ?4
            WHERE id = ?5 AND ended_at IS NULL
            ",
            params![focus_secs.max(0), completed_cycles, label, now, session_id],
        )?;
        if changed > 0 {
            record_progress(&tx, session_id, focus_secs, completed_cycles, Local::now().naive_local())?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn day_stats(&self) -> DbResult<DayStats> {
        let today = Local::now().date_naive();
        let start_utc = local_day_start_utc(today).to_rfc3339();

        // Focus and cycles count in the hours they happened; a session counts on
        // each day it was active, and on the day it started.
        let (focus_secs_today, completed_cycles_today): (i64, i64) = self.conn.query_row(
            "SELECT COALESCE(SUM(focus_secs), 0), COALESCE(SUM(cycles), 0) FROM session_hours WHERE day = ?1",
            params![day_key(today)],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        let sessions_today: i64 = self.conn.query_row(
            "SELECT COUNT(*) FROM (
                SELECT session_id FROM session_hours WHERE day = ?1
                UNION
                SELECT id FROM sessions WHERE started_at >= ?2
            )",
            params![day_key(today), start_utc],
            |row| row.get(0),
        )?;

        let streak_days = self.compute_streak(today)?;

        Ok(DayStats {
            focus_secs_today,
            completed_cycles_today,
            sessions_today,
            streak_days,
        })
    }

    /// Inclusive local-day window ending today (`days` = 1 today, 7 last week, 30 last month).
    pub fn range_stats(&self, days: i64) -> DbResult<StatsRange> {
        let days = days.clamp(1, 366);
        let today = Local::now().date_naive();
        let start_day = today - Duration::days(days - 1);
        let start_utc = local_day_start_utc(start_day).to_rfc3339();

        let (first, last) = (day_key(start_day), day_key(today));
        // Per day: focus and cycles from the hours they happened in, and the
        // sessions active that day or started on it.
        let mut map: HashMap<NaiveDate, (i64, i64, HashSet<String>)> = HashMap::new();
        let mut all_sessions: HashSet<String> = HashSet::new();
        let active: Vec<(String, String, i64, i64)> = self
            .conn
            .prepare(
                "SELECT session_id, day, SUM(focus_secs), SUM(cycles) FROM session_hours
                 WHERE day BETWEEN ?1 AND ?2 GROUP BY session_id, day",
            )?
            .query_map(params![first, last], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))?
            .collect::<Result<_, _>>()?;
        for (id, day, focus, cycles) in active {
            let Ok(d) = NaiveDate::parse_from_str(&day, "%Y-%m-%d") else { continue };
            let e = map.entry(d).or_default();
            e.0 += focus;
            e.1 += cycles;
            e.2.insert(id.clone());
            all_sessions.insert(id);
        }
        let started: Vec<(String, String)> = self
            .conn
            .prepare("SELECT id, started_at FROM sessions WHERE started_at >= ?1")?
            .query_map(params![start_utc], |row| Ok((row.get(0)?, row.get(1)?)))?
            .collect::<Result<_, _>>()?;
        for (id, started_at) in started {
            let Some(d) = local_date_from_rfc3339(&started_at) else { continue };
            if d < start_day || d > today {
                continue;
            }
            map.entry(d).or_default().2.insert(id.clone());
            all_sessions.insert(id);
        }

        // Each session's focus inside the window, oldest first: the grouping shows
        // each label's most recent spelling.
        type Share = (String, Option<String>, String, i64);
        let shares: Vec<Share> = self
            .conn
            .prepare(
                "
                SELECT s.label, s.technique_id, COALESCE(s.technique_name, t.name, ''), SUM(d.focus_secs)
                FROM session_hours d
                JOIN sessions s ON s.id = d.session_id
                LEFT JOIN techniques t ON t.id = s.technique_id
                WHERE d.day BETWEEN ?1 AND ?2
                GROUP BY s.id
                ORDER BY s.started_at
                ",
            )?
            .query_map(params![first, last], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))?
            .collect::<Result<_, _>>()?;
        let mut labels = Vec::new();
        let mut techniques = Vec::new();
        for (label, technique_id, technique_name, focus) in shares {
            labels.push(FocusRow { id: None, name: label, focus_secs: focus });
            techniques.push(FocusRow { id: technique_id, name: technique_name, focus_secs: focus });
        }

        let mut buckets = Vec::with_capacity(days as usize);
        let mut focus_secs = 0i64;
        let mut completed_cycles = 0i64;
        // Distinct: a session active on two days counts once in the total.
        let sessions = all_sessions.len() as i64;
        let mut cursor = start_day;
        while cursor <= today {
            let (f, c, s) = map
                .get(&cursor)
                .map(|(f, c, ids)| (*f, *c, ids.len() as i64))
                .unwrap_or((0, 0, 0));
            focus_secs += f;
            completed_cycles += c;
            buckets.push(DayBucket {
                date: cursor.format("%Y-%m-%d").to_string(),
                focus_secs: f,
                completed_cycles: c,
                sessions: s,
            });
            cursor += Duration::days(1);
        }

        Ok(StatsRange {
            days,
            focus_secs,
            completed_cycles,
            sessions,
            streak_days: self.compute_streak(today)?,
            buckets,
            by_label: group_focus(labels, TOP_SHARES),
            by_technique: group_focus(techniques, TOP_SHARES),
        })
    }

    fn compute_streak(&self, today: NaiveDate) -> DbResult<i64> {
        // Days with any focus, newest first.
        let mut stmt = self.conn.prepare(
            "SELECT DISTINCT day FROM session_hours WHERE focus_secs > 0 ORDER BY day DESC",
        )?;
        let dates: Vec<NaiveDate> = stmt
            .query_map([], |row| row.get::<_, String>(0))?
            .collect::<Result<Vec<_>, _>>()?
            .into_iter()
            .filter_map(|d| NaiveDate::parse_from_str(&d, "%Y-%m-%d").ok())
            .collect();

        if dates.is_empty() {
            return Ok(0);
        }

        let mut streak = 0i64;
        let mut cursor = today;
        // Allow streak to start from yesterday if nothing today yet
        if !dates.contains(&today) {
            cursor = today - Duration::days(1);
            if !dates.contains(&cursor) {
                return Ok(0);
            }
        }

        for d in dates {
            if d == cursor {
                streak += 1;
                cursor -= Duration::days(1);
            } else if d < cursor {
                break;
            }
        }
        Ok(streak)
    }

    /// Every session, oldest first, for the CSV/JSON export.
    pub fn export_rows(&self) -> DbResult<Vec<ExportRow>> {
        let mut stmt = self.conn.prepare(
            "
            SELECT s.started_at, s.ended_at, s.label, s.technique_id,
                   COALESCE(s.technique_name, t.name, ''),
                   s.focus_secs_completed, s.completed_cycles, s.interrupted
            FROM sessions s
            LEFT JOIN techniques t ON t.id = s.technique_id
            ORDER BY s.started_at
            ",
        )?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ExportRow {
                    started_at: row.get(0)?,
                    ended_at: row.get(1)?,
                    label: row.get(2)?,
                    technique_id: row.get(3)?,
                    technique: row.get(4)?,
                    focus_secs: row.get(5)?,
                    completed_cycles: row.get(6)?,
                    interrupted: row.get::<_, i64>(7)? != 0,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    }
}

#[cfg(test)]
mod range_stats_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db() -> Database {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("tempura-stats-{nanos}.sqlite"));
        let _ = std::fs::remove_file(&path);
        Database::open(&path).expect("open temp db")
    }

    #[test]
    fn hidden_technique_ids_round_trip() {
        let db = temp_db();
        assert!(db.get_settings().unwrap().hidden_technique_ids.is_empty());
        let mut s = db.get_settings().unwrap();
        s.hidden_technique_ids = vec!["deep".into(), "custom_1".into()];
        db.update_settings(&s).unwrap();
        assert_eq!(
            db.get_settings().unwrap().hidden_technique_ids,
            vec!["deep".to_string(), "custom_1".to_string()]
        );
        s.hidden_technique_ids.clear();
        db.update_settings(&s).unwrap();
        assert!(db.get_settings().unwrap().hidden_technique_ids.is_empty());
    }

    #[test]
    fn range_stats_fills_empty_days() {
        let db = temp_db();
        let range = db.range_stats(7).expect("range");
        assert_eq!(range.days, 7);
        assert_eq!(range.buckets.len(), 7);
        assert_eq!(range.focus_secs, 0);
        assert_eq!(range.sessions, 0);
    }

    #[test]
    fn range_stats_clamps_days() {
        let db = temp_db();
        assert_eq!(db.range_stats(0).unwrap().days, 1);
        assert_eq!(db.range_stats(400).unwrap().days, 366);
        assert_eq!(db.range_stats(400).unwrap().buckets.len(), 366);
    }

    fn local_hms_utc(day: NaiveDate, hour: u32, min: u32, sec: u32) -> DateTime<Utc> {
        naive_to_local(day.and_hms_opt(hour, min, sec).expect("hms")).with_timezone(&Utc)
    }

    /// A finished session with all its focus and cycles in the hour it started.
    fn insert_session(db: &Database, started: DateTime<Utc>, focus: i64, cycles: i64) -> String {
        let id = Uuid::new_v4().to_string();
        db.conn
            .execute(
                "
                INSERT INTO sessions (
                    id, technique_id, started_at, focus_secs_completed, completed_cycles, interrupted
                ) VALUES (?1, 'classic', ?2, ?3, ?4, 0)
                ",
                params![id, started.to_rfc3339(), focus, cycles],
            )
            .expect("insert session");
        record_progress(&db.conn, &id, focus, cycles, started.with_timezone(&Local).naive_local())
            .expect("record progress");
        id
    }

    /// A session's hours: (day, hour, focus, cycles).
    fn hours_of(db: &Database, id: &str) -> Vec<(String, i64, i64, i64)> {
        let mut stmt = db
            .conn
            .prepare(
                "SELECT day, hour, focus_secs, cycles FROM session_hours WHERE session_id = ?1 ORDER BY day, hour",
            )
            .unwrap();
        stmt.query_map(params![id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    fn focus_of(db: &Database, id: &str) -> i64 {
        hours_of(db, id).iter().map(|h| h.2).sum()
    }

    fn at(day: NaiveDate, hour: u32, min: u32) -> NaiveDateTime {
        day.and_hms_opt(hour, min, 0).unwrap()
    }

    #[test]
    fn focus_and_cycles_go_to_the_hour_of_each_save() {
        let db = temp_db();
        let today = Local::now().date_naive();
        let yesterday = today - Duration::days(1);
        // Started at 22:40 yesterday: saves before midnight, then after.
        let id = insert_session(&db, local_hms_utc(yesterday, 22, 40, 0), 0, 0);
        record_progress(&db.conn, &id, 20 * 60, 0, at(yesterday, 22, 59)).unwrap();
        record_progress(&db.conn, &id, 25 * 60, 1, at(yesterday, 23, 5)).unwrap();
        record_progress(&db.conn, &id, 80 * 60, 1, at(yesterday, 23, 59)).unwrap();
        record_progress(&db.conn, &id, 81 * 60, 1, at(today, 0, 1)).unwrap();
        record_progress(&db.conn, &id, 110 * 60, 2, at(today, 0, 30)).unwrap();
        assert_eq!(
            hours_of(&db, &id),
            vec![
                (day_key(yesterday), 22, 20 * 60, 0),
                (day_key(yesterday), 23, 60 * 60, 1),
                (day_key(today), 0, 30 * 60, 1),
            ]
        );

        let range = db.range_stats(2).unwrap();
        assert_eq!((range.buckets[0].focus_secs, range.buckets[1].focus_secs), (80 * 60, 30 * 60));
        assert_eq!((range.buckets[0].completed_cycles, range.buckets[1].completed_cycles), (1, 1));
        // Active on both days, so it counts on both, and once in the total.
        assert_eq!((range.buckets[0].sessions, range.buckets[1].sessions), (1, 1));
        assert_eq!(range.sessions, 1);
        assert_eq!(range.focus_secs, 110 * 60);
        assert_eq!(range.streak_days, 2);
        let today_stats = db.day_stats().unwrap();
        assert_eq!(
            (today_stats.focus_secs_today, today_stats.completed_cycles_today, today_stats.sessions_today),
            (30 * 60, 1, 1)
        );
    }

    #[test]
    fn focus_taken_back_comes_off_the_latest_hours() {
        let db = temp_db();
        let today = Local::now().date_naive();
        let yesterday = today - Duration::days(1);
        let id = insert_session(&db, local_hms_utc(yesterday, 23, 0, 0), 0, 0);
        record_progress(&db.conn, &id, 40 * 60, 1, at(yesterday, 23, 40)).unwrap();
        record_progress(&db.conn, &id, 50 * 60, 1, at(today, 0, 10)).unwrap();
        // A reset focus: back to 35 minutes, more than today had. Cycles stay.
        record_progress(&db.conn, &id, 35 * 60, 1, at(today, 0, 11)).unwrap();
        assert_eq!(hours_of(&db, &id), vec![(day_key(yesterday), 23, 35 * 60, 1)]);
        // Same totals again: nothing changes.
        record_progress(&db.conn, &id, 35 * 60, 1, at(today, 0, 12)).unwrap();
        assert_eq!(hours_of(&db, &id), vec![(day_key(yesterday), 23, 35 * 60, 1)]);
    }

    #[test]
    fn saving_progress_records_hours_and_stops_after_the_end() {
        let db = temp_db();
        let tech = db.get_technique("classic").unwrap().unwrap();
        let id = db.start_session(&tech, "").unwrap();
        db.bump_session_progress(&id, 600, 0, "").unwrap();
        db.end_session(&id, 900, 1, false, "").unwrap();
        db.bump_session_progress(&id, 60, 0, "").unwrap();
        assert_eq!(focus_of(&db, &id), 900);
        assert_eq!(hours_of(&db, &id).iter().map(|h| h.3).sum::<i64>(), 1);
    }

    #[test]
    fn ending_a_session_twice_changes_nothing() {
        let db = temp_db();
        let tech = db.get_technique("classic").unwrap().unwrap();
        let id = db.start_session(&tech, "").unwrap();
        db.end_session(&id, 900, 1, false, "").unwrap();
        db.end_session(&id, 60, 0, true, "").unwrap();
        let rows = db.export_rows().unwrap();
        assert_eq!((rows[0].focus_secs, rows[0].completed_cycles, rows[0].interrupted), (900, 1, false));
        assert_eq!(focus_of(&db, &id), 900);
    }

    #[test]
    fn hours_add_up_to_the_totals_after_a_crash_and_reopen() {
        let path = std::env::temp_dir().join(format!("tempura-hours-crash-{}.sqlite", Uuid::new_v4()));
        let db = Database::open(&path).expect("open");
        let tech = db.get_technique("classic").unwrap().unwrap();
        let id = db.start_session(&tech, "").unwrap();
        db.bump_session_progress(&id, 1200, 0, "").unwrap();
        db.bump_session_progress(&id, 1500, 1, "").unwrap();
        drop(db);
        let db = Database::open(&path).expect("reopen");
        let (focus, cycles): (i64, i64) = db
            .conn
            .query_row(
                "SELECT focus_secs_completed, completed_cycles FROM sessions WHERE id = ?1",
                params![id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!((focus, cycles), (1500, 1));
        assert_eq!(focus_of(&db, &id), focus);
        assert_eq!(hours_of(&db, &id).iter().map(|h| h.3).sum::<i64>(), cycles);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_session_from_before_the_window_counts_inside_it() {
        let db = temp_db();
        let today = Local::now().date_naive();
        let start_day = today - Duration::days(6);
        let id = insert_session(&db, local_hms_utc(start_day - Duration::days(1), 23, 0, 0), 30 * 60, 1);
        record_progress(&db.conn, &id, 50 * 60, 1, at(start_day, 0, 20)).unwrap();
        let range = db.range_stats(7).unwrap();
        assert_eq!(range.focus_secs, 20 * 60);
        assert_eq!(range.completed_cycles, 0, "the cycle finished before the window");
        assert_eq!(range.sessions, 1, "active inside the window");
        assert_eq!(range.by_technique.first().map(|s| s.focus_secs), Some(20 * 60));
    }

    #[test]
    fn range_stats_buckets_by_local_day_not_utc_prefix() {
        let db = temp_db();
        let today = Local::now().date_naive();
        // Late evening local time is the next UTC date west of UTC.
        insert_session(&db, local_hms_utc(today, 23, 30, 0), 600, 1);

        let range = db.range_stats(1).expect("range");
        assert_eq!(range.sessions, 1);
        assert_eq!(range.focus_secs, 600);
        assert_eq!(range.completed_cycles, 1);
        assert_eq!(range.buckets.len(), 1);
        assert_eq!(range.buckets[0].date, today.format("%Y-%m-%d").to_string());
        assert_eq!(range.buckets[0].focus_secs, 600);
        assert_eq!(range.streak_days, 1);
        assert_eq!(
            range.focus_secs,
            range.buckets.iter().map(|b| b.focus_secs).sum::<i64>()
        );
    }

    #[test]
    fn range_stats_excludes_session_before_window_and_fills_gaps() {
        let db = temp_db();
        let today = Local::now().date_naive();
        let start_day = today - Duration::days(6);
        insert_session(
            &db,
            local_hms_utc(start_day - Duration::days(1), 23, 0, 0),
            900,
            1,
        );
        insert_session(&db, local_hms_utc(today, 9, 0, 0), 300, 2);

        let range = db.range_stats(7).expect("range");
        assert_eq!(range.buckets.len(), 7);
        assert_eq!(range.sessions, 1);
        assert_eq!(range.focus_secs, 300);
        assert_eq!(range.completed_cycles, 2);
        assert_eq!(
            range.buckets[0].date,
            start_day.format("%Y-%m-%d").to_string()
        );
        assert_eq!(range.buckets[0].sessions, 0);
        assert_eq!(range.buckets[6].focus_secs, 300);
        assert_eq!(
            range.focus_secs,
            range.buckets.iter().map(|b| b.focus_secs).sum::<i64>()
        );
        assert_eq!(
            range.sessions,
            range.buckets.iter().map(|b| b.sessions).sum::<i64>()
        );
    }

    #[test]
    fn streak_uses_local_days_and_allows_yesterday_start() {
        let db = temp_db();
        let today = Local::now().date_naive();
        let yesterday = today - Duration::days(1);
        let two_ago = today - Duration::days(2);

        insert_session(&db, local_hms_utc(two_ago, 23, 30, 0), 120, 1);
        insert_session(&db, local_hms_utc(yesterday, 0, 15, 0), 120, 1);
        // Zero-focus session today must not keep the streak alive.
        insert_session(&db, local_hms_utc(today, 12, 0, 0), 0, 0);

        let range = db.range_stats(7).expect("range");
        assert_eq!(range.streak_days, 2);
        assert_eq!(range.sessions, 3);
        assert_eq!(range.focus_secs, 240);
    }

    #[test]
    fn reopening_closes_sessions_a_crash_left_open() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("tempura-orphans-{nanos}.sqlite"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).expect("open");
        let tech = db.get_technique("classic").unwrap().unwrap();
        let finished = db.start_session(&tech, "").unwrap();
        db.end_session(&finished, 600, 1, false, "").unwrap();
        let crashed = db.start_session(&tech, "").unwrap();
        db.bump_session_progress(&crashed, 1500, 1, "").unwrap();
        let seen: String = db
            .conn
            .query_row("SELECT last_seen_at FROM sessions WHERE id = ?1", params![crashed], |r| r.get(0))
            .unwrap();
        drop(db);

        let db = Database::open(&path).expect("reopen");
        let rows = db.export_rows().unwrap();
        assert_eq!(rows.len(), 2);
        assert!(rows.iter().all(|r| r.ended_at.is_some()));
        let crashed_row = rows.iter().find(|r| r.focus_secs == 1500).unwrap();
        assert!(crashed_row.interrupted);
        assert_eq!(crashed_row.ended_at.as_deref(), Some(seen.as_str()));
        let finished_row = rows.iter().find(|r| r.focus_secs == 600).unwrap();
        assert!(!finished_row.interrupted);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn progress_cannot_change_an_ended_session() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("tempura-late-bump-{nanos}.sqlite"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).expect("open");
        let tech = db.get_technique("classic").unwrap().unwrap();
        let id = db.start_session(&tech, "").unwrap();
        db.end_session(&id, 1500, 1, false, "").unwrap();
        db.bump_session_progress(&id, 60, 0, "").unwrap();
        let rows = db.export_rows().unwrap();
        assert_eq!((rows[0].focus_secs, rows[0].completed_cycles), (1500, 1));
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn session_open_from_before_last_seen_at_ends_at_its_start() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("tempura-legacy-orphan-{nanos}.sqlite"));
        let _ = std::fs::remove_file(&path);
        let db = Database::open(&path).expect("open");
        let started = "2026-10-01T09:00:00+00:00";
        db.conn
            .execute(
                "INSERT INTO sessions (id, technique_id, started_at, focus_secs_completed, completed_cycles, interrupted)
                 VALUES ('old', 'classic', ?1, 300, 0, 0)",
                params![started],
            )
            .unwrap();
        drop(db);

        let db = Database::open(&path).expect("reopen");
        let rows = db.export_rows().unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].ended_at.as_deref(), Some(started));
        assert!(rows[0].interrupted);
        let _ = std::fs::remove_file(&path);
    }

    fn temp_path(tag: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("tempura-{tag}-{nanos}.sqlite"));
        let _ = std::fs::remove_file(&path);
        path
    }

    fn user_version(db: &Database) -> i64 {
        db.conn.pragma_query_value(None, "user_version", |row| row.get(0)).unwrap()
    }

    fn setting_keys(db: &Database) -> Vec<String> {
        let mut stmt = db.conn.prepare("SELECT key FROM settings ORDER BY key").unwrap();
        stmt.query_map([], |row| row.get(0)).unwrap().collect::<Result<_, _>>().unwrap()
    }

    #[test]
    fn a_new_database_runs_every_migration() {
        let path = temp_path("fresh");
        let db = Database::open(&path).expect("open");
        assert_eq!(user_version(&db), MIGRATIONS.len() as i64);
        assert_eq!(setting_keys(&db), vec![SETTINGS_KEY.to_string()]);
        let defaults = AppSettings::default();
        let settings = db.get_settings().unwrap();
        assert_eq!(settings.theme, defaults.theme);
        assert!(settings.auto_continue && settings.menu_bar_countdown && settings.check_updates_on_launch);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_database_from_before_versioning_keeps_its_settings() {
        // As 0.5.1 left it: no user_version, one settings row per key.
        let path = temp_path("legacy");
        {
            let conn = Connection::open(&path).unwrap();
            migrate_v1_baseline(&conn).unwrap();
            for (key, value) in [
                ("theme", "dusk"),
                ("sound_enabled", "false"),
                ("default_technique_id", "deep"),
                ("working_on", "Thesis"),
                ("locale", "ro"),
                ("hidden_technique_ids", "sprint,ultradian"),
                ("auto_continue", "false"),
                ("hotkey_toggle", "Control+Alt+KeyP"),
                ("hotkey_skip", "Control+KeyC"),
                ("hotkey_portal", "1"),
                ("flow_ratio", "0.25"),
                ("long_break_every_n", "6"),
            ] {
                conn.execute("INSERT INTO settings (key, value) VALUES (?1, ?2)", params![key, value]).unwrap();
            }
        }

        let db = Database::open(&path).expect("open");
        assert_eq!(user_version(&db), MIGRATIONS.len() as i64);
        assert_eq!(setting_keys(&db), vec![SETTINGS_KEY.to_string()]);
        let s = db.get_settings().unwrap();
        assert_eq!(s.theme, "dusk");
        assert!(!s.sound_enabled);
        assert!(s.notifications_enabled, "not saved before: default");
        assert_eq!(s.default_technique_id, "deep");
        assert_eq!(s.working_on, "Thesis");
        assert_eq!(s.locale, "ro");
        assert_eq!(s.hidden_technique_ids, vec!["sprint", "ultradian"]);
        assert!(!s.auto_continue);
        assert!(s.menu_bar_countdown, "not saved before: default");
        assert_eq!(s.global_hotkeys.toggle, "Control+Alt+KeyP");
        assert_eq!(s.global_hotkeys.skip, "", "reserved: reads as not set");
        assert!(s.global_hotkeys.portal);
        drop(db);

        // Opening again runs nothing and changes nothing.
        let db = Database::open(&path).expect("reopen");
        assert_eq!(db.get_settings().unwrap().theme, "dusk");
        assert_eq!(setting_keys(&db), vec![SETTINGS_KEY.to_string()]);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_setting_missing_from_the_saved_copy_takes_its_default() {
        let path = temp_path("partial");
        let db = Database::open(&path).expect("open");
        db.conn
            .execute(
                "UPDATE settings SET value = ?1 WHERE key = ?2",
                params![r#"{"theme":"grove","autoContinue":false}"#, SETTINGS_KEY],
            )
            .unwrap();
        let s = db.get_settings().unwrap();
        assert_eq!(s.theme, "grove");
        assert!(!s.auto_continue);
        assert!(s.menu_bar_countdown);
        assert_eq!(s.default_technique_id, AppSettings::default().default_technique_id);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn unreadable_saved_settings_fall_back_to_defaults() {
        let path = temp_path("corrupt");
        let db = Database::open(&path).expect("open");
        db.conn
            .execute("UPDATE settings SET value = 'not json' WHERE key = ?1", params![SETTINGS_KEY])
            .unwrap();
        assert_eq!(db.get_settings().unwrap().theme, AppSettings::default().theme);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn sessions_from_before_go_to_the_hour_they_started() {
        // A database at version 3: per-day focus, as dev builds of #47 wrote it.
        let path = temp_path("backfill");
        let start_day = Local::now().date_naive() - Duration::days(3);
        let started = local_hms_utc(start_day, 22, 15, 0);
        let start_hour = started.with_timezone(&Local).hour() as i64;
        {
            let conn = Connection::open(&path).unwrap();
            for migration in &MIGRATIONS[..3] {
                migration(&conn).unwrap();
            }
            conn.pragma_update(None, "user_version", 3).unwrap();
            for (id, focus, cycles) in [("a", 90 * 60, 3), ("b", 0, 0)] {
                conn.execute(
                    "INSERT INTO sessions (id, started_at, ended_at, focus_secs_completed, completed_cycles)
                     VALUES (?1, ?2, ?2, ?3, ?4)",
                    params![id, started.to_rfc3339(), focus, cycles],
                )
                .unwrap();
            }
            // "a" ran past midnight under a dev build: 60 min the first day, 30 the next.
            conn.execute(
                "INSERT INTO session_days (session_id, day, focus_secs) VALUES ('a', ?1, 3600), ('a', ?2, 1800)",
                params![day_key(start_day), day_key(start_day + Duration::days(1))],
            )
            .unwrap();
        }
        let db = Database::open(&path).expect("open");
        assert_eq!(user_version(&db), MIGRATIONS.len() as i64);
        assert_eq!(
            hours_of(&db, "a"),
            vec![
                (day_key(start_day), start_hour, 3600, 3),
                (day_key(start_day + Duration::days(1)), 0, 1800, 0),
            ]
        );
        assert!(hours_of(&db, "b").is_empty());
        let gone: i64 = db
            .conn
            .query_row("SELECT COUNT(*) FROM sqlite_master WHERE name = 'session_days'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(gone, 0);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_database_from_0_5_1_gets_its_sessions_in_their_start_hours() {
        let path = temp_path("from-051");
        let started = Utc::now() - Duration::days(2);
        {
            let conn = Connection::open(&path).unwrap();
            migrate_v1_baseline(&conn).unwrap();
            conn.execute(
                "INSERT INTO sessions (id, started_at, ended_at, focus_secs_completed, completed_cycles)
                 VALUES ('a', ?1, ?1, 1500, 1)",
                params![started.to_rfc3339()],
            )
            .unwrap();
        }
        let db = Database::open(&path).expect("open");
        let local = started.with_timezone(&Local);
        assert_eq!(hours_of(&db, "a"), vec![(day_key(local.date_naive()), local.hour() as i64, 1500, 1)]);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn every_legacy_setting_carries_over() {
        // Every key 0.5.1 wrote, each set away from its default.
        let path = temp_path("legacy-all");
        {
            let conn = Connection::open(&path).unwrap();
            migrate_v1_baseline(&conn).unwrap();
            for (key, value) in [
                ("theme", "sandstone"),
                ("notifications_enabled", "false"),
                ("sound_enabled", "false"),
                ("halfway_tick", "true"),
                ("default_technique_id", "sprint"),
                ("start_minimized", "true"),
                ("working_on", "Essay, part 2"),
                ("locale", "ja"),
                ("check_updates_on_launch", "false"),
                ("hidden_technique_ids", "deep"),
                ("auto_continue", "false"),
                ("menu_bar_countdown", "false"),
                ("hotkey_toggle", "Control+Alt+KeyP"),
                ("hotkey_skip", "Control+Alt+KeyN"),
                ("hotkey_show", "Super+Alt+KeyT"),
                ("hotkey_portal", "1"),
            ] {
                conn.execute("INSERT INTO settings (key, value) VALUES (?1, ?2)", params![key, value]).unwrap();
            }
        }
        let db = Database::open(&path).expect("open");
        let s = db.get_settings().unwrap();
        let expected = serde_json::json!({
            "theme": "sandstone",
            "notificationsEnabled": false,
            "soundEnabled": false,
            "halfwayTick": true,
            "defaultTechniqueId": "sprint",
            "startMinimized": true,
            "workingOn": "Essay, part 2",
            "locale": "ja",
            "checkUpdatesOnLaunch": false,
            "hiddenTechniqueIds": ["deep"],
            "autoContinue": false,
            "menuBarCountdown": false,
            "globalHotkeys": {
                "toggle": "Control+Alt+KeyP",
                "skip": "Control+Alt+KeyN",
                "show": "Super+Alt+KeyT",
                "portal": true
            }
        });
        // Key by key, so settings added later don't need this test changed.
        let actual = serde_json::to_value(&s).unwrap();
        for (key, value) in expected.as_object().unwrap() {
            assert_eq!(&actual[key], value, "{key}");
        }
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn a_database_from_a_newer_version_is_left_alone() {
        let path = temp_path("newer");
        let db = Database::open(&path).expect("open");
        db.conn.pragma_update(None, "user_version", 99).unwrap();
        drop(db);
        let db = Database::open(&path).expect("reopen");
        assert_eq!(user_version(&db), 99);
        let _ = db.get_settings().expect("settings still load");
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn settings_round_trip_whole() {
        let path = temp_path("roundtrip");
        let db = Database::open(&path).expect("open");
        let mut s = db.get_settings().unwrap();
        s.theme = "mist".into();
        s.halfway_tick = true;
        s.global_hotkeys.show = "Control+Alt+KeyS".into();
        s.hidden_technique_ids = vec!["hybrid".into()];
        db.update_settings(&s).unwrap();
        let back = db.get_settings().unwrap();
        assert_eq!(serde_json::to_value(&back).unwrap(), serde_json::to_value(&s).unwrap());
        let _ = std::fs::remove_file(&path);
    }
}

#[cfg(all(test, unix))]
mod unix_mode_tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn mode(path: &Path) -> u32 {
        std::fs::metadata(path).expect("meta").permissions().mode() & 0o777
    }

    #[test]
    fn unix_modes_are_restrictive_after_open() {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("tempura-modes-{nanos}"));
        let path = dir.join("tempura.db");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).expect("mkdir");
        std::fs::set_permissions(&dir, std::fs::Permissions::from_mode(0o755)).expect("chmod dir");

        let db = Database::open(&path).expect("open");
        assert_eq!(mode(&dir), 0o700, "app-data dir");
        assert_eq!(mode(&path), 0o600, "sqlite file");
        let wal = PathBuf::from(format!("{}-wal", path.display()));
        let shm = PathBuf::from(format!("{}-shm", path.display()));
        if wal.exists() {
            assert_eq!(mode(&wal), 0o600, "wal");
        }
        if shm.exists() {
            assert_eq!(mode(&shm), 0o600, "shm");
        }
        drop(db);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
