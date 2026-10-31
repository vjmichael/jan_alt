//! Lu-only desktop startup guard and effect/task recovery.
//! Never opens or modifies Jan's historical conversation databases.
#![cfg(feature = "lu-foundation")]
use lu_core::{
    journal::EffectJournal,
    recovery::{reconcile_native_startup, RecoverySummary},
    tasks::TaskStore,
};
use std::{
    fs::{self, File, Metadata, OpenOptions},
    path::{Path, PathBuf},
};

// In Windows, a directory junction is a reparse point, but need not be
// reported as a Rust symlink. Even a junction to a sibling of the Lu runtime
// root must be denied: canonical-parent checks alone cannot distinguish it
// from Lu's own ordinary directory.
fn is_redirected_entry(metadata: &Metadata) -> bool {
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

// Do not let a stale/malicious runtime entry redirect Lu's owner lock or
// SQLite journal to unrelated files. This is a startup guard, not a substitute
// for an ACL-protected profile or handle-based defense against same-user races.
fn require_unredirected_runtime_file(root: &Path, name: &str) -> Result<(), String> {
    match fs::symlink_metadata(root.join(name)) {
        Ok(metadata) if metadata.file_type().is_file() && !is_redirected_entry(&metadata) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        _ => Err("Lu runtime file is redirected or unavailable".into()),
    }
}

pub struct LuDesktopRecovery {
    // Held for the complete desktop lifetime. OS releases this on process death.
    _owner: File,
    pub summary: RecoverySummary,
    pub root: PathBuf,
}

impl LuDesktopRecovery {
    /// Call once from trusted Tauri setup, BEFORE launching Lu task workers.
    /// The process must separately establish that previously owned OS workers
    /// have exited. Workers spawned through the kill-on-close job are bounded
    /// by the previous host's lifetime; this is not a general process sweep.
    pub fn initialize(data_folder: &Path) -> Result<Self, String> {
        let data = data_folder
            .canonicalize()
            .map_err(|_| "Lu data root unavailable")?;
        let root = data.join("lu-native-runtime");
        // A cold start creates this directory; subsequent restarts reuse it.
        // Never follow an existing symlink or silently loosen the OS owner lock.
        match fs::create_dir(&root) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err("Lu runtime directory unavailable".into()),
        }
        let metadata =
            fs::symlink_metadata(&root).map_err(|_| "Lu runtime metadata unavailable")?;
        if !metadata.file_type().is_dir()
            || is_redirected_entry(&metadata)
            || root.canonicalize().ok().as_deref().and_then(Path::parent) != Some(data.as_path())
        {
            return Err("Lu runtime path is redirected".into());
        }
        for name in ["owner.lock", "tasks.sqlite", "effects.sqlite"] {
            require_unredirected_runtime_file(&root, name)?;
        }
        // OS-level advisory lock, rather than a stale create_new sentinel.
        // Fail closed if a second Lu owner is already present.
        let owner = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(root.join("owner.lock"))
            .map_err(|_| "Lu owner lock unavailable")?;
        owner
            .try_lock()
            .map_err(|_| "Lu runtime already owned; recovery denied")?;
        let tasks = TaskStore::open(&root.join("tasks.sqlite"))
            .map_err(|_| "Lu task journal unavailable")?;
        let effects = EffectJournal::open(&root.join("effects.sqlite"))
            .map_err(|_| "Lu effect journal unavailable")?;
        let summary = reconcile_native_startup(&tasks, &effects)
            .map_err(|_| "Lu startup journal reconciliation failed")?;
        Ok(Self {
            _owner: owner,
            summary,
            root,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn existing_native_runtime_reopens_after_exit_but_rejects_parallel_owner() {
        let root = std::env::temp_dir().join(format!(
            "lu-recovery-restart-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4().simple(),
        ));
        fs::create_dir_all(&root).unwrap();
        let first = LuDesktopRecovery::initialize(&root).unwrap();
        assert!(first.root.join("owner.lock").is_file());
        assert!(
            LuDesktopRecovery::initialize(&root).is_err(),
            "exclusive owner guard"
        );
        drop(first);
        let reopened = LuDesktopRecovery::initialize(&root)
            .expect("preexisting native runtime directory is valid after exit");
        drop(reopened);
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn redirected_owner_and_journal_files_are_denied_without_writes() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(format!(
            "lu-recovery-file-redirect-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4().simple(),
        ));
        let runtime = root.join("lu-native-runtime");
        fs::create_dir_all(&runtime).unwrap();
        let sentinel = root.join("keep.txt");
        fs::write(&sentinel, b"unchanged").unwrap();
        for name in ["owner.lock", "tasks.sqlite", "effects.sqlite"] {
            let link = runtime.join(name);
            symlink(&sentinel, &link).unwrap();
            assert!(
                LuDesktopRecovery::initialize(&root).is_err(),
                "{name} must not redirect to another file"
            );
            assert_eq!(fs::read(&sentinel).unwrap(), b"unchanged");
            fs::remove_file(&link).unwrap();
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn junction_into_sibling_runtime_directory_is_denied() {
        // Unlike an external target, a sibling junction passes the old
        // canonical-parent check; reject on the Windows reparse attribute.
        let root = std::env::temp_dir().join(format!(
            "lu-recovery-junction-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4().simple(),
        ));
        fs::create_dir_all(&root).unwrap();
        let target = root.join("other-runtime");
        fs::create_dir(&target).unwrap();
        let link = root.join("lu-native-runtime");
        let output = std::process::Command::new("cmd.exe")
            .arg("/C")
            .arg("mklink")
            .arg("/J")
            .arg(&link)
            .arg(&target)
            .output()
            .expect("Windows junction creation command unavailable");
        assert!(output.status.success(), "Windows junction creation failed");
        assert!(
            LuDesktopRecovery::initialize(&root).is_err(),
            "sibling junction must never become the trusted runtime root"
        );
        // Removing the junction with remove_dir does not traverse its target.
        fs::remove_dir(&link).unwrap();
        fs::remove_dir_all(&root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn redirected_native_runtime_directory_stays_denied() {
        use std::os::unix::fs::symlink;
        let root = std::env::temp_dir().join(format!(
            "lu-recovery-redirect-{}-{}",
            std::process::id(),
            uuid::Uuid::new_v4().simple(),
        ));
        fs::create_dir_all(&root).unwrap();
        symlink(std::env::temp_dir(), root.join("lu-native-runtime")).unwrap();
        assert!(LuDesktopRecovery::initialize(&root).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
