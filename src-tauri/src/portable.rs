//! The Windows portable exe: a plain `tempura.exe` with no installer.

/// Its entry in the release's `latest.json` (see scripts/build-updater-json.ts).
pub const UPDATER_TARGET: &str = "windows-x86_64-portable";

fn old_copy(exe: &std::path::Path) -> std::path::PathBuf {
    let mut name = exe.as_os_str().to_owned();
    name.push(".old");
    name.into()
}

/// Put `bytes` where the running exe is. The running file can be renamed but not
/// overwritten, so it moves aside first; if writing the new one fails, it moves back.
pub fn replace_exe(bytes: &[u8]) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let old = old_copy(&exe);
    let _ = std::fs::remove_file(&old);
    std::fs::rename(&exe, &old).map_err(|e| format!("can't move {}: {e}", exe.display()))?;
    if let Err(e) = std::fs::write(&exe, bytes) {
        let _ = std::fs::remove_file(&exe);
        let _ = std::fs::rename(&old, &exe);
        return Err(format!("can't write {}: {e}", exe.display()));
    }
    Ok(())
}

/// Remove the copy a previous update moved aside. It's in use until that copy exits,
/// so this runs at startup.
pub fn remove_old_copy() {
    if let Ok(exe) = std::env::current_exe() {
        let _ = std::fs::remove_file(old_copy(&exe));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn old_copy_sits_next_to_the_exe() {
        let exe = std::path::Path::new("C:/Apps/Tempura/tempura.exe");
        assert_eq!(old_copy(exe), std::path::Path::new("C:/Apps/Tempura/tempura.exe.old"));
    }
}
