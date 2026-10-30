//! Real-process negative tests for Lu's *bundled diagnostic* CE worker.
//! harness=false: the test binary is re-executed as the AppContainer helper
//! and as the restricted worker. Never run a test harness inside the helper.

fn main() {
    tauri_plugin_agent_tools::run_sandbox_helper_if_requested();
    tauri_plugin_agent_tools::run_ce_worker_if_requested();
    run();
}

fn run() {
    use lu_core::{
        AuthorizationError, AuthorizedCapability, BoundCallOrigin, ConversationAuthority,
        ProtoPayload, TaskAuthority, ToolAuthorizer, ToolDescriptor, ToolEffect, ToolInvocation,
        TrustedUserTurnVerifier,
    };
    use std::{net::TcpListener, path::Path, sync::Arc, time::Duration};
    use tauri_plugin_agent_tools::tools::{
        ce_worker::{CeWorkerSupervisor, WorkerError, HOLD_TOOL, INPUT_TYPE, PROBE_TOOL},
        jail::{self, Backend},
    };

    struct Verified;
    impl TrustedUserTurnVerifier for Verified {
        fn verify_user_turn(&self, conversation: &str, turn: &str) -> bool {
            conversation == "real-conversation" && turn == "real-human-turn"
        }
    }
    struct Allow;
    impl ToolAuthorizer for Allow {
        fn authorize(
            &self,
            _: &ToolInvocation,
            _: &ToolDescriptor,
        ) -> Result<(), AuthorizationError> {
            Ok(())
        }
    }
    fn call(tool: &str) -> ToolInvocation {
        ToolInvocation {
            call_id: "call-1".into(),
            tool_id: tool.into(),
            workspace_id: Some("scope-1".into()),
            input: ProtoPayload {
                type_url: INPUT_TYPE.into(),
                bytes: vec![],
            },
        }
    }
    fn origin() -> BoundCallOrigin {
        BoundCallOrigin {
            conversation_id: "real-conversation".into(),
            user_turn_id: "real-human-turn".into(),
            task_id: "task-1".into(),
        }
    }
    fn setup(root: &Path, workspace: &Path) -> CeWorkerSupervisor {
        let authority = ConversationAuthority::new();
        authority
            .open_user_task(
                TaskAuthority {
                    conversation_id: "real-conversation".into(),
                    user_turn_id: "real-human-turn".into(),
                    task_id: "task-1".into(),
                    execution_scope_id: "scope-1".into(),
                    capabilities: [PROBE_TOOL, HOLD_TOOL]
                        .iter()
                        .map(|id| AuthorizedCapability {
                            tool_id: (*id).into(),
                            effect: if *id == HOLD_TOOL {
                                ToolEffect::WriteWorkspace
                            } else {
                                ToolEffect::ReadWorkspace
                            },
                        })
                        .collect(),
                    expires_at: None,
                },
                &Verified,
            )
            .unwrap();
        CeWorkerSupervisor::new(
            authority,
            Arc::new(Allow),
            "scope-1".into(),
            workspace,
            root,
        )
        .unwrap()
    }

    let root = std::env::temp_dir().join(format!("lu_ce_worker_{}", std::process::id()));
    let workspace = root.join("scope");
    std::fs::create_dir_all(&workspace).expect("private scope");
    let secret = root.join("host-secret.txt");
    std::fs::write(&secret, b"the worker must never read this").unwrap();
    let listener = TcpListener::bind("127.0.0.1:0").expect("test listener");
    let address = listener.local_addr().unwrap();
    let supervisor = setup(&root, &workspace);

    // The model cannot forge a different user turn, workspace or tool ID.
    let mut forged = origin();
    forged.user_turn_id = "model-claimed-user".into();
    assert!(matches!(
        supervisor.start_probe(&forged, &call(PROBE_TOOL), &secret, address),
        Err(WorkerError::PermissionDenied(_))
    ));
    let mut other_scope = call(PROBE_TOOL);
    other_scope.workspace_id = Some("other".into());
    assert!(matches!(
        supervisor.start_probe(&origin(), &other_scope, &secret, address),
        Err(WorkerError::PermissionDenied(_))
    ));

    if jail::backend() == Backend::None {
        #[cfg(windows)]
        panic!("Windows runner must provide an AppContainer backend");
        #[cfg(not(windows))]
        {
            assert!(matches!(
                supervisor.start_probe(&origin(), &call(PROBE_TOOL), &secret, address),
                Err(WorkerError::NoSandbox)
            ));
            eprintln!("ce_worker_spawn: no OS sandbox, worker refused (fail closed)");
            std::fs::remove_dir_all(root).unwrap();
            return;
        }
    }

    let rt = tokio::runtime::Runtime::new().unwrap();
    rt.block_on(async {
        let ticket = supervisor
            .start_probe(&origin(), &call(PROBE_TOOL), &secret, address)
            .expect("admitted diagnostic worker");
        let report = ticket
            .result()
            .await
            .expect("OS-denied read and network probe");
        assert!(
            report.output.contains(r#""file_denied":true"#),
            "{report:?}"
        );
        assert!(
            report.output.contains(r#""network_denied":true"#),
            "{report:?}"
        );
        eprintln!(
            "ce_worker_spawn: verified file/network denial under {:?}",
            report.backend
        );

        let heartbeat = workspace.join("descendant-heartbeat.txt");
        let ticket = supervisor
            .start_hold(&origin(), &call(HOLD_TOOL), &heartbeat)
            .expect("admitted hold worker");
        let id = ticket.id;
        for _ in 0..80 {
            if heartbeat.exists() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(heartbeat.exists(), "sandboxed descendant never started");
        assert_eq!(
            supervisor.cancel_task("task-1").unwrap(),
            1,
            "host task cancellation must reach its worker"
        );
        assert!(
            supervisor
                .wait_task_drained("task-1", Duration::from_secs(5))
                .await
                .unwrap(),
            "host worker registration did not drain"
        );
        assert_eq!(supervisor.cancel_task("task-1").unwrap(), 0);
        assert!(
            !supervisor.cancel(id),
            "already drained worker must not remain cancellable"
        );
        assert!(matches!(ticket.result().await, Err(WorkerError::Cancelled)));
        // The helper's Job Object (Windows) or isolated process group (Unix)
        // must stop the descendant, not just the immediate worker process.
        tokio::time::sleep(Duration::from_millis(500)).await;
        let stopped_at = std::fs::read_to_string(&heartbeat).unwrap();
        tokio::time::sleep(Duration::from_millis(400)).await;
        assert_eq!(
            std::fs::read_to_string(&heartbeat).unwrap(),
            stopped_at,
            "descendant survived cancellation and kept writing"
        );
        // A cancelled task must not poison supervisor reuse. Relaunch the
        // diagnostic worker under the same authenticated host task and check
        // its second cancellation drains all registrations as well.
        let heartbeat_again = workspace.join("descendant-relaunch.txt");
        let second = supervisor
            .start_hold(&origin(), &call(HOLD_TOOL), &heartbeat_again)
            .expect("relaunch after cancellation");
        for _ in 0..80 {
            if heartbeat_again.exists() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert!(
            heartbeat_again.exists(),
            "relaunched descendant never started"
        );
        assert_eq!(supervisor.cancel_task("task-1").unwrap(), 1);
        assert!(supervisor
            .wait_task_drained("task-1", Duration::from_secs(5))
            .await
            .unwrap());
        assert!(matches!(second.result().await, Err(WorkerError::Cancelled)));
        tokio::time::sleep(Duration::from_millis(500)).await;
        let second_stopped = std::fs::read_to_string(&heartbeat_again).unwrap();
        tokio::time::sleep(Duration::from_millis(400)).await;
        assert_eq!(
            std::fs::read_to_string(&heartbeat_again).unwrap(),
            second_stopped,
            "relaunched descendant survived second cancellation"
        );
    });
    drop(supervisor);
    drop(listener);
    std::fs::remove_dir_all(root).expect("remove test-only sandbox");
    eprintln!("ce_worker_spawn: confined diagnostic and process-tree cancellation passed");
}
