//! IPC-04C process-tree containment behind a host-only interface.
//!
//! Windows: an unnamed, non-inheritable Job Object with KILL_ON_JOB_CLOSE
//! and *no* breakaway flag. Assignment occurs after process creation but
//! before the trusted bootstrap credential is delivered; the non-atomic
//! CreateProcess -> AssignProcess gap is NOT a production host-death proof.
//!
//! Unix: a private process group created before exec. A worker may escape
//! the group using setsid/setpgid; Linux cgroup v2 is an optional stronger
//! explicitly admitted mode and requires a writable delegated subtree.
//!
//! Do not ship this component as a sandbox or claim full worker authority.
use std::{io, process::Child};

#[cfg(windows)]
#[path = "containment_windows_job.rs"]
mod windows_job;

#[cfg(windows)]
pub struct TreeContainment(windows_job::WindowsJob);

#[cfg(windows)]
impl TreeContainment {
    pub(crate) fn prepare() -> io::Result<Self> { windows_job::WindowsJob::new().map(Self) }
    pub(crate) fn attach(&mut self, child: &Child) -> io::Result<()> { self.0.attach(child) }
    pub(crate) fn terminate(&self) -> io::Result<()> { self.0.terminate() }
    pub fn mode(&self) -> &'static str { "win-job-kill-on-close-postspawn" }
}

#[cfg(unix)]
pub struct TreeContainment {
    pgid: Option<i32>,
    #[cfg(target_os = "linux")]
    cgroup: Option<LinuxCgroup>,
}

#[cfg(unix)]
impl TreeContainment {
    pub(crate) fn prepare(
        #[cfg(target_os = "linux")] cgroup: Option<LinuxCgroup>,
    ) -> io::Result<Self> {
        Ok(Self {
            pgid: None,
            #[cfg(target_os = "linux")]
            cgroup,
        })
    }
    pub(crate) fn attach(&mut self, child: &Child) -> io::Result<()> {
        let pgid = i32::try_from(child.id()).map_err(|_| {
            io::Error::new(io::ErrorKind::InvalidData, "Lu worker pid out of range")
        })?;
        if pgid <= 1 {
            return Err(io::Error::new(io::ErrorKind::PermissionDenied, "unsafe process group id"));
        }
        #[cfg(target_os = "linux")]
        if let Some(cgroup) = &self.cgroup {
            // The child cannot receive its bootstrap proof until attached.
            cgroup.attach(child.id())?;
        }
        self.pgid = Some(pgid);
        Ok(())
    }
    pub(crate) fn terminate(&self) -> io::Result<()> {
        #[cfg(target_os = "linux")]
        if let Some(cgroup) = &self.cgroup {
            // cgroup.kill acts on the full subgroup, including setsid escapes.
            return cgroup.kill();
        }
        let pgid = self.pgid.ok_or_else(|| {
            io::Error::new(io::ErrorKind::InvalidInput, "unattached process group")
        })?;
        use nix::{errno::Errno, sys::signal::{killpg, Signal}, unistd::Pid};
        match killpg(Pid::from_raw(pgid), Signal::SIGKILL) {
            Ok(()) | Err(Errno::ESRCH) => Ok(()),
            Err(error) => Err(io::Error::from_raw_os_error(error as i32)),
        }
    }
    pub fn mode(&self) -> &'static str {
        #[cfg(target_os = "linux")]
        if self.cgroup.is_some() { return "linux-cgroup-v2"; }
        "unix-process-group-escapable"
    }
}

/// The host must pass a *trusted delegated* cgroup v2 parent. This is not a
/// filesystem sandbox. A process with sufficient rights to migrate itself
/// out of the delegated subtree can still escape; production use needs an
/// independently vetted delegation/namespace policy.
#[cfg(target_os = "linux")]
pub struct LinuxCgroup {
    path: std::path::PathBuf,
}
#[cfg(target_os = "linux")]
impl LinuxCgroup {
    pub fn create(delegated_parent: &std::path::Path, group_id: &str) -> io::Result<Self> {
        use std::{fs, os::unix::fs::{MetadataExt, PermissionsExt}};
        if group_id.is_empty() || group_id.len() > 64 ||
            !group_id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') ||
            !delegated_parent.is_absolute()
        {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "invalid Lu cgroup scope"));
        }
        let parent = fs::symlink_metadata(delegated_parent)?;
        // Only the trusted host's effective UID may manage the delegated
        // subtree; unprivileged/world-writable parents are forbidden.
        if !parent.is_dir() || parent.file_type().is_symlink() ||
            parent.uid() != nix::unistd::Uid::effective().as_raw() ||
            parent.permissions().mode() & 0o022 != 0 ||
            !delegated_parent.join("cgroup.controllers").is_file() ||
            !delegated_parent.join("cgroup.procs").is_file()
        {
            return Err(io::Error::new(io::ErrorKind::PermissionDenied, "cgroup v2 delegation not trusted"));
        }
        let path = delegated_parent.join(format!("lu-{group_id}"));
        fs::create_dir(&path)?;
        if !path.join("cgroup.kill").is_file() ||
            !path.join("cgroup.events").is_file() ||
            !path.join("cgroup.procs").is_file()
        {
            let _ = fs::remove_dir(&path);
            return Err(io::Error::new(io::ErrorKind::Unsupported, "cgroup v2 kill interface unavailable"));
        }
        Ok(Self { path })
    }
    fn attach(&self, pid: u32) -> io::Result<()> {
        std::fs::write(self.path.join("cgroup.procs"), pid.to_string())
    }
    pub fn kill(&self) -> io::Result<()> {
        std::fs::write(self.path.join("cgroup.kill"), b"1")
    }
    pub fn wait_empty(&self, deadline: std::time::Instant) -> io::Result<()> {
        use std::{fs, thread, time::Duration};
        loop {
            let events = fs::read_to_string(self.path.join("cgroup.events"))?;
            if events.lines().any(|line| line == "populated 0") { return Ok(()); }
            if std::time::Instant::now() >= deadline {
                return Err(io::Error::new(io::ErrorKind::TimedOut, "cgroup did not drain"));
            }
            thread::sleep(Duration::from_millis(10));
        }
    }
}
#[cfg(target_os = "linux")]
impl Drop for LinuxCgroup {
    fn drop(&mut self) {
        let _ = self.kill();
        // rmdir only empties this unique child, never an ancestor.
        let _ = std::fs::remove_dir(&self.path);
    }
}
