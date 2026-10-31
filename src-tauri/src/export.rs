//! Session history as a CSV or JSON file. Pure functions over rows the database
//! hands back, so the formats are tested without a database or a file dialog.

use chrono::{DateTime, TimeZone, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
}

impl ExportFormat {
    pub fn extension(self) -> &'static str {
        match self {
            ExportFormat::Csv => "csv",
            ExportFormat::Json => "json",
        }
    }
}

/// One stored session, timestamps as the database keeps them (UTC RFC 3339).
pub struct ExportRow {
    pub started_at: String,
    pub ended_at: Option<String>,
    pub label: String,
    pub technique_id: Option<String>,
    pub technique: String,
    pub focus_secs: i64,
    pub completed_cycles: i64,
    pub interrupted: bool,
}

/// The file's contents, with times in `tz` (the user's local zone in the app).
pub fn render<Tz: TimeZone>(format: ExportFormat, rows: &[ExportRow], tz: &Tz) -> String
where
    Tz::Offset: std::fmt::Display,
{
    match format {
        ExportFormat::Csv => to_csv(rows, tz),
        ExportFormat::Json => to_json(rows, tz),
    }
}

fn parse<Tz: TimeZone>(stamp: &str, tz: &Tz) -> Option<DateTime<Tz>> {
    DateTime::parse_from_rfc3339(stamp)
        .ok()
        .map(|d| d.with_timezone(&Utc).with_timezone(tz))
}

const CSV_HEADER: &str =
    "date,start,end_date,end,label,technique,focus_minutes,focus_seconds,completed_cycles,interrupted";

/// Spreadsheet-friendly: local dates and times in separate columns (the end has
/// its own date for sessions that cross midnight), whole focus
/// minutes for summing, exact seconds beside them. Starts with a byte order mark
/// so Excel reads non-Latin labels as UTF-8.
fn to_csv<Tz: TimeZone>(rows: &[ExportRow], tz: &Tz) -> String
where
    Tz::Offset: std::fmt::Display,
{
    let mut out = String::from("\u{feff}");
    out.push_str(CSV_HEADER);
    out.push_str("\r\n");
    for row in rows {
        let Some(start) = parse(&row.started_at, tz) else {
            continue;
        };
        let end = row.ended_at.as_deref().and_then(|e| parse(e, tz));
        let end_part = |fmt: &str| {
            end.as_ref()
                .map(|e| e.format(fmt).to_string())
                .unwrap_or_default()
        };
        let fields = [
            start.format("%Y-%m-%d").to_string(),
            start.format("%H:%M:%S").to_string(),
            end_part("%Y-%m-%d"),
            end_part("%H:%M:%S"),
            csv_field(&row.label),
            csv_field(&row.technique),
            ((row.focus_secs + 30) / 60).to_string(),
            row.focus_secs.to_string(),
            row.completed_cycles.to_string(),
            if row.interrupted { "yes" } else { "no" }.to_string(),
        ];
        out.push_str(&fields.join(","));
        out.push_str("\r\n");
    }
    out
}

/// Leading whitespace / Unicode Format (Cf) that spreadsheets skip before
/// deciding whether a cell is a formula. Covers BOM, zero-width, and bidi marks.
fn is_formula_prefix_noise(c: char) -> bool {
    if c.is_whitespace() {
        return true;
    }
    matches!(
        c as u32,
        0x00AD // soft hyphen
            | 0x0600..=0x0605
            | 0x061C
            | 0x06DD
            | 0x070F
            | 0x180E
            | 0x200B..=0x200F // ZWSP..RLM
            | 0x202A..=0x202E // LRE..RLO
            | 0x2060..=0x2064
            | 0x2066..=0x206F
            | 0xFEFF // BOM / ZWNBSP
            | 0xFFF9..=0xFFFB
            | 0x110BD
            | 0x110CD
            | 0x13430..=0x1343F
            | 0x1BCA0..=0x1BCA3
            | 0x1D173..=0x1D17A
            | 0xE0001
            | 0xE0020..=0xE007F
    )
}

/// Quote a free-text field when it needs it, and keep a spreadsheet from running
/// a label that starts like a formula (including after space / BOM / zero-width).
fn csv_field(text: &str) -> String {
    let significant = text.trim_start_matches(is_formula_prefix_noise);
    let text = if significant.starts_with(['=', '+', '-', '@', '\t', '\r']) {
        format!("'{text}")
    } else {
        text.to_string()
    };
    if text.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", text.replace('"', "\"\""))
    } else {
        text
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonExport {
    app: &'static str,
    version: &'static str,
    sessions: Vec<JsonSession>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct JsonSession {
    started_at: String,
    ended_at: Option<String>,
    label: String,
    technique: String,
    technique_id: Option<String>,
    focus_secs: i64,
    completed_cycles: i64,
    interrupted: bool,
}

/// Everything, for scripts: RFC 3339 times with the local offset and raw seconds.
fn to_json<Tz: TimeZone>(rows: &[ExportRow], tz: &Tz) -> String
where
    Tz::Offset: std::fmt::Display,
{
    let sessions = rows
        .iter()
        .filter_map(|row| {
            Some(JsonSession {
                started_at: parse(&row.started_at, tz)?.to_rfc3339(),
                ended_at: row
                    .ended_at
                    .as_deref()
                    .and_then(|e| parse(e, tz))
                    .map(|e| e.to_rfc3339()),
                label: row.label.clone(),
                technique: row.technique.clone(),
                technique_id: row.technique_id.clone(),
                focus_secs: row.focus_secs,
                completed_cycles: row.completed_cycles,
                interrupted: row.interrupted,
            })
        })
        .collect();
    let export = JsonExport {
        app: "Tempura",
        version: env!("CARGO_PKG_VERSION"),
        sessions,
    };
    let mut out = serde_json::to_string_pretty(&export).expect("export serializes");
    out.push('\n');
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::FixedOffset;

    fn tz() -> FixedOffset {
        FixedOffset::east_opt(2 * 3600).unwrap()
    }

    fn row(label: &str) -> ExportRow {
        ExportRow {
            started_at: "2026-10-25T07:58:00+00:00".into(),
            ended_at: Some("2026-10-25T08:23:10+00:00".into()),
            label: label.into(),
            technique_id: Some("classic".into()),
            technique: "Classic".into(),
            focus_secs: 1500,
            completed_cycles: 1,
            interrupted: false,
        }
    }

    fn csv_lines(rows: &[ExportRow]) -> Vec<String> {
        let csv = render(ExportFormat::Csv, rows, &tz());
        let csv = csv
            .strip_prefix('\u{feff}')
            .expect("starts with a byte order mark");
        csv.split("\r\n").map(String::from).collect()
    }

    #[test]
    fn csv_has_local_times_and_minutes() {
        assert_eq!(
            csv_lines(&[row("Thesis")]),
            vec![
                CSV_HEADER.to_string(),
                "2026-10-25,09:58:00,2026-10-25,10:23:10,Thesis,Classic,25,1500,1,no".into(),
                String::new(),
            ]
        );
    }

    #[test]
    fn csv_quotes_and_defuses_labels() {
        let lines = csv_lines(&[
            row("Report, \"final\""),
            row("=SUM(A1)"),
            row("Тези"),
            row(" =SUM(A1)"),
            row("\u{feff}=SUM(A1)"),
            row("\u{200b}+=cmd"),
            row("\t@HYPERLINK"),
        ]);
        assert!(lines[1].contains(",\"Report, \"\"final\"\"\",Classic,"));
        assert!(lines[2].contains(",'=SUM(A1),Classic,"));
        assert!(lines[3].contains(",Тези,Classic,"));
        assert!(lines[4].contains(",' =SUM(A1),Classic,"));
        assert!(lines[5].contains(",'\u{feff}=SUM(A1),Classic,"));
        assert!(lines[6].contains(",'\u{200b}+=cmd,Classic,"));
        assert!(lines[7].contains(",'\t@HYPERLINK,Classic,"));
    }

    #[test]
    fn csv_leaves_the_end_empty_for_a_session_still_running() {
        let mut running = row("");
        running.ended_at = None;
        running.interrupted = true;
        assert_eq!(
            csv_lines(&[running])[1],
            "2026-10-25,09:58:00,,,,Classic,25,1500,1,yes"
        );
    }

    #[test]
    fn csv_gives_the_end_its_own_date_across_midnight() {
        let mut late = row("Night owl");
        late.started_at = "2026-10-25T21:50:00+00:00".into();
        late.ended_at = Some("2026-10-25T22:15:00+00:00".into());
        assert!(csv_lines(&[late])[1].starts_with("2026-10-25,23:50:00,2026-10-26,00:15:00,"));
    }

    #[test]
    fn json_keeps_raw_values_with_the_local_offset() {
        let json = render(ExportFormat::Json, &[row("Thesis")], &tz());
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["app"], "Tempura");
        let session = &value["sessions"][0];
        assert_eq!(session["startedAt"], "2026-10-25T09:58:00+02:00");
        assert_eq!(session["endedAt"], "2026-10-25T10:23:10+02:00");
        assert_eq!(session["label"], "Thesis");
        assert_eq!(session["techniqueId"], "classic");
        assert_eq!(session["focusSecs"], 1500);
        assert_eq!(session["interrupted"], false);
    }

    #[test]
    fn rows_with_a_broken_start_are_skipped() {
        let broken = || {
            let mut r = row("x");
            r.started_at = "not a time".into();
            r
        };
        assert_eq!(csv_lines(&[broken(), row("y")]).len(), 3);
        let json = render(ExportFormat::Json, &[broken(), row("y")], &tz());
        let value: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(value["sessions"].as_array().unwrap().len(), 1);
    }
}
