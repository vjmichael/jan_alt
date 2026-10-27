//! Content-addressed staging for verified single-file native CE executables.
//! Never extract a user-supplied archive or execute from an untrusted path.
//! A verified digest does not imply that an OS sandbox is available.

use std::{
    fs::{self, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

use crate::ce_signing::VerifiedCePackage;
use sha2::{Digest, Sha256};

static NONCE: AtomicU64 = AtomicU64::new(1);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CeStageError {
    InvalidRoot,
    InvalidExecutable,
    ChangedOnDisk,
    Io(String),
}

impl From<std::io::Error> for CeStageError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error.to_string())
    }
}

#[derive(Clone)]
pub struct StagedCeExecutable {
    package: VerifiedCePackage,
    path: PathBuf,
}

impl StagedCeExecutable {
    pub fn package(&self) -> &VerifiedCePackage {
        &self.package
    }

    /// The path is private to the trusted host. Do not send it to a worker,
    /// model, or webview as a credential.
    pub fn host_path(&self) -> &Path {
        &self.path
    }

    /// Re-hash immediately before every launch. This does not eliminate all
    /// same-user filesystem TOCTOU risks; hardened platform launchers must
    /// additionally pin file identity / restrict staging-directory writes.
    pub fn verify_on_disk(&self) -> Result<(), CeStageError> {
        let metadata = fs::symlink_metadata(&self.path)?;
        if !metadata.file_type().is_file()
            || metadata.len() as usize != self.package.artifact().len()
        {
            return Err(CeStageError::ChangedOnDisk);
        }
        let file = fs::File::open(&self.path)?;
        let mut bytes = Vec::new();
        file.take((self.package.artifact().len() + 1) as u64)
            .read_to_end(&mut bytes)?;
        if bytes.len() != self.package.artifact().len()
            || format!("{:x}", Sha256::digest(&bytes)) != self.package.artifact_sha256()
        {
            return Err(CeStageError::ChangedOnDisk);
        }
        Ok(())
    }
}

pub struct CeExecutableStager {
    root: PathBuf,
}

impl CeExecutableStager {
    /// Trusted host must pass a private, pre-created, non-symlink Lu directory.
    pub fn new(root: &Path) -> Result<Self, CeStageError> {
        let metadata = fs::symlink_metadata(root).map_err(|_| CeStageError::InvalidRoot)?;
        if !metadata.file_type().is_dir() {
            return Err(CeStageError::InvalidRoot);
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if metadata.permissions().mode() & 0o077 != 0 {
                return Err(CeStageError::InvalidRoot);
            }
        }
        let root = root.canonicalize().map_err(|_| CeStageError::InvalidRoot)?;
        Ok(Self { root })
    }

    /// Only a single signed executable file is supported, not zip/tar,
    /// scripts, installers, shared libraries, or executable directories.
    pub fn stage(&self, package: VerifiedCePackage) -> Result<StagedCeExecutable, CeStageError> {
        let bytes = package.artifact();
        #[cfg(target_os = "linux")]
        if !bytes.starts_with(b"\x7fELF") {
            return Err(CeStageError::InvalidExecutable);
        }
        #[cfg(target_os = "windows")]
        if !bytes.starts_with(b"MZ") {
            return Err(CeStageError::InvalidExecutable);
        }
        #[cfg(target_os = "macos")]
        if ![
            b"\xfe\xed\xfa\xcf",
            b"\xcf\xfa\xed\xfe",
            b"\xca\xfe\xba\xbe",
        ]
        .iter()
        .any(|magic| bytes.starts_with(*magic))
        {
            return Err(CeStageError::InvalidExecutable);
        }

        let dir = self.root.join(package.artifact_sha256());
        if dir.exists() {
            if !fs::symlink_metadata(&dir)?.file_type().is_dir() {
                return Err(CeStageError::InvalidRoot);
            }
        } else {
            fs::create_dir(&dir)?;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&dir, fs::Permissions::from_mode(0o700))?;
        }
        let path = dir.join(if cfg!(windows) {
            "worker.exe"
        } else {
            "worker"
        });
        if !path.exists() {
            let temp = dir.join(format!(
                ".pending-{}-{}",
                std::process::id(),
                NONCE.fetch_add(1, Ordering::Relaxed)
            ));
            let result = (|| -> Result<(), CeStageError> {
                let mut options = OpenOptions::new();
                options.write(true).create_new(true);
                let mut file = options.open(&temp)?;
                file.write_all(bytes)?;
                file.sync_all()?;
                #[cfg(unix)]
                {
                    use std::os::unix::fs::PermissionsExt;
                    fs::set_permissions(&temp, fs::Permissions::from_mode(0o500))?;
                }
                fs::rename(&temp, &path)?;
                Ok(())
            })();
            if result.is_err() {
                let _ = fs::remove_file(&temp);
            }
            result?;
        }
        let staged = StagedCeExecutable { package, path };
        staged.verify_on_disk()?;
        Ok(staged)
    }
}
