//! Host-only, supervised Lu Core Extension worker *foundation*.
//!
//! Executes only a built-in diagnostic mode of Lu's own trusted executable.
//! No package entrypoint, script, shell, DLL, model-supplied argv or webview
//! command can reach this launcher. External executable CEs remain quarantined.
//! The host must authenticate the conversation origin and choose the private
//! scope directory; neither comes from a model-generated request.
//!
//! OS confinement is supplied by the existing native jail backends. Linux uses
//! bubblewrap, macOS Seatbelt and Windows AppContainer with a *mandatory*
//! kill-on-close Job Object. No backend => no launch. This is not yet a signed
//! CE package runtime, typed resource broker, or release-ready sandbox.

use std::{
    collections::BTreeMap,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::Stdio,
    sync::{Arc, Mutex},
    time::Duration,
};

use lu_core::{
    AuthorizationError, BoundCallOrigin, CePermissionStore, ConversationAuthority, ToolAuthorizer,
    ToolDescriptor, ToolEffect, ToolInvocation,
};
use serde::Deserialize;
use tokio::{
    io::AsyncReadExt,
    process::{Child, Command},
    sync::oneshot,
    task::AbortHandle,
    time::timeout,
};

use super::{
    jail::{self, Backend, Policy},
    proc::{self, ShellConfig, ShellKind},
};

const PROBE_FLAG: &str = "--internal-lu-ce-probe";
const HOLD_FLAG: &str = "--internal-lu-ce-hold";
const CHILD_FLAG: &str = "--internal-lu-ce-child";
pub const PROBE_TOOL: &str = "lu.ce.worker.probe";
pub const HOLD_TOOL: &str = "lu.ce.worker.hold";
pub const INPUT_TYPE: &str = "type.googleapis.com/lu.v1.CeProbeRequest";
pub const OUTPUT_TYPE: &str = "type.googleapis.com/lu.v1.CeProbeResult";
const MAX_OUTPUT: u64 = 4096;
const MAX_RUNTIME: Duration = Duration::from_secs(15);

/// Only host-owned fixed diagnostics run here. A model cannot select arbitrary
/// executables or arguments, even with a forged ToolInvocation.
#[derive(Debug, Clone)]
enum Mode {
    Probe { secret: PathBuf, target: SocketAddr },
    Hold { heartbeat: PathBuf },
}

#[derive(Debug, PartialEq, Eq)]
pub enum WorkerError {
    InvalidScope,
    PermissionDenied(String),
    NoSandbox,
    RootHost,
    Spawn(String),
    NoProcessId,
    Timeout,
    OutputTooLarge,
    WorkerFailed(String),
    IsolationBreach,
    Cancelled,
    Unavailable,
}

#[derive(Debug)]
pub struct WorkerReport {
    pub backend: Backend,
    pub output: String,
}

#[derive(Debug, Deserialize)]
struct ProbeReply {
    file_denied: bool,
    network_denied: bool,
}

/// The receiver is deliberately separate from the cancellation authority.
/// Dropping a ticket does not implicitly detach a privileged worker forever:
/// the supervisor still owns its abort handle and kills it on shutdown.
pub struct WorkerTicket {
    pub id: u64,
    response: oneshot::Receiver<Result<WorkerReport, WorkerError>>,
}

impl WorkerTicket {
    pub async fn result(self) -> Result<WorkerReport, WorkerError> {
        self.response.await.map_err(|_| WorkerError::Cancelled)?
    }
}

struct RunningWorker {
    abort: AbortHandle,
    task_id: String,
    tool_id: String,
}

struct Running {
    active: Mutex<BTreeMap<u64, RunningWorker>>,
}

struct Registration {
    id: u64,
    running: Arc<Running>,
}

impl Drop for Registration {
    fn drop(&mut self) {
        if let Ok(mut active) = self.running.active.lock() {
            active.remove(&self.id);
        }
    }
}

/// A worker is held in a dedicated process group on Unix; on Windows it is
/// launched through the strict AppContainer helper whose Job Object owns all
/// descendants. On future cancellation, Drop reaps the entire group/tree.
struct ProcessGuard {
    child: Child,
    pid: Option<u32>,
}

impl Drop for ProcessGuard {
    fn drop(&mut self) {
        #[cfg(unix)]
        if let Some(pid) = self.pid.take() {
            proc::kill_tree(pid);
        }
        #[cfg(windows)]
        {
            // Do not shell out to taskkill (PATH-dependent and blocking).
            // Killing the strict AppContainer helper closes its mandatory
            // kill-on-close Job Object, terminating the entire worker tree.
            let _ = self.child.start_kill();
            self.pid.take();
        }
        // Child.kill_on_drop(true) also terminates the direct process.
    }
}

/// Created by trusted Rust host code only. Never expose this constructor or
/// start methods through Tauri commands without a verified host-origin adapter.
pub struct CeWorkerSupervisor {
    authority: ConversationAuthority,
    policy: Arc<dyn ToolAuthorizer>,
    scope_id: String,
    workspace: PathBuf,
    data_root: PathBuf,
    next_id: std::sync::atomic::AtomicU64,
    running: Arc<Running>,
}

impl CeWorkerSupervisor {
    pub fn new(
        authority: ConversationAuthority,
        policy: Arc<dyn ToolAuthorizer>,
        scope_id: String,
        workspace: &Path,
        data_root: &Path,
    ) -> Result<Self, WorkerError> {
        let workspace = workspace
            .canonicalize()
            .map_err(|_| WorkerError::InvalidScope)?;
        let data_root = data_root
            .canonicalize()
            .map_err(|_| WorkerError::InvalidScope)?;
        if scope_id.is_empty()
            || scope_id.len() > 128
            || !workspace.is_dir()
            || !data_root.is_dir()
            || workspace == data_root
            || !workspace.starts_with(&data_root)
        {
            return Err(WorkerError::InvalidScope);
        }
        let running = Arc::new(Running {
            active: Mutex::new(BTreeMap::new()),
        });
        let weak = Arc::downgrade(&running);
        authority
            .on_task_revoked(Arc::new(move |task_id| {
                if let Some(running) = weak.upgrade() {
                    if let Ok(active) = running.active.lock() {
                        for worker in active.values() {
                            if worker.task_id == task_id {
                                worker.abort.abort();
                            }
                        }
                    }
                }
            }))
            .map_err(|_| WorkerError::Unavailable)?;
        Ok(Self {
            authority,
            policy,
            scope_id,
            workspace,
            data_root,
            next_id: std::sync::atomic::AtomicU64::new(1),
            running,
        })
    }

    /// Attach the durable permission store before starting signed CE work.
    /// Revocation closes the SQLite grant and synchronously aborts all matching
    /// workers before revoke() returns. The callback holds only a weak handle.
    pub fn bind_permission_revocations(
        &self,
        store: &CePermissionStore,
        profile: &str,
        package: &str,
    ) -> Result<(), WorkerError> {
        if profile.is_empty() || package.is_empty() {
            return Err(WorkerError::InvalidScope);
        }
        let profile = profile.to_owned();
        let package = package.to_owned();
        let scope = self.scope_id.clone();
        let weak = Arc::downgrade(&self.running);
        store
            .subscribe_revocations(Arc::new(move |event| {
                if event.profile_id != profile
                    || event.package_id != package
                    || event.scope_id != scope
                {
                    return;
                }
                if let Some(running) = weak.upgrade() {
                    if let Ok(active) = running.active.lock() {
                        for worker in active.values() {
                            if event
                                .tool_id
                                .as_ref()
                                .is_none_or(|id| id == &worker.tool_id)
                            {
                                worker.abort.abort();
                            }
                        }
                    }
                }
            }))
            .map_err(|_| WorkerError::Unavailable)
    }

    fn authorize(
        &self,
        origin: &BoundCallOrigin,
        invocation: &ToolInvocation,
        tool_id: &str,
    ) -> Result<(), WorkerError> {
        if invocation.workspace_id.as_deref() != Some(self.scope_id.as_str())
            || !invocation.input.bytes.is_empty()
            || invocation.tool_id != tool_id
        {
            return Err(WorkerError::PermissionDenied(
                "worker scope or tool mismatch".into(),
            ));
        }
        let descriptor = ToolDescriptor {
            id: tool_id.into(),
            display_name: "Lu internal CE worker diagnostic".into(),
            effect: if tool_id == HOLD_TOOL {
                ToolEffect::WriteWorkspace
            } else {
                ToolEffect::ReadWorkspace
            },
            input_type_url: INPUT_TYPE.into(),
            output_type_url: OUTPUT_TYPE.into(),
        };
        self.authority
            .authorize_worker_call(origin, invocation, &descriptor, self.policy.as_ref())
            .map_err(|AuthorizationError { reason }| WorkerError::PermissionDenied(reason))
    }

    /// A negative security probe: the host must supply an EXISTING private
    /// sibling file and an active loopback listener. A missing file or closed
    /// port cannot prove isolation. The worker fails if either is reachable.
    pub fn start_probe(
        &self,
        origin: &BoundCallOrigin,
        invocation: &ToolInvocation,
        secret: &Path,
        target: SocketAddr,
    ) -> Result<WorkerTicket, WorkerError> {
        self.authorize(origin, invocation, PROBE_TOOL)?;
        let secret = secret
            .canonicalize()
            .map_err(|_| WorkerError::InvalidScope)?;
        if !secret.is_file()
            || !secret.starts_with(&self.data_root)
            || secret.starts_with(&self.workspace)
            || !target.ip().is_loopback()
        {
            return Err(WorkerError::InvalidScope);
        }
        self.start(
            origin,
            invocation,
            PROBE_TOOL,
            Mode::Probe { secret, target },
            Duration::from_secs(8),
        )
    }

    /// Diagnostic hold mode used to verify cancellation reaps descendants.
    /// The heartbeat must be a host-selected file inside this private scope.
    pub fn start_hold(
        &self,
        origin: &BoundCallOrigin,
        invocation: &ToolInvocation,
        heartbeat: &Path,
    ) -> Result<WorkerTicket, WorkerError> {
        self.authorize(origin, invocation, HOLD_TOOL)?;
        let parent = heartbeat.parent().ok_or(WorkerError::InvalidScope)?;
        let parent = parent
            .canonicalize()
            .map_err(|_| WorkerError::InvalidScope)?;
        if parent != self.workspace
            || heartbeat.file_name().is_none()
            || heartbeat.symlink_metadata().is_ok()
        {
            return Err(WorkerError::InvalidScope);
        }
        self.start(
            origin,
            invocation,
            HOLD_TOOL,
            Mode::Hold {
                heartbeat: parent.join(heartbeat.file_name().unwrap()),
            },
            MAX_RUNTIME,
        )
    }

    fn start(
        &self,
        origin: &BoundCallOrigin,
        invocation: &ToolInvocation,
        tool_id: &str,
        mode: Mode,
        budget: Duration,
    ) -> Result<WorkerTicket, WorkerError> {
        if !jail::backend().enforces() {
            return Err(WorkerError::NoSandbox);
        }
        #[cfg(unix)]
        if unsafe { nix::libc::geteuid() } == 0 {
            return Err(WorkerError::RootHost);
        }
        let id = self
            .next_id
            .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let (response_tx, response_rx) = oneshot::channel();
        let (start_tx, start_rx) = oneshot::channel();
        let running = Arc::clone(&self.running);
        let workspace = self.workspace.clone();
        let data_root = self.data_root.clone();
        let authority = self.authority.clone();
        let host_policy = Arc::clone(&self.policy);
        let origin = origin.clone();
        let invocation = invocation.clone();
        let tool_id = tool_id.to_string();
        let task_id_for_tracking = origin.task_id.clone();
        let tool_id_for_tracking = tool_id.clone();
        let task = tokio::spawn(async move {
            let _registration = Registration { id, running };
            if start_rx.await.is_err() {
                return;
            }
            // Revalidate after scheduling and immediately before process
            // creation: a revoked task cannot launch merely because its
            // first admission check preceded the scheduler handoff.
            let descriptor = ToolDescriptor {
                id: tool_id.clone(),
                display_name: "Lu internal CE worker diagnostic".into(),
                effect: if tool_id == HOLD_TOOL {
                    ToolEffect::WriteWorkspace
                } else {
                    ToolEffect::ReadWorkspace
                },
                input_type_url: INPUT_TYPE.into(),
                output_type_url: OUTPUT_TYPE.into(),
            };
            let outcome = match authority.authorize_worker_call(
                &origin,
                &invocation,
                &descriptor,
                host_policy.as_ref(),
            ) {
                Ok(()) => execute(mode, &workspace, &data_root, budget).await,
                Err(error) => Err(WorkerError::PermissionDenied(error.reason)),
            };
            let _ = response_tx.send(outcome);
        });
        let abort = task.abort_handle();
        drop(task);
        let mut active = self
            .running
            .active
            .lock()
            .map_err(|_| WorkerError::Unavailable)?;
        active.insert(
            id,
            RunningWorker {
                abort,
                task_id: task_id_for_tracking,
                tool_id: tool_id_for_tracking,
            },
        );
        drop(active);
        let _ = start_tx.send(());
        Ok(WorkerTicket {
            id,
            response: response_rx,
        })
    }

    pub fn cancel(&self, id: u64) -> bool {
        match self.running.active.lock() {
            Ok(active) => {
                if let Some(handle) = active.get(&id) {
                    handle.abort.abort();
                    true
                } else {
                    false
                }
            }
            Err(_) => false,
        }
    }

    /// Host-only task-scoped cancellation. The caller must derive task_id from
    /// trusted task state, never from model output. Aborting the owning async
    /// tasks drops their process guards (and the Windows kill-on-close Job).
    /// Return is the number of workers signalled, NOT an exit acknowledgment.
    pub fn cancel_task(&self, task_id: &str) -> Result<usize, WorkerError> {
        if task_id.is_empty() {
            return Err(WorkerError::InvalidScope);
        }
        let active = self
            .running
            .active
            .lock()
            .map_err(|_| WorkerError::Unavailable)?;
        let mut signalled = 0;
        for worker in active.values() {
            if worker.task_id == task_id {
                worker.abort.abort();
                signalled += 1;
            }
        }
        Ok(signalled)
    }

    /// Wait for task registrations to drain. This acknowledges host task
    /// termination, not OS-level descendant exit or successful effect rollback.
    /// The host must inspect uncertain effects before a task is resumed.
    pub async fn wait_task_drained(
        &self,
        task_id: &str,
        deadline: Duration,
    ) -> Result<bool, WorkerError> {
        if task_id.is_empty() {
            return Err(WorkerError::InvalidScope);
        }
        let wait = async {
            loop {
                {
                    let active = self
                        .running
                        .active
                        .lock()
                        .map_err(|_| WorkerError::Unavailable)?;
                    if !active.values().any(|worker| worker.task_id == task_id) {
                        return Ok(true);
                    }
                }
                tokio::time::sleep(Duration::from_millis(20)).await;
            }
        };
        match timeout(deadline, wait).await {
            Ok(result) => result,
            Err(_) => Ok(false),
        }
    }

    pub fn active_count(&self) -> Result<usize, WorkerError> {
        self.running
            .active
            .lock()
            .map(|a| a.len())
            .map_err(|_| WorkerError::Unavailable)
    }

    pub fn shutdown(&self) {
        if let Ok(active) = self.running.active.lock() {
            for handle in active.values() {
                handle.abort.abort();
            }
        }
    }
}

impl Drop for CeWorkerSupervisor {
    fn drop(&mut self) {
        self.shutdown();
    }
}

async fn execute(
    mode: Mode,
    workspace: &Path,
    data_root: &Path,
    budget: Duration,
) -> Result<WorkerReport, WorkerError> {
    let exe = std::env::current_exe().map_err(|e| WorkerError::Spawn(e.to_string()))?;
    let args = match &mode {
        Mode::Probe { secret, target } => vec![
            PROBE_FLAG.into(),
            secret.to_string_lossy().into_owned(),
            target.to_string(),
        ],
        Mode::Hold { heartbeat } => {
            vec![HOLD_FLAG.into(), heartbeat.to_string_lossy().into_owned()]
        }
    };
    // The only executable allowed is Lu's own host-selected, already running
    // binary. Never replace this with an archive-supplied path.
    let program = ShellConfig {
        program: exe.clone(),
        args,
        kind: ShellKind::Posix,
    };
    let policy = Policy::new(workspace, false)
        .with_mask_root(data_root)
        .with_read_roots(vec![exe]);
    let wrapped = jail::wrap_ce_worker(&program, &policy).ok_or(WorkerError::NoSandbox)?;
    let mut cmd = Command::new(wrapped.program);
    cmd.args(wrapped.args).env_clear();
    // Windows runtime loader needs its system directory; never copy user keys,
    // arbitrary PATH, AppData, credentials, or plugin-declared env overrides.
    for key in ["SystemRoot", "windir"] {
        if let Some(value) = std::env::var_os(key) {
            cmd.env(key, value);
        }
    }
    #[cfg(windows)]
    {
        // Lowbox CreateProcessW needs the ordinary Windows profile/temp
        // locations to construct the child environment (ERROR_ENVVAR_NOT_FOUND
        // otherwise). Point every user-writable location at the AppContainer-
        // granted PRIVATE task scope, never the real profile or AppData.
        let windows = std::env::var_os("SystemRoot")
            .ok_or_else(|| WorkerError::Spawn("Windows system root unavailable".into()))?;
        let system32 = PathBuf::from(&windows).join("System32");
        cmd.env("PATH", &system32)
            .env("ComSpec", system32.join("cmd.exe"));
        for key in [
            "USERPROFILE",
            "LOCALAPPDATA",
            "APPDATA",
            "TEMP",
            "TMP",
            "TMPDIR",
        ] {
            cmd.env(key, workspace);
        }
        for key in ["SystemDrive", "ProgramData", "ProgramFiles", "PATHEXT"] {
            if let Some(value) = std::env::var_os(key) {
                cmd.env(key, value);
            }
        }
    }
    cmd.current_dir(workspace)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    cmd.process_group(0);
    #[cfg(windows)]
    cmd.creation_flags(0x0000_0200); // CREATE_NEW_PROCESS_GROUP

    let child = cmd.spawn().map_err(|e| WorkerError::Spawn(e.to_string()))?;
    let pid = child.id().ok_or(WorkerError::NoProcessId)?;
    let mut guard = ProcessGuard {
        child,
        pid: Some(pid),
    };
    let stdout = guard.child.stdout.take().ok_or(WorkerError::Unavailable)?;
    let stderr = guard.child.stderr.take().ok_or(WorkerError::Unavailable)?;
    let outcome = timeout(budget, async {
        // Drain both pipes while waiting: a failed Windows sandbox helper
        // reports the exact setup denial on stderr. Never expose this
        // diagnostic to a model or use its text as an authorization decision.
        let read_out = async {
            let mut bytes = Vec::new();
            stdout
                .take(MAX_OUTPUT + 1)
                .read_to_end(&mut bytes)
                .await
                .map_err(|e| WorkerError::Spawn(e.to_string()))?;
            Ok::<_, WorkerError>(bytes)
        };
        let read_err = async {
            let mut bytes = Vec::new();
            stderr
                .take(MAX_OUTPUT + 1)
                .read_to_end(&mut bytes)
                .await
                .map_err(|e| WorkerError::Spawn(e.to_string()))?;
            Ok::<_, WorkerError>(bytes)
        };
        let wait = async {
            guard
                .child
                .wait()
                .await
                .map_err(|e| WorkerError::Spawn(e.to_string()))
        };
        let (output, error, status) = tokio::try_join!(read_out, read_err, wait)?;
        if output.len() as u64 > MAX_OUTPUT || error.len() as u64 > MAX_OUTPUT {
            return Err(WorkerError::OutputTooLarge);
        }
        if !status.success() {
            return Err(WorkerError::WorkerFailed(format!(
                "worker exit: {status}: {}",
                String::from_utf8_lossy(&error)
            )));
        }
        let output =
            String::from_utf8(output).map_err(|e| WorkerError::WorkerFailed(e.to_string()))?;
        if matches!(mode, Mode::Probe { .. }) {
            let reply: ProbeReply = serde_json::from_str(output.trim())
                .map_err(|e| WorkerError::WorkerFailed(e.to_string()))?;
            if !reply.file_denied || !reply.network_denied {
                return Err(WorkerError::IsolationBreach);
            }
        }
        Ok(WorkerReport {
            backend: jail::backend(),
            output,
        })
    })
    .await;
    // The direct child has exited on success, but descendants can survive.
    // Keep the process-group cleanup armed even after the direct child exits.
    match outcome {
        Ok(result) => result,
        Err(_) => Err(WorkerError::Timeout),
    }
}

/// Called at the VERY START of the Lu desktop or headless integration test,
/// after the Windows sandbox helper entrypoint and before any GUI initialization.
/// This does not load packages and does not accept arbitrary executable paths.
pub fn run_ce_worker_if_requested() {
    let mut args = std::env::args_os().skip(1);
    let Some(flag) = args.next() else { return };
    let code = if flag == PROBE_FLAG {
        let secret = args.next();
        let target = args.next();
        if args.next().is_some() {
            Some(64)
        } else {
            match (
                secret,
                target.and_then(|t| t.to_string_lossy().parse::<SocketAddr>().ok()),
            ) {
                (Some(secret), Some(target)) => {
                    let file_denied = std::fs::read(secret).is_err();
                    let network_denied =
                        TcpStream::connect_timeout(&target, Duration::from_millis(350)).is_err();
                    println!(
                        "{}",
                        serde_json::json!({
                            "file_denied": file_denied,
                            "network_denied": network_denied,
                        })
                    );
                    Some(if file_denied && network_denied { 0 } else { 74 })
                }
                _ => Some(64),
            }
        }
    } else if flag == HOLD_FLAG {
        match args.next() {
            Some(path) if args.next().is_none() => {
                match std::process::Command::new(std::env::current_exe().unwrap())
                    .arg(CHILD_FLAG)
                    .arg(path)
                    .spawn()
                {
                    Ok(_child) => loop {
                        std::thread::sleep(Duration::from_secs(1));
                    },
                    Err(_) => Some(71),
                }
            }
            _ => Some(64),
        }
    } else if flag == CHILD_FLAG {
        match args.next() {
            Some(path) if args.next().is_none() => {
                for tick in 0u64.. {
                    if std::fs::write(&path, tick.to_string()).is_err() {
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(40));
                }
                Some(0)
            }
            _ => Some(64),
        }
    } else {
        None
    };
    if let Some(code) = code {
        std::process::exit(code);
    }
}
