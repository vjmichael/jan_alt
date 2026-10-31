//! Dependency-free, OS-native Lu runtime path admission.
//! Can be compiled and tested independently from the Tauri desktop with rustc.
//! This pre-open guard is not a handle-based defense against same-user races.
use std::{
    fs::{self, Metadata},
    path::Path,
};

pub(crate) fn is_redirected_entry(metadata: &Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        return metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0;
    }
    #[cfg(not(windows))]
    {
        false
    }
}

pub(crate) fn require_unredirected_runtime_file(root: &Path, name: &str) -> Result<(), String> {
    match fs::symlink_metadata(root.join(name)) {
        Ok(metadata) if metadata.file_type().is_file() && !is_redirected_entry(&metadata) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err("Lu runtime file is redirected or unavailable".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn new_root() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "lu-runtime-path-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
        ));
        fs::create_dir(&root).unwrap();
        root
    }

    const RUNTIME_FILES: [&str; 9] = [
        "owner.lock",
        "tasks.sqlite",
        "tasks.sqlite-wal",
        "tasks.sqlite-shm",
        "tasks.sqlite-journal",
        "effects.sqlite",
        "effects.sqlite-wal",
        "effects.sqlite-shm",
        "effects.sqlite-journal",
    ];

    #[test]
    fn normal_and_missing_runtime_files_are_admitted() {
        let root = new_root();
        for name in RUNTIME_FILES {
            assert!(require_unredirected_runtime_file(&root, name).is_ok(), "{name}");
            fs::write(root.join(name), b"local-only").unwrap();
            assert!(require_unredirected_runtime_file(&root, name).is_ok(), "{name}");
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn directories_cannot_impersonate_runtime_files() {
        let root = new_root();
        for name in RUNTIME_FILES {
            fs::create_dir(root.join(name)).unwrap();
            assert!(require_unredirected_runtime_file(&root, name).is_err(), "{name}");
            fs::remove_dir(root.join(name)).unwrap();
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_wal_shm_and_primary_files_cannot_redirect_sqlite() {
        use std::os::unix::fs::symlink;
        let root = new_root();
        let sentinel = root.join("untouched.txt");
        fs::write(&sentinel, b"untouched").unwrap();
        for name in RUNTIME_FILES {
            symlink(&sentinel, root.join(name)).unwrap();
            assert!(require_unredirected_runtime_file(&root, name).is_err(), "{name}");
            assert_eq!(fs::read(&sentinel).unwrap(), b"untouched");
            fs::remove_file(root.join(name)).unwrap();
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn sibling_directory_symlink_is_detected_despite_same_parent() {
        use std::os::unix::fs::symlink;
        let root = new_root();
        let target = root.join("sibling");
        fs::create_dir(&target).unwrap();
        let redirect = root.join("lu-native-runtime");
        symlink(&target, &redirect).unwrap();
        assert_eq!(redirect.canonicalize().unwrap().parent(), Some(root.as_path()));
        assert!(is_redirected_entry(&fs::symlink_metadata(&redirect).unwrap()));
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn sibling_windows_junction_is_detected_despite_same_parent() {
        let root = new_root();
        let target = root.join("sibling");
        fs::create_dir(&target).unwrap();
        let redirect = root.join("lu-native-runtime");
        let status = std::process::Command::new("cmd.exe")
            .arg("/C").arg("mklink").arg("/J")
            .arg(&redirect).arg(&target)
            .status().expect("cmd.exe available");
        assert!(status.success(), "creating a junction must succeed on the runner");
        assert_eq!(redirect.canonicalize().unwrap().parent(), Some(root.as_path()));
        assert!(is_redirected_entry(&fs::symlink_metadata(&redirect).unwrap()));
        fs::remove_dir(&redirect).unwrap();
        fs::remove_dir_all(root).unwrap();
    }
}
