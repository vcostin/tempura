use rust_embed::RustEmbed;
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::sync::OnceLock;

#[derive(RustEmbed)]
#[folder = "../locales/"]
struct LocaleFiles;

fn catalogs() -> &'static HashMap<String, Value> {
    static CATALOGS: OnceLock<HashMap<String, Value>> = OnceLock::new();
    CATALOGS.get_or_init(|| {
        let mut map = HashMap::new();
        for name in LocaleFiles::iter() {
            let name = name.as_ref();
            if !name.ends_with("ui.json") {
                continue;
            }
            let Some(code) = Path::new(name)
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
            else {
                continue;
            };
            if code == "." || code.is_empty() {
                continue;
            }
            let Some(file) = LocaleFiles::get(name) else {
                continue;
            };
            if let Ok(value) = serde_json::from_slice::<Value>(&file.data) {
                map.insert(code.to_string(), value);
            }
        }
        map
    })
}

fn lookup<'a>(root: &'a Value, key: &str) -> Option<&'a str> {
    let mut cur = root;
    for part in key.split('.') {
        cur = cur.get(part)?;
    }
    cur.as_str()
}

fn interpolate(template: &str, vars: &[(&str, &str)]) -> String {
    let mut out = template.to_string();
    for (k, v) in vars {
        let needle = format!("{{{{{k}}}}}");
        out = out.replace(&needle, v);
    }
    out
}

fn match_tag(tag: &str) -> String {
    let cats = catalogs();
    if cats.contains_key(tag) {
        return tag.to_string();
    }
    let lower = tag.to_lowercase();
    if let Some(k) = cats.keys().find(|k| k.to_lowercase() == lower) {
        return k.clone();
    }
    let base = tag
        .split(['-', '_'])
        .next()
        .unwrap_or("en")
        .to_lowercase();
    if base == "zh" && cats.contains_key("zh-Hans") {
        return "zh-Hans".into();
    }
    if base == "pt" && cats.contains_key("pt-BR") {
        return "pt-BR".into();
    }
    if cats.contains_key(&base) {
        return base;
    }
    if let Some(k) = cats
        .keys()
        .find(|k| k.to_lowercase().starts_with(&format!("{base}-")))
    {
        return k.clone();
    }
    "en".into()
}

pub fn resolve_locale(stored: &str) -> String {
    let cats = catalogs();
    if !stored.is_empty() && cats.contains_key(stored) {
        return stored.to_string();
    }
    if !stored.is_empty() {
        return match_tag(stored);
    }
    let os = sys_locale::get_locale().unwrap_or_default();
    match_tag(&os)
}

pub fn t(locale: &str, key: &str) -> String {
    t_vars(locale, key, &[])
}

pub fn t_vars(locale: &str, key: &str, vars: &[(&str, &str)]) -> String {
    let resolved = resolve_locale(locale);
    let cats = catalogs();
    let template = cats
        .get(&resolved)
        .and_then(|root| lookup(root, key))
        .or_else(|| cats.get("en").and_then(|root| lookup(root, key)))
        .unwrap_or(key);
    interpolate(template, vars)
}

pub fn phase_label(locale: &str, phase: &str) -> String {
    let key = match phase {
        "focus" => "phase.focus",
        "short_break" => "phase.short_break",
        "long_break" => "phase.long_break",
        "paused" => "phase.paused",
        _ => "phase.idle",
    };
    t(locale, key)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn english_tray_start() {
        assert_eq!(t("en", "tray.start"), "Start");
    }

    #[test]
    fn interpolates_status() {
        let s = t_vars(
            "en",
            "tray.statusRunning",
            &[("phase", "Focus"), ("time", "01:00")],
        );
        assert_eq!(s, "Status · Focus · 01:00");
    }

    #[test]
    fn unknown_falls_back_to_english() {
        assert_eq!(t("xx-ZZ", "phase.focus"), "Focus");
    }

    #[test]
    fn maps_os_tags_onto_shipped_catalogs() {
        assert_eq!(match_tag("ja_JP"), "ja");
        assert_eq!(match_tag("zh-CN"), "zh-Hans");
        assert_eq!(match_tag("pt_BR"), "pt-BR");
        assert_eq!(match_tag("ko_KR.UTF-8"), "ko");
        assert_eq!(match_tag("xx-ZZ"), "en");
    }

    #[test]
    fn empty_stored_uses_english_when_os_tag_unknown() {
        assert_eq!(match_tag(""), "en");
    }
}
