//! Experimental host-only signed Core Extension runtime (Linux).
//!
//! Only a host-verified, content-addressed native ELF can be executed.
//! Bubblewrap creates a private PID/user/network namespace and an empty root;
//! the worker cannot mount or read Lu's host workspace. File operations use
//! framed stdin/stdout messages and are reauthorized by CeResourceBroker.
//! Windows/macOS explicitly fail closed until equally strong launchers pass
//! hostile-worker tests. No Tauri/model IPC installs or launches CEs.

use std::{
    collections::BTreeMap,
    path::Path,
    process::Stdio,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use base64::{engine::general_purpose::STANDARD, Engine as _};
use lu_core::{
    BoundCallOrigin, CeResourceBroker, ProtoPayload, StagedCeExecutable, ToolDescriptor,
    ToolEffect, ToolInvocation,
};
use serde_json::{json, Value};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    process::{Child, Command},
    sync::oneshot,
    task::AbortHandle,
    time::timeout,
};

use super::{
    jail,
    proc::{self, ShellConfig, ShellKind},
};

const MAX_FRAME: usize = 128 * 1024;
const MAX_PAYLOAD: usize = 64 * 1024;
const MAX_FRAMES: usize = 64;
const MAX_RUNTIME: Duration = Duration::from_secs(15);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SignedRuntimeError {
    NoSandbox,
    InvalidPackage,
    PermissionDenied,
    InvalidProtocol,
    OutputTooLarge,
    Spawn(String),
    Timeout,
    WorkerFailed(String),
    Cancelled,
    Unavailable,
}

struct Active {
    abort: AbortHandle,
    task_id: String,
    tool_id: String,
}
struct Running {
    active: Mutex<BTreeMap<u64, Active>>,
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

struct Guard {
    child: Child,
    pid: u32,
}
impl Drop for Guard {
    fn drop(&mut self) {
        #[cfg(unix)]
        proc::kill_tree(self.pid);
        #[cfg(windows)]
        let _ = self.child.start_kill();
    }
}

pub struct SignedWorkerTicket {
    pub id: u64,
    response: oneshot::Receiver<Result<Vec<u8>, SignedRuntimeError>>,
}
impl SignedWorkerTicket {
    /// Returned bytes remain UNTRUSTED until the host decodes and validates
    /// the generated Protobuf type, semantics, and output size.
    pub async fn result(self) -> Result<Vec<u8>, SignedRuntimeError> {
        self.response
            .await
            .map_err(|_| SignedRuntimeError::Cancelled)?
    }
}

/// Constructed only by the trusted Rust host after signature verification,
/// explicit persisted user approval, and task/user-turn authentication.
/// No method here is exposed as a Tauri command or model tool.
pub struct SignedCeRuntime {
    staged: StagedCeExecutable,
    broker: Arc<CeResourceBroker>,
    descriptors: BTreeMap<String, ToolDescriptor>,
    running: Arc<Running>,
    next_id: AtomicU64,
}

impl SignedCeRuntime {
    pub fn new(
        staged: StagedCeExecutable,
        broker: Arc<CeResourceBroker>,
        descriptors: Vec<ToolDescriptor>,
    ) -> Result<Self, SignedRuntimeError> {
        staged
            .verify_on_disk()
            .map_err(|_| SignedRuntimeError::InvalidPackage)?;
        if staged.package().manifest().id != broker.package_id()
            || staged.package().artifact_sha256() != broker.artifact_sha256()
            || descriptors.is_empty()
            || descriptors.len() > 16
        {
            return Err(SignedRuntimeError::InvalidPackage);
        }
        let mut catalog = BTreeMap::new();
        for descriptor in descriptors {
            if !staged.package().manifest().tools.contains(&descriptor.id)
                || descriptor.input_type_url.is_empty()
                || descriptor.output_type_url.is_empty()
                || catalog.insert(descriptor.id.clone(), descriptor).is_some()
            {
                return Err(SignedRuntimeError::InvalidPackage);
            }
        }
        let running = Arc::new(Running {
            active: Mutex::new(BTreeMap::new()),
        });
        let weak = Arc::downgrade(&running);
        broker
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
            .map_err(|_| SignedRuntimeError::Unavailable)?;
        let weak = Arc::downgrade(&running);
        let profile = broker.profile_id().to_owned();
        let package = broker.package_id().to_owned();
        let scope = broker.scope_id().to_owned();
        broker
            .on_permission_revoked(Arc::new(move |event| {
                if event.profile_id != profile
                    || event.package_id != package
                    || event.scope_id != scope
                {
                    return;
                }
                if let Some(running) = weak.upgrade() {
                    if let Ok(active) = running.active.lock() {
                        for worker in active.values() {
                            // A worker may be using another tool's broker grant.
                            // Any revocation in its package/scope cancels the whole
                            // process, not merely calls to the revoked tool.
                            worker.abort.abort();
                        }
                    }
                }
            }))
            .map_err(|_| SignedRuntimeError::Unavailable)?;
        Ok(Self {
            staged,
            broker,
            descriptors: catalog,
            running,
            next_id: AtomicU64::new(1),
        })
    }

    pub fn start(
        &self,
        origin: &BoundCallOrigin,
        invocation: &ToolInvocation,
    ) -> Result<SignedWorkerTicket, SignedRuntimeError> {
        // No unsigned or unsupported-platform fallback.
        #[cfg(not(target_os = "linux"))]
        return Err(SignedRuntimeError::NoSandbox);
        #[cfg(target_os = "linux")]
        if !jail::backend().enforces() || jail::backend() != jail::Backend::Bubblewrap {
            return Err(SignedRuntimeError::NoSandbox);
        }
        #[cfg(unix)]
        if unsafe { nix::libc::geteuid() } == 0 {
            return Err(SignedRuntimeError::NoSandbox);
        }
        if invocation.input.bytes.len() > MAX_PAYLOAD || invocation.call_id.is_empty() {
            return Err(SignedRuntimeError::InvalidProtocol);
        }
        let descriptor = self
            .descriptors
            .get(&invocation.tool_id)
            .ok_or(SignedRuntimeError::PermissionDenied)?;
        self.broker
            .authorize_call(origin, invocation, descriptor)
            .map_err(|_| SignedRuntimeError::PermissionDenied)?;
        self.staged
            .verify_on_disk()
            .map_err(|_| SignedRuntimeError::InvalidPackage)?;
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        let (start_tx, start_rx) = oneshot::channel();
        let broker = Arc::clone(&self.broker);
        let descriptors = self.descriptors.clone();
        let staged = self.staged.clone();
        let origin = origin.clone();
        let invocation = invocation.clone();
        let task_id = origin.task_id.clone();
        let tool_id = invocation.tool_id.clone();
        let running = Arc::clone(&self.running);
        let task = tokio::spawn(async move {
            let _registration = Registration { id, running };
            if start_rx.await.is_err() {
                return;
            }
            let result = match descriptors.get(&invocation.tool_id) {
                Some(descriptor)
                    if broker
                        .authorize_call(&origin, &invocation, descriptor)
                        .is_ok() =>
                {
                    execute(staged, broker, descriptors, origin, invocation).await
                }
                _ => Err(SignedRuntimeError::PermissionDenied),
            };
            let _ = tx.send(result);
        });
        let abort = task.abort_handle();
        drop(task);
        let mut active = self
            .running
            .active
            .lock()
            .map_err(|_| SignedRuntimeError::Unavailable)?;
        active.insert(
            id,
            Active {
                abort,
                task_id,
                tool_id,
            },
        );
        drop(active);
        let _ = start_tx.send(());
        Ok(SignedWorkerTicket { id, response: rx })
    }

    pub fn cancel(&self, id: u64) -> bool {
        if let Ok(active) = self.running.active.lock() {
            if let Some(worker) = active.get(&id) {
                worker.abort.abort();
                return true;
            }
        }
        false
    }

    pub fn shutdown(&self) {
        if let Ok(active) = self.running.active.lock() {
            for worker in active.values() {
                worker.abort.abort();
            }
        }
    }
}
impl Drop for SignedCeRuntime {
    fn drop(&mut self) {
        self.shutdown();
    }
}

async fn write_frame<W: AsyncWrite + Unpin>(
    out: &mut W,
    value: &Value,
) -> Result<(), SignedRuntimeError> {
    let data = serde_json::to_vec(value).map_err(|_| SignedRuntimeError::InvalidProtocol)?;
    if data.len() > MAX_FRAME {
        return Err(SignedRuntimeError::OutputTooLarge);
    }
    out.write_all(&(data.len() as u32).to_be_bytes())
        .await
        .map_err(|e| SignedRuntimeError::Spawn(e.to_string()))?;
    out.write_all(&data)
        .await
        .map_err(|e| SignedRuntimeError::Spawn(e.to_string()))?;
    out.flush()
        .await
        .map_err(|e| SignedRuntimeError::Spawn(e.to_string()))
}

async fn read_frame<R: AsyncRead + Unpin>(input: &mut R) -> Result<Value, SignedRuntimeError> {
    let mut header = [0u8; 4];
    input
        .read_exact(&mut header)
        .await
        .map_err(|_| SignedRuntimeError::InvalidProtocol)?;
    let len = u32::from_be_bytes(header) as usize;
    if len == 0 || len > MAX_FRAME {
        return Err(SignedRuntimeError::OutputTooLarge);
    }
    let mut data = vec![0u8; len];
    input
        .read_exact(&mut data)
        .await
        .map_err(|_| SignedRuntimeError::InvalidProtocol)?;
    serde_json::from_slice(&data).map_err(|_| SignedRuntimeError::InvalidProtocol)
}

fn field<'a>(
    obj: &'a serde_json::Map<String, Value>,
    key: &str,
) -> Result<&'a str, SignedRuntimeError> {
    obj.get(key)
        .and_then(Value::as_str)
        .ok_or(SignedRuntimeError::InvalidProtocol)
}

async fn execute(
    staged: StagedCeExecutable,
    broker: Arc<CeResourceBroker>,
    descriptors: BTreeMap<String, ToolDescriptor>,
    origin: BoundCallOrigin,
    invocation: ToolInvocation,
) -> Result<Vec<u8>, SignedRuntimeError> {
    staged
        .verify_on_disk()
        .map_err(|_| SignedRuntimeError::InvalidPackage)?;
    let config = ShellConfig {
        program: staged.host_path().to_path_buf(),
        args: vec![],
        kind: ShellKind::Posix,
    };
    let wrapped = jail::wrap_signed_ce_worker(&config).ok_or(SignedRuntimeError::NoSandbox)?;
    let mut command = Command::new(wrapped.program);
    command
        .args(wrapped.args)
        .env_clear()
        .current_dir(staged.host_path().parent().unwrap_or(Path::new("/")))
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(unix)]
    command.process_group(0);
    let child = command
        .spawn()
        .map_err(|e| SignedRuntimeError::Spawn(e.to_string()))?;
    let pid = child.id().ok_or(SignedRuntimeError::Unavailable)?;
    let mut guard = Guard { child, pid };
    let mut stdin = guard
        .child
        .stdin
        .take()
        .ok_or(SignedRuntimeError::Unavailable)?;
    let mut stdout = guard
        .child
        .stdout
        .take()
        .ok_or(SignedRuntimeError::Unavailable)?;
    let mut stderr = guard
        .child
        .stderr
        .take()
        .ok_or(SignedRuntimeError::Unavailable)?;
    let stderr_task = tokio::spawn(async move {
        let mut bytes = Vec::new();
        let _ = (&mut stderr)
            .take((MAX_FRAME + 1) as u64)
            .read_to_end(&mut bytes)
            .await;
    });

    let result = timeout(MAX_RUNTIME, async {
        write_frame(
            &mut stdin,
            &json!({
                "kind":"invoke",
                "call_id":invocation.call_id,
                "tool_id":invocation.tool_id,
                "type_url":invocation.input.type_url,
                "bytes_b64":STANDARD.encode(&invocation.input.bytes),
            }),
        )
        .await?;
        for _ in 0..MAX_FRAMES {
            let frame = read_frame(&mut stdout).await?;
            let obj = frame
                .as_object()
                .ok_or(SignedRuntimeError::InvalidProtocol)?;
            match field(obj, "kind")? {
                "result" if obj.len() == 3 => {
                    let expected = descriptors
                        .get(&invocation.tool_id)
                        .ok_or(SignedRuntimeError::InvalidProtocol)?;
                    if field(obj, "type_url")? != expected.output_type_url {
                        return Err(SignedRuntimeError::InvalidProtocol);
                    }
                    let data = STANDARD
                        .decode(field(obj, "bytes_b64")?)
                        .map_err(|_| SignedRuntimeError::InvalidProtocol)?;
                    if data.len() > MAX_PAYLOAD {
                        return Err(SignedRuntimeError::OutputTooLarge);
                    }
                    drop(stdin);
                    let status = guard
                        .child
                        .wait()
                        .await
                        .map_err(|e| SignedRuntimeError::Spawn(e.to_string()))?;
                    if !status.success() {
                        return Err(SignedRuntimeError::WorkerFailed(format!("{status}")));
                    }
                    return Ok(data);
                }
                "read" if obj.len() == 4 => {
                    let request_id = obj
                        .get("request_id")
                        .and_then(Value::as_u64)
                        .ok_or(SignedRuntimeError::InvalidProtocol)?;
                    let tool_id = field(obj, "tool_id")?;
                    let path = field(obj, "path")?;
                    let descriptor = descriptors
                        .get(tool_id)
                        .filter(|d| d.effect == ToolEffect::ReadWorkspace);
                    let response = descriptor.and_then(|d| {
                        let call = ToolInvocation {
                            call_id: invocation.call_id.clone(),
                            tool_id: tool_id.into(),
                            workspace_id: invocation.workspace_id.clone(),
                            input: ProtoPayload {
                                type_url: d.input_type_url.clone(),
                                bytes: vec![],
                            },
                        };
                        broker.read_file(&origin, &call, d, request_id, path).ok()
                    });
                    let reply = match response {
                        Some(bytes) => json!({"kind":"broker_result","request_id":request_id,
                            "ok":true,"bytes_b64":STANDARD.encode(bytes)}),
                        None => json!({"kind":"broker_result","request_id":request_id,
                            "ok":false,"bytes_b64":""}),
                    };
                    write_frame(&mut stdin, &reply).await?;
                }
                "write" if obj.len() == 5 => {
                    let request_id = obj
                        .get("request_id")
                        .and_then(Value::as_u64)
                        .ok_or(SignedRuntimeError::InvalidProtocol)?;
                    let tool_id = field(obj, "tool_id")?;
                    let path = field(obj, "path")?;
                    let bytes = STANDARD
                        .decode(field(obj, "bytes_b64")?)
                        .map_err(|_| SignedRuntimeError::InvalidProtocol)?;
                    if bytes.len() > MAX_PAYLOAD {
                        return Err(SignedRuntimeError::OutputTooLarge);
                    }
                    let descriptor = descriptors
                        .get(tool_id)
                        .filter(|d| d.effect == ToolEffect::WriteWorkspace);
                    let ok = descriptor.is_some_and(|d| {
                        let call = ToolInvocation {
                            call_id: invocation.call_id.clone(),
                            tool_id: tool_id.into(),
                            workspace_id: invocation.workspace_id.clone(),
                            input: ProtoPayload {
                                type_url: d.input_type_url.clone(),
                                bytes: vec![],
                            },
                        };
                        broker
                            .write_file(&origin, &call, d, request_id, path, &bytes)
                            .is_ok()
                    });
                    write_frame(
                        &mut stdin,
                        &json!({"kind":"broker_result","request_id":request_id,
                        "ok":ok,"bytes_b64":""}),
                    )
                    .await?;
                }
                _ => return Err(SignedRuntimeError::InvalidProtocol),
            }
        }
        Err(SignedRuntimeError::OutputTooLarge)
    })
    .await;
    stderr_task.abort();
    match result {
        Ok(result) => result,
        Err(_) => Err(SignedRuntimeError::Timeout),
    }
}
