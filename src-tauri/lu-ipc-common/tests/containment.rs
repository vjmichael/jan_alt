//! Native descendant lifecycle acceptance. Must never touch a user profile.
use lu_ipc_common::{
    authority::{HostAdmission, HostScope},
    launch::TrustedWorker, Endpoint, Listener,
};
use sha2::{Digest, Sha256};
use std::{fs, path::{Path, PathBuf}, thread, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};

const TREE: &str = env!("CARGO_BIN_EXE_lu-ipc-tree-fixture");
struct Root(PathBuf);
impl Root {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "lu-c-{}-{:x}", std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir(&path).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        }
        Self(path)
    }
    fn endpoint(&self) -> Endpoint { Endpoint::new(self.0.join("s")).unwrap() }
    fn descendant_pid(&self) -> u32 {
        let stop = Instant::now() + Duration::from_secs(10);
        loop {
            if let Ok(contents) = fs::read_to_string(self.0.join("descendant.pid")) {
                if let Ok(pid) = contents.parse() { return pid; }
            }
            assert!(Instant::now() < stop, "test child did not start");
            thread::sleep(Duration::from_millis(10));
        }
    }
}
impl Drop for Root { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
fn scope() -> HostScope {
    HostScope::new("profile1", "workspace1", "conv1", "turn1", "read_text_file", "read").unwrap()
}
fn deadline() -> Instant { Instant::now() + Duration::from_secs(10) }
fn tree_worker() -> TrustedWorker {
    let hash: [u8; 32] = Sha256::digest(fs::read(TREE).unwrap()).into();
    TrustedWorker::attest(Path::new(TREE), hash).unwrap()
}
#[cfg(target_os = "linux")]
fn still_running(pid: u32) -> bool {
    let status = match fs::read_to_string(format!("/proc/{pid}/stat")) {
        Ok(value) => value,
        Err(_) => return false,
    };
    let state = status.rsplit_once(") ").and_then(|(_, rest)| rest.chars().next());
    !matches!(state, Some('Z' | 'X') | None)
}
#[cfg(windows)]
fn still_running(pid: u32) -> bool {
    use windows_sys::Win32::{
        Foundation::CloseHandle,
        System::Threading::{GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
    };
    // SAFETY: OpenProcess produces a handle owned here; it is closed after
    // querying only whether the independent test descendant is still active.
    let handle = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if handle.is_null() { return false; }
    let mut exit_code = 0;
    let ok = unsafe { GetExitCodeProcess(handle, &mut exit_code) };
    unsafe { CloseHandle(handle) };
    ok != 0 && exit_code == 259
}
#[cfg(not(any(target_os = "linux", windows)))]
fn still_running(pid: u32) -> bool {
    use nix::{sys::signal::kill, unistd::Pid};
    kill(Pid::from_raw(pid as i32), None).is_ok()
}
fn assert_descendant_exits(pid: u32) {
    let end = deadline();
    while still_running(pid) && Instant::now() < end {
        thread::sleep(Duration::from_millis(20));
    }
    assert!(!still_running(pid), "descendant remained alive after worker cleanup");
}
fn start(root: &Root) -> (lu_ipc_common::launch::LaunchedWorker, u32) {
    let endpoint = root.endpoint();
    let listener = Listener::bind(endpoint.clone()).unwrap();
    let mut admission = HostAdmission::new();
    let worker = tree_worker().launch(
        &mut admission, scope(), &endpoint, Duration::from_secs(20),
    ).unwrap();
    assert_ne!(worker.id(), 0);
    let _peer = admission.admit(&listener, deadline()).unwrap();
    let pid = root.descendant_pid();
    assert!(still_running(pid), "test descendant exited before containment");
    (worker, pid)
}

#[test]
fn revocation_stop_terminates_attached_descendant() {
    let root = Root::new();
    let (mut worker, pid) = start(&root);
    #[cfg(windows)]
    assert_eq!(worker.containment_mode(), "win-job-kill-on-close-postspawn");
    #[cfg(unix)]
    assert_eq!(worker.containment_mode(), "unix-process-group-escapable");
    let status = worker.stop(deadline()).unwrap();
    assert!(!status.success());
    assert_descendant_exits(pid);
}
#[test]
fn dropping_host_owned_handle_terminates_descendant() {
    let root = Root::new();
    let (worker, pid) = start(&root);
    drop(worker);
    assert_descendant_exits(pid);
}

#[cfg(target_os = "linux")]
#[test]
fn cgroup_v2_gate_denies_ordinary_directory() {
    use lu_ipc_common::containment::LinuxCgroup;
    let root = Root::new();
    let e = LinuxCgroup::create(&root.0, "test01").err().unwrap();
    assert!(matches!(e.kind(), std::io::ErrorKind::PermissionDenied | std::io::ErrorKind::Unsupported));
}

#[cfg(target_os = "linux")]
#[test]
fn optional_delegated_cgroup_kill_real_descendant_if_configured() {
    use lu_ipc_common::containment::LinuxCgroup;
    let parent = match std::env::var_os("LU_TEST_DELEGATED_CGROUP") {
        Some(value) => PathBuf::from(value),
        None => return, // Does NOT constitute a cgroup test PASS in CI.
    };
    let root = Root::new();
    let group = LinuxCgroup::create(&parent, &format!("test-{}", std::process::id())).unwrap();
    let endpoint = root.endpoint();
    let listener = Listener::bind(endpoint.clone()).unwrap();
    let mut host = HostAdmission::new();
    let mut worker = tree_worker().launch_in_cgroup(
        &mut host, scope(), &endpoint, Duration::from_secs(20), group,
    ).unwrap();
    assert_eq!(worker.containment_mode(), "linux-cgroup-v2");
    let _peer = host.admit(&listener, deadline()).unwrap();
    let pid = root.descendant_pid();
    assert!(still_running(pid));
    worker.stop(deadline()).unwrap();
    assert_descendant_exits(pid);
}


#[cfg(windows)]
#[test]
fn hard_host_death_closes_job_and_terminates_descendant() {
    use std::process::{Command, Stdio};
    const HOST: &str = env!("CARGO_BIN_EXE_lu-ipc-host-death-fixture");
    let root = Root::new();
    let mut host = Command::new(HOST)
        .arg(&root.0)
        .arg(TREE)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let pid = root.descendant_pid();
    assert!(still_running(pid));
    host.kill().unwrap();
    host.wait().unwrap();
    assert_descendant_exits(pid);
}
