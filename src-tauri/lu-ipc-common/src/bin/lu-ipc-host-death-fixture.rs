//! Windows-only IPC-04C test host. Killed externally by the integration test
//! to assert JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE descendant cleanup.
//! This binary is test-only, not a shipping Lu host.
#[cfg(windows)]
fn main() {
    if run().is_err() { std::process::exit(44); }
}
#[cfg(not(windows))]
fn main() {}

#[cfg(windows)]
fn run() -> std::io::Result<()> {
    use lu_ipc_common::{
        authority::{HostAdmission, HostScope},
        launch::TrustedWorker,
        Endpoint, Listener,
    };
    use sha2::{Digest, Sha256};
    use std::{fs, path::PathBuf, thread, time::{Duration, Instant}};
    let args: Vec<_> = std::env::args_os().collect();
    if args.len() != 3 {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "fixture args"));
    }
    let root = PathBuf::from(&args[1]);
    let executable = PathBuf::from(&args[2]);
    if !root.is_absolute() || !executable.is_absolute() {
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, "fixture paths"));
    }
    let endpoint = Endpoint::new(root.join("s"))?;
    let listener = Listener::bind(endpoint.clone())?;
    let hash: [u8;32] = Sha256::digest(fs::read(&executable)?).into();
    let worker = TrustedWorker::attest(&executable, hash)?;
    let mut admission = HostAdmission::new();
    let scope = HostScope::new("profile1","workspace1","conv1","turn1","read_text_file","read")?;
    let _child = worker.launch(&mut admission, scope, &endpoint, Duration::from_secs(20))?;
    let _peer = admission.admit(&listener, Instant::now() + Duration::from_secs(15))?;
    // Holding the job handle is the point of this fixture. An external
    // TerminateProcess closes the handle; the worker and descendant must die.
    loop { thread::sleep(Duration::from_secs(1)); }
}
