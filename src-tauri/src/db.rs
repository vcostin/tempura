use crate::models::{AppSettings, DayStats, Technique, TechniqueInput, TechniqueKind};
use chrono::{Duration, Local, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use thiserror::Error;
use uuid::Uuid;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Message(String),
}

pub type DbResult<T> = Result<T, DbError>;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn open(path: &Path) -> DbResult<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| DbError::Message(format!("create app data dir: {e}")))?;
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
        db.seed_system_techniques()?;
        db.ensure_default_settings()?;
        Ok(db)
    }

    fn migrate(&self) -> DbResult<()> {
        self.conn.execute_batch(
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
        Ok(())
    }

    fn seed_system_techniques(&self) -> DbResult<()> {
        let now = Utc::now().to_rfc3339();
        let seeds: &[(&str, &str, i64, i64, i64, i64, Option<f64>, &str, &str)] = &[
            (
                "classic",
                "Classic",
                25 * 60,
                5 * 60,
                15 * 60,
                4,
                None,
                "#6B8F71",
                "classic",
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
                "classic",
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
                "classic",
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
                "classic",
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
                "classic",
            ),
            (
                "flowtime",
                "Flowtime",
                0,
                0,
                0,
                1,
                Some(0.2),
                "#B08968",
                "flowtime",
            ),
            (
                "hybrid",
                "Hybrid",
                25 * 60,
                5 * 60,
                15 * 60,
                4,
                Some(0.2),
                "#8B6B61",
                "hybrid",
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

    fn ensure_default_settings(&self) -> DbResult<()> {
        let defaults = AppSettings::default();
        let pairs = [
            ("theme", defaults.theme),
            (
                "notifications_enabled",
                defaults.notifications_enabled.to_string(),
            ),
            ("sound_enabled", defaults.sound_enabled.to_string()),
            ("halfway_tick", defaults.halfway_tick.to_string()),
            ("default_technique_id", defaults.default_technique_id),
            ("start_minimized", defaults.start_minimized.to_string()),
            (
                "long_break_every_n",
                defaults.long_break_every_n.to_string(),
            ),
            ("flow_ratio", defaults.flow_ratio.to_string()),
            ("working_on", defaults.working_on),
            ("locale", defaults.locale),
        ];
        for (key, value) in pairs {
            self.conn.execute(
                "INSERT OR IGNORE INTO settings (key, value) VALUES (?1, ?2)",
                params![key, value],
            )?;
        }
        Ok(())
    }

    fn get_setting(&self, key: &str) -> DbResult<Option<String>> {
        self.conn
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    fn set_setting(&self, key: &str, value: &str) -> DbResult<()> {
        self.conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn get_settings(&self) -> DbResult<AppSettings> {
        let defaults = AppSettings::default();
        Ok(AppSettings {
            theme: self
                .get_setting("theme")?
                .unwrap_or(defaults.theme),
            notifications_enabled: self
                .get_setting("notifications_enabled")?
                .as_deref()
                .map(|v| v == "true")
                .unwrap_or(defaults.notifications_enabled),
            sound_enabled: self
                .get_setting("sound_enabled")?
                .as_deref()
                .map(|v| v == "true")
                .unwrap_or(defaults.sound_enabled),
            halfway_tick: self
                .get_setting("halfway_tick")?
                .as_deref()
                .map(|v| v == "true")
                .unwrap_or(defaults.halfway_tick),
            default_technique_id: self
                .get_setting("default_technique_id")?
                .unwrap_or(defaults.default_technique_id),
            start_minimized: self
                .get_setting("start_minimized")?
                .as_deref()
                .map(|v| v == "true")
                .unwrap_or(defaults.start_minimized),
            long_break_every_n: self
                .get_setting("long_break_every_n")?
                .and_then(|v| v.parse().ok())
                .unwrap_or(defaults.long_break_every_n),
            flow_ratio: self
                .get_setting("flow_ratio")?
                .and_then(|v| v.parse().ok())
                .unwrap_or(defaults.flow_ratio),
            working_on: self
                .get_setting("working_on")?
                .unwrap_or(defaults.working_on),
            locale: self.get_setting("locale")?.unwrap_or(defaults.locale),
        })
    }

    pub fn update_settings(&self, settings: &AppSettings) -> DbResult<()> {
        self.set_setting("theme", &settings.theme)?;
        self.set_setting(
            "notifications_enabled",
            &settings.notifications_enabled.to_string(),
        )?;
        self.set_setting("sound_enabled", &settings.sound_enabled.to_string())?;
        self.set_setting("halfway_tick", &settings.halfway_tick.to_string())?;
        self.set_setting("default_technique_id", &settings.default_technique_id)?;
        self.set_setting("start_minimized", &settings.start_minimized.to_string())?;
        self.set_setting(
            "long_break_every_n",
            &settings.long_break_every_n.to_string(),
        )?;
        self.set_setting("flow_ratio", &settings.flow_ratio.to_string())?;
        self.set_setting("working_on", &settings.working_on)?;
        self.set_setting("locale", &settings.locale)?;
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
        let mode = input.mode.unwrap_or_else(|| "classic".into());
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
            return Err(DbError::Message(
                "system techniques are immutable".into(),
            ));
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
        self.conn
            .execute("DELETE FROM techniques WHERE id = ?1 AND kind = 'custom'", params![id])?;
        Ok(())
    }

    pub fn start_session(&self, technique_id: &str) -> DbResult<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "
            INSERT INTO sessions (id, technique_id, started_at, focus_secs_completed, completed_cycles, interrupted)
            VALUES (?1, ?2, ?3, 0, 0, 0)
            ",
            params![id, technique_id, now],
        )?;
        Ok(id)
    }

    pub fn end_session(
        &self,
        session_id: &str,
        focus_secs: i64,
        completed_cycles: i64,
        interrupted: bool,
    ) -> DbResult<()> {
        let now = Utc::now().to_rfc3339();
        self.conn.execute(
            "
            UPDATE sessions SET
                ended_at = ?1,
                focus_secs_completed = ?2,
                completed_cycles = ?3,
                interrupted = ?4
            WHERE id = ?5
            ",
            params![
                now,
                focus_secs,
                completed_cycles,
                if interrupted { 1 } else { 0 },
                session_id
            ],
        )?;
        Ok(())
    }

    pub fn bump_session_progress(
        &self,
        session_id: &str,
        focus_secs: i64,
        completed_cycles: i64,
    ) -> DbResult<()> {
        self.conn.execute(
            "
            UPDATE sessions SET
                focus_secs_completed = ?1,
                completed_cycles = ?2
            WHERE id = ?3
            ",
            params![focus_secs, completed_cycles, session_id],
        )?;
        Ok(())
    }

    pub fn day_stats(&self) -> DbResult<DayStats> {
        let today = Local::now().date_naive();
        let start = today.and_hms_opt(0, 0, 0).unwrap().and_local_timezone(Local).unwrap();
        let start_utc = start.with_timezone(&Utc).to_rfc3339();

        let (focus_secs_today, completed_cycles_today, sessions_today): (i64, i64, i64) =
            self.conn.query_row(
                "
                SELECT
                    COALESCE(SUM(focus_secs_completed), 0),
                    COALESCE(SUM(completed_cycles), 0),
                    COUNT(*)
                FROM sessions
                WHERE started_at >= ?1
                ",
                params![start_utc],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )?;

        let streak_days = self.compute_streak(today)?;

        Ok(DayStats {
            focus_secs_today,
            completed_cycles_today,
            sessions_today,
            streak_days,
        })
    }

    fn compute_streak(&self, today: NaiveDate) -> DbResult<i64> {
        let mut stmt = self.conn.prepare(
            "
            SELECT DISTINCT substr(started_at, 1, 10)
            FROM sessions
            WHERE focus_secs_completed > 0
            ORDER BY 1 DESC
            ",
        )?;
        let dates: Vec<NaiveDate> = stmt
            .query_map([], |row| {
                let s: String = row.get(0)?;
                Ok(s)
            })?
            .filter_map(|r| r.ok())
            .filter_map(|s| NaiveDate::parse_from_str(&s, "%Y-%m-%d").ok())
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
}
