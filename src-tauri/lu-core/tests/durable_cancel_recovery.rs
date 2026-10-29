//! Production-style durable native tool dispatch: cooperative cancellation,
//! uncertain effect recovery and no replay. Synthetic tool, no OS worker kill.
use lu_core::{
    contracts::{
        AuthorizationError, ModuleKind, ModuleManifest, NativeTool, ProtoPayload, ToolAuthorizer,
        ToolDescriptor, ToolEffect, ToolFuture, ToolInvocation, ToolOutput, CORE_CONTRACT_VERSION,
    },
    durable::DurableDispatcher,
    inference_host::Cancellation,
    journal::{EffectJournal, EffectState},
    registry::{DispatchError, NativeToolRegistry},
};
use std::{
    fs, future,
    path::PathBuf,
    sync::{
        atomic::{AtomicUsize, Ordering},
        Arc,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tokio::sync::Notify;

const INPUT: &str = "type.googleapis.com/lu.v1.WorkRequest";
const OUTPUT: &str = "type.googleapis.com/lu.v1.WorkReply";

struct Allow;
impl ToolAuthorizer for Allow {
    fn authorize(&self, _: &ToolInvocation, _: &ToolDescriptor) -> Result<(), AuthorizationError> {
        Ok(())
    }
}
struct WaitingTool {
    descriptor: ToolDescriptor,
    starts: Arc<AtomicUsize>,
    entered: Arc<Notify>,
}
impl NativeTool for WaitingTool {
    fn descriptor(&self) -> &ToolDescriptor {
        &self.descriptor
    }
    fn invoke(&self, _: ToolInvocation) -> ToolFuture<'_> {
        Box::pin(async move {
            self.starts.fetch_add(1, Ordering::SeqCst);
            self.entered.notify_one();
            // A real cooperative worker would await its request and terminate
            // on cancellation. Future dropping does not kill detached work.
            future::pending::<()>().await;
            Ok(ToolOutput {
                payload: ProtoPayload {
                    type_url: OUTPUT.into(),
                    bytes: vec![1],
                },
            })
        })
    }
}
fn call() -> ToolInvocation {
    ToolInvocation {
        call_id: "call-lifecycle".into(),
        tool_id: "lu.worker.wait".into(),
        workspace_id: Some("workspace-test".into()),
        input: ProtoPayload {
            type_url: INPUT.into(),
            bytes: vec![1, 2],
        },
    }
}
fn fresh_db() -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!(
        "lu-native-cancel-recovery-{}-{nonce}.sqlite",
        std::process::id()
    ))
}
fn registry(entered: Arc<Notify>, starts: Arc<AtomicUsize>) -> NativeToolRegistry {
    let registry = NativeToolRegistry::new();
    let descriptor = ToolDescriptor {
        id: "lu.worker.wait".into(),
        display_name: "Awaiting worker".into(),
        effect: ToolEffect::WriteWorkspace,
        input_type_url: INPUT.into(),
        output_type_url: OUTPUT.into(),
    };
    registry
        .register(
            ModuleManifest {
                id: "lu.worker".into(),
                display_name: "Worker".into(),
                contract_version: CORE_CONTRACT_VERSION,
                kind: ModuleKind::Core,
                tools: vec![descriptor.clone()],
                panels: vec![],
                workflows: vec![],
            },
            vec![Arc::new(WaitingTool {
                descriptor,
                starts,
                entered,
            })],
        )
        .unwrap();
    registry
}

#[tokio::test]
async fn cancel_inflight_native_future_leaves_uncertain_receipt_and_refuses_replay() {
    let path = fresh_db();
    let entered = Arc::new(Notify::new());
    let starts = Arc::new(AtomicUsize::new(0));
    let registry = registry(Arc::clone(&entered), Arc::clone(&starts));
    let cancellation = Cancellation::default();
    let worker_registry = registry.clone();
    let signal = cancellation.clone();
    let worker_db = path.clone();
    let task = tokio::spawn(async move {
        let journal = EffectJournal::open(&worker_db).unwrap();
        let runner = DurableDispatcher {
            registry: &worker_registry,
            journal: &journal,
        };
        runner.dispatch_cancellable(call(), &Allow, &signal).await
    });
    entered.notified().await;
    cancellation.cancel();
    let result = task.await.unwrap();
    assert!(matches!(result, Err(DispatchError::Execution(error))
        if error.code == "EFFECT_REPLAY_BLOCKED" && error.message.contains("uncertain")));
    let journal = EffectJournal::open(&path).unwrap();
    assert_eq!(
        journal.get("call-lifecycle").unwrap().unwrap().state,
        EffectState::Uncertain
    );
    assert_eq!(journal.reconcile_interrupted().unwrap(), 0);
    let runner = DurableDispatcher {
        registry: &registry,
        journal: &journal,
    };
    assert!(
        matches!(runner.dispatch_cancellable(call(), &Allow, &Cancellation::default()).await,
        Err(DispatchError::Execution(error)) if error.code == "EFFECT_REPLAY_BLOCKED")
    );
    assert_eq!(starts.load(Ordering::SeqCst), 1);
    drop(journal);
    let _ = fs::remove_file(path);
}

#[tokio::test]
async fn already_cancelled_turn_never_enters_native_effect() {
    let path = fresh_db();
    let starts = Arc::new(AtomicUsize::new(0));
    let registry = registry(Arc::new(Notify::new()), Arc::clone(&starts));
    let journal = EffectJournal::open(&path).unwrap();
    let cancel = Cancellation::default();
    cancel.cancel();
    let runner = DurableDispatcher {
        registry: &registry,
        journal: &journal,
    };
    assert!(
        matches!(runner.dispatch_cancellable(call(), &Allow, &cancel).await,
        Err(DispatchError::Execution(error)) if error.code == "EFFECT_REPLAY_BLOCKED")
    );
    assert_eq!(starts.load(Ordering::SeqCst), 0);
    assert_eq!(
        journal.get("call-lifecycle").unwrap().unwrap().state,
        EffectState::Prepared
    );
    drop(journal);
    let _ = fs::remove_file(path);
}

#[tokio::test]
async fn future_abort_does_not_authorize_retry_even_without_cooperative_signal() {
    let path = fresh_db();
    let entered = Arc::new(Notify::new());
    let starts = Arc::new(AtomicUsize::new(0));
    let registry = registry(Arc::clone(&entered), Arc::clone(&starts));
    let worker_registry = registry.clone();
    let worker_db = path.clone();
    let task = tokio::spawn(async move {
        let journal = EffectJournal::open(&worker_db).unwrap();
        DurableDispatcher {
            registry: &worker_registry,
            journal: &journal,
        }
        .dispatch_cancellable(call(), &Allow, &Cancellation::default())
        .await
    });
    entered.notified().await;
    task.abort();
    let _ = task.await;
    let journal = EffectJournal::open(&path).unwrap();
    assert_eq!(
        journal.get("call-lifecycle").unwrap().unwrap().state,
        EffectState::Uncertain
    );
    assert_eq!(starts.load(Ordering::SeqCst), 1);
    drop(journal);
    let _ = fs::remove_file(path);
}
