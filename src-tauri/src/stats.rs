//! Grouping focus time by what it was spent on. Pure functions over rows the
//! database hands back, so the rules are tested without a database.

use std::collections::HashMap;

use crate::models::{FocusShare, ShareKind};

/// How many named rows a breakdown shows before the rest fold into "Other".
pub const TOP_SHARES: usize = 5;

/// One session's contribution: an optional stable id (a technique's), a display
/// name (the label or technique name), and its focus seconds.
pub struct FocusRow {
    pub id: Option<String>,
    pub name: String,
    pub focus_secs: i64,
}

/// Sum focus time per id, or per name when there is no id. Names match after
/// trimming and ignoring case ("Thesis" and "thesis " are one row) and show the
/// most recent spelling, so rows must come oldest first. Sessions with neither
/// id nor name go to one "none" row. The `top` largest named rows are kept, the
/// rest fold into "other"; "other" and "none" come last.
pub fn group_focus(rows: impl IntoIterator<Item = FocusRow>, top: usize) -> Vec<FocusShare> {
    let mut groups: HashMap<String, FocusShare> = HashMap::new();
    let mut none = 0i64;
    for row in rows {
        if row.focus_secs <= 0 {
            continue;
        }
        let name = row.name.trim();
        let key = match (&row.id, name.is_empty()) {
            (Some(id), _) => format!("id:{id}"),
            (None, false) => format!("name:{}", name.to_lowercase()),
            (None, true) => {
                none += row.focus_secs;
                continue;
            }
        };
        let share = groups.entry(key).or_insert_with(|| FocusShare {
            name: String::new(),
            technique_id: row.id.clone(),
            focus_secs: 0,
            kind: ShareKind::Named,
        });
        share.focus_secs += row.focus_secs;
        if !name.is_empty() {
            share.name = name.to_string();
        }
    }

    let mut named: Vec<FocusShare> = groups.into_values().collect();
    named.sort_by(|a, b| b.focus_secs.cmp(&a.focus_secs).then_with(|| a.name.cmp(&b.name)));
    let other: i64 = named.iter().skip(top).map(|s| s.focus_secs).sum();
    named.truncate(top);
    if other > 0 {
        named.push(FocusShare {
            name: String::new(),
            technique_id: None,
            focus_secs: other,
            kind: ShareKind::Other,
        });
    }
    if none > 0 {
        named.push(FocusShare {
            name: String::new(),
            technique_id: None,
            focus_secs: none,
            kind: ShareKind::None,
        });
    }
    named
}

#[cfg(test)]
mod tests {
    use super::*;

    fn label(name: &str, secs: i64) -> FocusRow {
        FocusRow { id: None, name: name.into(), focus_secs: secs }
    }

    fn summary(shares: &[FocusShare]) -> Vec<(ShareKind, &str, i64)> {
        shares.iter().map(|s| (s.kind, s.name.as_str(), s.focus_secs)).collect()
    }

    #[test]
    fn labels_match_ignoring_case_and_spaces_and_keep_the_latest_spelling() {
        let shares = group_focus([label("thesis", 600), label(" Thesis ", 300)], TOP_SHARES);
        assert_eq!(summary(&shares), vec![(ShareKind::Named, "Thesis", 900)]);
    }

    #[test]
    fn largest_first_then_other_then_no_label() {
        let rows = [
            label("a", 100),
            label("b", 500),
            label("", 50),
            label("c", 300),
            label("d", 200),
        ];
        let shares = group_focus(rows, 2);
        assert_eq!(
            summary(&shares),
            vec![
                (ShareKind::Named, "b", 500),
                (ShareKind::Named, "c", 300),
                (ShareKind::Other, "", 300),
                (ShareKind::None, "", 50),
            ]
        );
    }

    #[test]
    fn sessions_without_focus_are_left_out() {
        assert!(group_focus([label("idle", 0), label("", 0)], TOP_SHARES).is_empty());
    }

    #[test]
    fn techniques_group_by_id_and_show_the_latest_name() {
        let tech = |id: Option<&str>, name: &str, secs| FocusRow {
            id: id.map(Into::into),
            name: name.into(),
            focus_secs: secs,
        };
        let rows = [
            tech(Some("custom-1"), "Writing", 600),
            tech(Some("custom-1"), "Long writing", 600),
            tech(Some("classic"), "Classic", 900),
            // A deleted technique keeps its stored name.
            tech(None, "Old one", 300),
        ];
        let shares = group_focus(rows, TOP_SHARES);
        assert_eq!(
            summary(&shares),
            vec![
                (ShareKind::Named, "Long writing", 1200),
                (ShareKind::Named, "Classic", 900),
                (ShareKind::Named, "Old one", 300),
            ]
        );
        assert_eq!(shares[0].technique_id.as_deref(), Some("custom-1"));
        assert_eq!(shares[2].technique_id, None);
    }
}
