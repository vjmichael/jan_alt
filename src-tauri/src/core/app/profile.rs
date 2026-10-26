//! Pure profile-path rules shared by the Tauri host and a standalone Windows test.

use std::{
    fs,
    path::{Component, Path, PathBuf},
};

pub fn profile_dir_in(root: PathBuf, app_name: &str) -> PathBuf {
    root.join(app_name)
}

/// A Lu data path must be absolute and must not resolve inside a Jan profile.
/// Resolve the nearest existing ancestor so future child folders and Windows
/// junctions cannot hide a path back into Jan.
pub fn is_forbidden_lu_data_path(candidate: &Path, jan_roots: &[PathBuf]) -> bool {
    if !candidate.is_absolute() {
        return true;
    }
    let normalized = candidate.components().fold(PathBuf::new(), |mut path, part| {
        match part {
            Component::CurDir => {}
            Component::ParentDir => {
                path.pop();
            }
            _ => path.push(part.as_os_str()),
        }
        path
    });
    let mut existing = normalized.as_path();
    let mut missing = Vec::new();
    let candidate = loop {
        if let Ok(mut resolved) = fs::canonicalize(existing) {
            for part in missing.iter().rev() {
                resolved.push(part);
            }
            break resolved;
        }
        let Some(name) = existing.file_name() else {
            break normalized;
        };
        missing.push(name.to_os_string());
        let Some(parent) = existing.parent() else {
            break normalized;
        };
        existing = parent;
    };

    jan_roots.iter().any(|root| {
        let jan = root.join("Jan");
        let jan = fs::canonicalize(&jan).unwrap_or(jan);
        candidate.starts_with(jan)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jan_and_lu_profile_paths_are_distinct() {
        let root = std::env::temp_dir();
        let jan = profile_dir_in(root.clone(), "Jan");
        let lu = profile_dir_in(root.clone(), "Lu");
        assert_eq!(jan, root.join("Jan"));
        assert_eq!(lu, root.join("Lu"));
        assert_ne!(jan, lu);
    }

    #[test]
    fn lu_cannot_select_jan_data_even_when_target_child_is_new() {
        let stamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "lu-profile-isolation-{}-{stamp}",
            std::process::id()
        ));
        let jan_data = root.join("Jan").join("data");
        fs::create_dir_all(&jan_data).expect("temporary Jan directory");
        let lu_data = root.join("Lu").join("data");

        assert!(is_forbidden_lu_data_path(&jan_data, &[root.clone()]));
        assert!(is_forbidden_lu_data_path(
            &jan_data.join("future"),
            &[root.clone()]
        ));
        assert!(is_forbidden_lu_data_path(
            &lu_data.join("..").join("..").join("Jan").join("data"),
            &[root.clone()]
        ));
        assert!(is_forbidden_lu_data_path(
            Path::new("../Jan/data"),
            &[root.clone()]
        ));
        assert!(!is_forbidden_lu_data_path(&lu_data, &[root.clone()]));

        fs::remove_dir(&jan_data).expect("remove empty test data directory");
        fs::remove_dir(root.join("Jan")).expect("remove empty test Jan directory");
        fs::remove_dir(root).expect("remove empty test root");
    }
}
