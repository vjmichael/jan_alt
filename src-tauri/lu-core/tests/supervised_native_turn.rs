//! The next integration gate: *supervisor-generated* model text, Protobuf
//! native dispatch and a second supervisor generation using the tool result.
//! Backend is deterministic for CI. This does not certify a real GGUF model.

use lu_core::{
    agent_tool_loop::NativeToolTurn,
    contracts::{AuthorizationError, ToolAuthorizer, ToolDescriptor, ToolEffect, ToolInvocation},
    conversation_authority::{
        AuthorizedCapability, BoundCallOrigin, ConversationAuthority, TaskAuthority,
        TrustedUserTurnVerifier,
    },
    inference_host::{Cancellation, EngineError, GenerationRequest, InferenceBackend, TokenChunk},
    inference_supervisor::TrustedInferenceSupervisor,
    model_admission::{AdmittedModel, ModelAdmissionManager},
    native_file_extra::register_inspection_tools,
    native_files::register_bundled_file_tools,
    registry::NativeToolRegistry,
    supervised_tool_generation::{
        run_supervised_native_turn, ModelStepGenerator, NativeGenerationError, NativeTurnRecord,
        NativeTurnServices, SupervisorModelStep,
    },
};
use std::{
    collections::BTreeSet,
    fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

struct Verified;
impl TrustedUserTurnVerifier for Verified {
    fn verify_user_turn(&self, conversation_id: &str, turn_id: &str) -> bool {
        conversation_id == "conversation-test" && turn_id == "user-test"
    }
}
struct Permitted;
impl ToolAuthorizer for Permitted {
    fn authorize(&self, _: &ToolInvocation, _: &ToolDescriptor) -> Result<(), AuthorizationError> {
        Ok(())
    }
}

/// A deterministic stand-in used ONLY to prove that the production inference
/// supervisor, wire decoding, real native registry and model continuation
/// execute in correct order. It is NOT a downloaded GGUF.
struct StreamFixture {
    prompts: Arc<Mutex<Vec<String>>>,
}
impl InferenceBackend for StreamFixture {
    fn load(&mut self, _: &AdmittedModel) -> Result<(), String> {
        Ok(())
    }
    fn unload(&mut self) {}
    fn generate(
        &mut self,
        request: &GenerationRequest,
        cancel: &Cancellation,
        emit: &mut dyn FnMut(TokenChunk) -> Result<(), EngineError>,
    ) -> Result<(), String> {
        if cancel.is_cancelled() {
            return Err("cancelled".into());
        }
        self.prompts.lock().unwrap().push(request.prompt.clone());
        let response = if request.prompt.contains("\"kind\":\"tool_result\"")
            && request.prompt.contains("Lu evidence marker")
        {
            r#"{"kind":"final","text":"I found Lu evidence marker in notes.txt."}"#
        } else {
            r#"{"kind":"tool","name":"lu_files_read_text","arguments":{"path":"notes.txt"}}"#
        };
        // Exercise split token/event boundaries, not an already assembled call.
        let split = response.len() / 2;
        for (index, part) in [&response[..split], &response[split..]]
            .into_iter()
            .enumerate()
        {
            emit(TokenChunk {
                text: part.into(),
                index: index as u32,
            })
            .map_err(|e| format!("{e:?}"))?;
        }
        Ok(())
    }
}

fn sandbox() -> PathBuf {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("lu-supervised-turn-{}-{now}", std::process::id()));
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join("notes.txt"), "Lu evidence marker\n").unwrap();
    let mut gguf = Vec::new();
    gguf.extend_from_slice(b"GGUF");
    gguf.extend_from_slice(&3_u32.to_le_bytes());
    gguf.extend_from_slice(&1_u64.to_le_bytes());
    gguf.extend_from_slice(&1_u64.to_le_bytes());
    fs::write(dir.join("test.gguf"), gguf).unwrap();
    dir
}

fn tools_and_authority(
    root: &PathBuf,
) -> (
    NativeToolRegistry,
    lu_core::model::ModelToolCatalog,
    ConversationAuthority,
    BoundCallOrigin,
) {
    let registry = NativeToolRegistry::new();
    let mut catalog = register_bundled_file_tools(&registry, root).unwrap();
    register_inspection_tools(&registry, &mut catalog, root).unwrap();
    let authority = ConversationAuthority::new();
    let origin = BoundCallOrigin {
        conversation_id: "conversation-test".into(),
        user_turn_id: "user-test".into(),
        task_id: "task-test".into(),
    };
    authority
        .open_user_task(
            TaskAuthority {
                conversation_id: origin.conversation_id.clone(),
                user_turn_id: origin.user_turn_id.clone(),
                task_id: origin.task_id.clone(),
                execution_scope_id: "thread:conversation-test".into(),
                capabilities: [
                    "lu.files.read_text",
                    "lu.files.list_directory",
                    "lu.inspect.stat",
                    "lu.inspect.search_text",
                ]
                .into_iter()
                .map(|name| AuthorizedCapability {
                    tool_id: name.into(),
                    effect: ToolEffect::ReadWorkspace,
                })
                .collect(),
                expires_at: None,
            },
            &Verified,
        )
        .unwrap();
    (registry, catalog, authority, origin)
}

#[tokio::test]
async fn model_output_from_supervisor_dispatches_real_protobuf_tool_and_continues() {
    let root = sandbox();
    let (registry, catalog, authority, origin) = tools_and_authority(&root);
    let allowed: BTreeSet<String> = [
        "lu_files_read_text",
        "lu_files_list_directory",
        "lu_files_stat",
        "lu_files_search_text",
    ]
    .into_iter()
    .map(String::from)
    .collect();
    let mut turn = NativeToolTurn::new(
        &catalog,
        &authority,
        origin,
        "thread:conversation-test".into(),
        &allowed,
    )
    .unwrap();
    let model = ModelAdmissionManager::new();
    let mut model = model;
    let admitted = model.admit(&root, "test.gguf").unwrap().clone();
    let prompts = Arc::new(Mutex::new(Vec::<String>::new()));
    let observed = Arc::clone(&prompts);
    let supervisor = TrustedInferenceSupervisor::new(
        "test-backend".into(),
        512,
        vec![("model-test".into(), admitted)],
        move || {
            Ok(StreamFixture {
                prompts: Arc::clone(&observed),
            })
        },
    )
    .unwrap();
    supervisor
        .load("model-test", "s-test".into(), "load-test")
        .unwrap();
    let mut inference =
        SupervisorModelStep::new(&supervisor, "s-test".into(), "turn-test".into()).unwrap();
    let result = run_supervised_native_turn(
        "Read notes.txt and report the marker.",
        &mut turn,
        &mut inference,
        &NativeTurnServices {
            catalog: &catalog,
            registry: &registry,
            authority: &authority,
            host_policy: &Permitted,
        },
        &Cancellation::default(),
    )
    .await
    .unwrap();
    assert_eq!(result.tool_calls, 1);
    assert_eq!(result.model_generations, 2);
    assert!(result.answer.contains("Lu evidence marker"));
    assert!(matches!(
        &result.records[0],
        NativeTurnRecord::ModelOutput(_)
    ));
    assert!(matches!(
        &result.records[1],
        NativeTurnRecord::ToolFeedback(_)
    ));
    assert!(matches!(
        &result.records[3],
        NativeTurnRecord::FinalAnswer(_)
    ));
    let observed = prompts.lock().unwrap();
    assert_eq!(observed.len(), 2);
    assert!(!observed[0].contains("\"kind\":\"tool_result\""));
    assert!(observed[1].contains("\"kind\":\"tool_result\""));
    assert!(observed[1].contains("Lu evidence marker"));
    drop(observed);
    assert!(supervisor.status().unwrap().generation_id.is_none());
    supervisor.unload("s-test", "unload-test").unwrap();
    drop(inference);
    drop(turn);
    drop(registry);
    fs::remove_dir_all(root).unwrap();
}

#[tokio::test]
async fn cancellation_before_generation_prevents_tool_execution() {
    let root = sandbox();
    let (registry, catalog, authority, origin) = tools_and_authority(&root);
    let allowed = BTreeSet::from(["lu_files_read_text".into()]);
    let mut turn = NativeToolTurn::new(
        &catalog,
        &authority,
        origin,
        "thread:conversation-test".into(),
        &allowed,
    )
    .unwrap();
    struct MustNotRun;
    impl ModelStepGenerator for MustNotRun {
        fn generate_step(
            &mut self,
            _: &str,
            _: u32,
            _: &Cancellation,
        ) -> Result<String, NativeGenerationError> {
            panic!("generation must be cancelled before model call")
        }
    }
    let cancelled = Cancellation::default();
    cancelled.cancel();
    assert_eq!(
        run_supervised_native_turn(
            "Read notes.txt",
            &mut turn,
            &mut MustNotRun,
            &NativeTurnServices {
                catalog: &catalog,
                registry: &registry,
                authority: &authority,
                host_policy: &Permitted
            },
            &cancelled
        )
        .await,
        Err(NativeGenerationError::Cancelled),
    );
    assert_eq!(turn.step_count(), 0);
    drop(turn);
    drop(registry);
    fs::remove_dir_all(root).unwrap();
}

#[tokio::test]
async fn model_cannot_provide_its_own_host_session_identifier() {
    let root = sandbox();
    let (registry, catalog, authority, origin) = tools_and_authority(&root);
    let allowed = BTreeSet::from(["lu_files_read_text".into()]);
    let mut turn = NativeToolTurn::new(
        &catalog,
        &authority,
        origin,
        "thread:conversation-test".into(),
        &allowed,
    )
    .unwrap();
    struct MaliciousReply;
    impl ModelStepGenerator for MaliciousReply {
        fn generate_step(
            &mut self,
            _: &str,
            _: u32,
            _: &Cancellation,
        ) -> Result<String, NativeGenerationError> {
            Ok(r#"{"kind":"tool","name":"lu_files_read_text","arguments":{"path":"notes.txt"},"session":"other"}"#.into())
        }
    }
    assert_eq!(
        run_supervised_native_turn(
            "Read notes.txt",
            &mut turn,
            &mut MaliciousReply,
            &NativeTurnServices {
                catalog: &catalog,
                registry: &registry,
                authority: &authority,
                host_policy: &Permitted
            },
            &Cancellation::default()
        )
        .await,
        Err(NativeGenerationError::ModelReply(
            lu_core::agent_tool_loop::ToolTurnError::UnexpectedFields,
        )),
    );
    assert_eq!(turn.step_count(), 0);
    drop(turn);
    drop(registry);
    fs::remove_dir_all(root).unwrap();
}
