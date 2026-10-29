//! Lu-only desktop startup guard and effect/task recovery.
//! Never opens or modifies Jan's historical conversation databases.
#![cfg(feature = "lu-foundation")]
use lu_core::{
    journal::EffectJournal,
    recovery::{reconcile_native_startup, RecoverySummary},
    tasks::TaskStore,
};
use std::{fs::{self, File, OpenOptions}, path::{Path, PathBuf}};

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
        let data = data_folder.canonicalize().map_err(|_| "Lu data root unavailable")?;
        let root = data.join("lu-native-runtime");
        fs::create_dir(&root).map_err(|_| "Lu runtime directory unavailable")?;
        let metadata = fs::symlink_metadata(&root).map_err(|_| "Lu runtime metadata unavailable")?;
        if !metadata.file_type().is_dir() || root.canonicalize().ok().as_deref().and_then(Path::parent) != Some(data.as_path()) {
            return Err("Lu runtime path is redirected".into());
        }
        // OS-level advisory lock, rather than a stale create_new sentinel.
        // Fail closed if a second Lu owner is already present.
        let owner = OpenOptions::new().read(true).write(true).create(true)
            .open(root.join("owner.lock")).map_err(|_| "Lu owner lock unavailable")?;
        owner.try_lock().map_err(|_| "Lu runtime already owned; recovery denied")?;
        let tasks = TaskStore::open(&root.join("tasks.sqlite"))
            .map_err(|_| "Lu task journal unavailable")?;
        let effects = EffectJournal::open(&root.join("effects.sqlite"))
            .map_err(|_| "Lu effect journal unavailable")?;
        let summary = reconcile_native_startup(&tasks, &effects)
            .map_err(|_| "Lu startup journal reconciliation failed")?;
        Ok(Self { _owner: owner, summary, root })
    }
}
