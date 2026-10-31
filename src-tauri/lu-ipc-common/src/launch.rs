//! IPC-04B experimental trusted-host launcher.
//!
//! No invocation from a model, WebView, extension, or external endpoint.
//! The caller must supply an independently approved executable SHA-256 and
//! host-issued turn scope. This launches only a direct child: neither
//! Linux descendant containment nor Windows Job Object containment is
//! claimed, so the module is not a shipping worker supervisor.
use crate::{authority::{HostAdmission, HostRevoker, HostScope}, Endpoint};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{self, Read},
    path::{Path, PathBuf},
    process::{Child, Command, ExitStatus, Stdio},
    thread,
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;

const MAX_BINARY_BYTES: u64 = 256 * 1024 * 1024;

fn rejected() -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, "Lu worker binary not host-attested")
}

/// Construct only with a trusted-host catalog's expected digest. Never copy a
/// digest or executable path from a worker, tool argument, or model response.
#[derive(Clone)]
pub struct TrustedWorker {
    executable: PathBuf,
    expected_sha256: [u8; 32],
}
impl TrustedWorker {
    pub fn attest(path: impl AsRef<Path>, expected_sha256: [u8; 32]) -> io::Result<Self> {
        let worker = Self {
            executable: path.as_ref().to_path_buf(),
            expected_sha256,
        };
        worker.verify()?;
        Ok(worker)
    }

    /// Recheck the digest immediately before launching. Path-to-process
    /// TOCTOU, Windows ancestor reparse points and signer trust still require
    /// an OS-specific sealed execution/attestation implementation.
    fn verify(&self) -> io::Result<()> {
        if !self.executable.is_absolute() { return Err(rejected()); }
        let metadata = fs::symlink_metadata(&self.executable)?;
        if metadata.file_type().is_symlink()
            || !metadata.is_file()
            || metadata.len() == 0
            || metadata.len() > MAX_BINARY_BYTES
        {
            return Err(rejected());
        }
        let mut source = File::open(&self.executable)?;
        let mut hasher = Sha256::new();
        let mut data = [0u8; 64 * 1024];
        loop {
            let n = source.read(&mut data)?;
            if n == 0 { break; }
            hasher.update(&data[..n]);
        }
        let digest = hasher.finalize();
        if digest.as_slice().ct_eq(&self.expected_sha256).unwrap_u8() != 1 {
            return Err(rejected());
        }
        Ok(())
    }

    /// Parent must already own and bind its private AF_UNIX endpoint.
    /// Bootstrap proof and endpoint path go exclusively to anonymous child
    /// stdin (not argv, environment, disk, or a public file).
    pub fn launch(
        &self,
        host: &mut HostAdmission,
        scope: HostScope,
        endpoint: &Endpoint,
        ttl: Duration,
    ) -> io::Result<LaunchedWorker> {
        self.verify()?;
        let (proof, revoker) = host.issue(scope, ttl)?;
        let mut command = Command::new(&self.executable);
        command
            .args(std::iter::empty::<&str>())
            .env_clear()
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            // Winsock's AF_UNIX service provider uses the system directory
            // to load its DLLs. An entirely empty Windows environment causes
            // WSAEPROVIDERFAILEDINIT (10106) in a fresh process. Permit only
            // the OS SystemRoot path, never caller credentials or tool input.
            let system_root = std::env::var_os("SystemRoot")
                .ok_or_else(|| io::Error::new(
                    io::ErrorKind::NotFound, "Windows SystemRoot unavailable"
                ))?;
            let root = Path::new(&system_root);
            if !root.is_absolute() || !root.is_dir() {
                return Err(rejected());
            }
            command.env("SystemRoot", system_root);
        }
        let child = match command.spawn() {
            Ok(child) => child,
            Err(err) => {
                revoker.revoke();
                return Err(err);
            }
        };
        let mut managed = LaunchedWorker { child, revoker };
        let pipe = managed.child.stdin.take().ok_or_else(|| {
            io::Error::other("Lu worker did not receive inherited stdin")
        })?;
        proof.deliver_bootstrap(pipe, endpoint)?;
        Ok(managed)
    }
}

/// Revocation is enforced by HostAdmission on every scoped operation.
/// This handle owns only the *direct* child; it is not yet a process-tree
/// containment boundary and must not be enabled in a release build.
pub struct LaunchedWorker {
    child: Child,
    revoker: HostRevoker,
}
impl LaunchedWorker {
    pub fn id(&self) -> u32 { self.child.id() }
    pub fn try_wait(&mut self) -> io::Result<Option<ExitStatus>> { self.child.try_wait() }
    pub fn wait_until(&mut self, deadline: Instant) -> io::Result<ExitStatus> {
        loop {
            if let Some(status) = self.child.try_wait()? { return Ok(status); }
            if Instant::now() >= deadline {
                return Err(io::Error::new(io::ErrorKind::TimedOut, "Lu worker exit deadline"));
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
    pub fn revoke(&self) { self.revoker.revoke(); }

    /// Reject all further operations, terminate the direct child and wait up
    /// to the caller-supplied deadline for evidence of its exit.
    pub fn stop(&mut self, deadline: Instant) -> io::Result<ExitStatus> {
        self.revoke();
        if let Some(status) = self.child.try_wait()? { return Ok(status); }
        self.child.kill()?;
        self.wait_until(deadline)
    }
}
impl Drop for LaunchedWorker {
    fn drop(&mut self) {
        self.revoker.revoke();
        if matches!(self.child.try_wait(), Ok(None)) {
            let _ = self.child.kill();
        }
        // Wait reaps the direct child, not any descendants; a production
        // supervisor must have a bounded OS process-group/Job containment.
        let _ = self.child.wait();
    }
}
