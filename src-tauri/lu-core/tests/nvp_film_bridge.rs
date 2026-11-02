//! Lu NVP bridge integration tests with a fake already-loaded model.
//! No external DLC binary, Windows installer, real GGUF or WebView connection.

use std::{
    fs,
    path::PathBuf,
    sync::{atomic::{AtomicBool, Ordering}, Arc},
    time::{SystemTime, UNIX_EPOCH},
};
use prost::Message;
use rusqlite::{params, Connection};

use lu_core::{
    contracts::{
        AuthorizationError, ModuleKind, ModuleManifest, NativeTool, PanelContribution,
        ProtoPayload, ToolAuthorizer, ToolDescriptor, ToolFuture, ToolInvocation, ToolOutput,
        WorkflowContribution,
        CORE_CONTRACT_VERSION,
    },
    host_resource_authority::{ResourceRecord, Sensitivity},
    host_session::{read_only_principal, HostSessionRegistry},
    inference_host::{Cancellation, EngineError, TokenChunk},
    journal::EffectState,
    nvp_film_bridge::{
        nvp_host_descriptors, LuSharedFilmInference, NvpBridgeError, NvpFilmBridge,
        NvpHostScope,
    },
    ownership_store::OwnershipStore,
    wire::proto,
    workspace::WorkspaceHost,
};

struct DeclaredOnly(ToolDescriptor);
impl NativeTool for DeclaredOnly {
    fn descriptor(&self) -> &ToolDescriptor { &self.0 }
    fn invoke(&self, _: ToolInvocation) -> ToolFuture<'_> {
        let result_type = self.0.output_type_url.clone();
        Box::pin(async move {
            Ok(ToolOutput {
                payload: ProtoPayload { type_url: result_type, bytes: vec![] },
            })
        })
    }
}

struct FilmPolicy {
    read: AtomicBool,
    generate: AtomicBool,
    propose: AtomicBool,
}
impl FilmPolicy {
    fn all_allowed() -> Self {
        Self {
            read: AtomicBool::new(true),
            generate: AtomicBool::new(true),
            propose: AtomicBool::new(true),
        }
    }
}
impl ToolAuthorizer for FilmPolicy {
    fn authorize(&self, _: &ToolInvocation, d: &ToolDescriptor)
        -> Result<(), AuthorizationError> {
        let flag = match d.id.as_str() {
            "nvp.film.project.read" => &self.read,
            "nvp.film.story.generate" => &self.generate,
            "nvp.film.story.propose" => &self.propose,
            _ => return Err(AuthorizationError::new("unreviewed film operation")),
        };
        if flag.load(Ordering::Acquire) {
            Ok(())
        } else {
            Err(AuthorizationError::new("current host grant revoked"))
        }
    }
}

#[derive(Clone, Copy)]
enum ModelMode {
    Normal,
    Unloaded,
    WrongText,
    ChangeScript,
}
struct FakeLoadedLu {
    mode: ModelMode,
    project_db: PathBuf,
}
impl LuSharedFilmInference for FakeLoadedLu {
    fn generate(
        &self,
        _: &str,
        _: u32,
        cancel: Cancellation,
        emit: &mut dyn FnMut(TokenChunk) -> Result<(), EngineError>,
    ) -> Result<(), EngineError> {
        if matches!(self.mode, ModelMode::Unloaded) {
            return Err(EngineError::NotLoaded);
        }
        let chunks: Vec<&str> = if matches!(self.mode, ModelMode::WrongText) {
            vec!["This is not a screenplay scene."]
        } else {
            vec!["INT. ROOM - NIGHT\n\nMARA\n", "I returned.\n"]
        };
        for (i, chunk) in chunks.into_iter().enumerate() {
            if cancel.is_cancelled() {
                return Err(EngineError::Cancelled);
            }
            emit(TokenChunk {
                text: chunk.into(), index: i as u32,
            })?;
        }
        if matches!(self.mode, ModelMode::ChangeScript) {
            let db = Connection::open(&self.project_db)
                .map_err(|_| EngineError::Backend("fixture DB unavailable".into()))?;
            db.execute(
                "UPDATE nvp_film_projects SET screenplay=?1,revision=revision+1
                 WHERE project_id='film1'",
                params!["EXT. FOREST - DAY\n\nMARA\nThe weather has changed."],
            ).map_err(|_| EngineError::Backend("fixture update failed".into()))?;
        }
        Ok(())
    }
}

struct Harness {
    root: PathBuf,
    workspaces: Arc<WorkspaceHost>,
    windows: Arc<HostSessionRegistry>,
    policy: Arc<FilmPolicy>,
    bridge: NvpFilmBridge,
    scope: NvpHostScope,
}
impl Harness {
    fn new(mode: ModelMode) -> Self {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir()
            .join(format!("lu-nvp-bridge-{}-{}", std::process::id(), stamp));
        fs::create_dir_all(&root).unwrap();
        let project_db = root.join("nvp-project.db");
        let owner_db = root.join("lu-owners.db");

        let workspaces = Arc::new(WorkspaceHost::default());
        let tools = nvp_host_descriptors();
        let implementations: Vec<Arc<dyn NativeTool>> = tools.iter()
            .cloned().map(|d| Arc::new(DeclaredOnly(d)) as Arc<dyn NativeTool>)
            .collect();
        workspaces.register_workspace(ModuleManifest {
            id: "nvp.film".into(),
            display_name: "NVP Film Workspace".into(),
            contract_version: CORE_CONTRACT_VERSION,
            kind: ModuleKind::Workspace,
            tools,
            panels: vec![PanelContribution {
                id: "nvp.film.story".into(), title: "Story".into(),
            }],
            workflows: vec![WorkflowContribution {
                id: "nvp.film.idea_to_script".into(), title: "Idea to script".into(),
            }],
        }, implementations).unwrap();
        workspaces.open_instance("nvp.film", "film-instance-1").unwrap();

        let windows = Arc::new(HostSessionRegistry::new());
        let owners = Arc::new(OwnershipStore::open(&owner_db).unwrap());
        owners.enroll(&ResourceRecord {
            conversation_id: "convo1".into(),
            owner_profile_id: "profile1".into(),
            project_id: "film1".into(),
            sensitivity: Sensitivity::Internal,
        }).unwrap();
        windows.bind_host_window("film-window",
            read_only_principal("profile1".into(), "film1".into())).unwrap();
        let policy = Arc::new(FilmPolicy::all_allowed());
        let inference: Arc<dyn LuSharedFilmInference> =
            Arc::new(FakeLoadedLu { mode, project_db: project_db.clone() });
        let bridge = NvpFilmBridge::open(
            &project_db, workspaces.clone(), windows.clone(),
            owners, policy.clone(), inference,
        ).unwrap();
        bridge.trusted_create_project(
            "film1", "The Doorway", "Mara returns for her missing sister", "",
        ).unwrap();
        let scope = bridge.trusted_open_scope(
            "film-window", "convo1", "film-instance-1",
        ).unwrap();
        Self { root, workspaces, windows, policy, bridge, scope }
    }
    fn read(&self) -> proto::NvpProjectSnapshot {
        let raw = self.bridge.read_project(
            &self.scope, "read-01", &proto::NvpProjectReadRequest {}.encode_to_vec(),
        ).unwrap();
        proto::NvpProjectSnapshot::decode(raw.as_slice()).unwrap()
    }
    fn generate(&self, call: &str,
                mut emit: impl FnMut(Vec<u8>) -> Result<(), NvpBridgeError>)
        -> Result<proto::NvpProposalReceipt, NvpBridgeError> {
        self.bridge.generate_proposal(
            &self.scope, call,
            &proto::NvpGenerateProposalRequest {
                stage: "screenplay".into(),
                instructions: "Keep the scene filmable".into(),
                expected_revision: 0, max_new_tokens: 500,
            }.encode_to_vec(),
            |frame| emit(frame),
        )
    }
    fn proposal_count(&self) -> i64 {
        let db = Connection::open(self.root.join("nvp-project.db")).unwrap();
        db.query_row("SELECT COUNT(*) FROM nvp_film_proposals", [], |r| r.get(0))
            .unwrap()
    }
}
impl Drop for Harness {
    fn drop(&mut self) {
        // On Windows, open SQLite handles may prevent deleting these fixtures
        // until the host has dropped; test cleanup is best-effort only.
        let _ = fs::remove_dir_all(&self.root);
    }
}
fn frames(raw: &[Vec<u8>]) -> Vec<proto::NvpStreamFrame> {
    raw.iter().map(|r| proto::NvpStreamFrame::decode(r.as_slice()).unwrap())
        .collect()
}

#[test]
fn read_is_typed_bounded_and_host_project_scoped() {
    let h = Harness::new(ModelMode::Normal);
    let snapshot = h.read();
    assert_eq!(snapshot.project_id, "film1");
    assert_eq!(snapshot.screenplay_revision, 0);
    assert_eq!(snapshot.screenplay, "");

    // Unknown fields are not silently ignored by the exact typed boundary.
    assert_eq!(h.bridge.read_project(
        &h.scope, "read-02", &[0x78, 0x01],
    ), Err(NvpBridgeError::InvalidRequest));
    assert_eq!(h.bridge.read_project(
        &h.scope, "read-03", &[0u8; 32769],
    ), Err(NvpBridgeError::InvalidRequest));
}

#[test]
fn streamed_lu_inference_saves_only_proposed_draft_and_durable_receipt() {
    let h = Harness::new(ModelMode::Normal);
    let mut packets = vec![];
    let receipt = h.generate("film-gen-01", |frame| {
        packets.push(frame); Ok(())
    }).unwrap();
    assert_eq!(receipt.status, "proposed");
    assert_eq!(receipt.stage, "screenplay");
    assert_eq!(receipt.project_id, "film1");
    assert_eq!(h.proposal_count(), 1);
    assert_eq!(h.read().screenplay, "");
    assert_eq!(h.bridge.effect_state("film-gen-01").unwrap(), Some(EffectState::Applied));

    let events = frames(&packets);
    assert_eq!(events.len(), 3);
    assert_eq!(events[0].sequence, 1);
    assert_eq!(events[1].sequence, 2);
    assert_eq!(events[2].sequence, 3);
    assert!(matches!(events[2].event,
        Some(proto::nvp_stream_frame::Event::Proposal(_))));
    assert_eq!(events[2].request_id, "film-gen-01");

    // The source is a real durable SQLite project, not mock memory only.
    let db = Connection::open(h.root.join("nvp-project.db")).unwrap();
    let content: String = db.query_row(
        "SELECT content FROM nvp_film_proposals WHERE proposal_id='film-gen-01'",
        [], |r| r.get(0),
    ).unwrap();
    assert!(content.contains("I returned"));
}

#[test]
fn host_write_grant_is_required_and_live() {
    let h = Harness::new(ModelMode::Normal);
    h.policy.propose.store(false, Ordering::Release);
    let mut packets = vec![];
    assert_eq!(h.generate("film-no-write", |x| {
        packets.push(x); Ok(())
    }), Err(NvpBridgeError::Denied));
    assert_eq!(h.proposal_count(), 0);
    assert!(frames(&packets).last().is_some_and(|event| matches!(
        event.event.as_ref(),
        Some(proto::nvp_stream_frame::Event::Stopped(_))
    )));
}

#[test]
fn concurrent_screenplay_revision_refuses_proposal() {
    let h = Harness::new(ModelMode::ChangeScript);
    let mut events = vec![];
    let result = h.generate("film-stale-01", |bytes| {
        events.push(bytes);
        Ok(())
    });
    assert_eq!(result, Err(NvpBridgeError::StaleRevision));
    assert_eq!(h.proposal_count(), 0);
    let snapshot = h.read();
    assert_eq!(snapshot.screenplay_revision, 1);
    assert!(snapshot.screenplay.contains("FOREST"));
    assert_eq!(h.bridge.effect_state("film-stale-01").unwrap(),
        Some(EffectState::Failed));
    assert!(frames(&events).last().is_some_and(|event| matches!(
        event.event.as_ref(),
        Some(proto::nvp_stream_frame::Event::Stopped(s))
            if s.code == "REVISION_CHANGED"
    )));
}

#[test]
fn manual_proposal_storage_is_authorized_typed_and_idempotent() {
    let h = Harness::new(ModelMode::Normal);
    let req = proto::NvpSaveProposalRequest {
        project_id: "film1".into(), stage: "screenplay".into(),
        content: "INT. KITCHEN - DAY\n\nMARA\nHello.".into(),
        instructions: "Try a shorter greeting".into(),
        expected_revision: 0,
    }.encode_to_vec();
    let response = h.bridge.save_proposal(&h.scope, "manual-01", &req).unwrap();
    let receipt = proto::NvpProposalReceipt::decode(response.as_slice()).unwrap();
    assert_eq!(receipt.status, "proposed");
    assert_eq!(h.read().screenplay, "");
    assert_eq!(h.bridge.save_proposal(&h.scope, "manual-01", &req),
        Err(NvpBridgeError::DuplicateEffect));

    let bad = proto::NvpSaveProposalRequest {
        project_id: "another-film".into(), stage: "screenplay".into(),
        content: "INT. ROOM - DAY\n".into(),
        instructions: String::new(), expected_revision: 0,
    }.encode_to_vec();
    assert_eq!(h.bridge.save_proposal(&h.scope, "wrong-project", &bad),
        Err(NvpBridgeError::Denied));
    assert_eq!(h.proposal_count(), 1);
}

#[test]
fn cancellation_from_correct_scope_interrupts_stream_without_proposal() {
    let h = Harness::new(ModelMode::Normal);
    let mut packets = vec![];
    let result = h.generate("film-cancel-01", |p| {
        let frame = proto::NvpStreamFrame::decode(p.as_slice()).unwrap();
        if matches!(frame.event, Some(proto::nvp_stream_frame::Event::Text(_))) {
            h.bridge.cancel_request(&h.scope, "film-cancel-01").unwrap();
        }
        packets.push(p);
        Ok(())
    });
    assert_eq!(result, Err(NvpBridgeError::Cancelled));
    assert_eq!(h.proposal_count(), 0);
    assert!(frames(&packets).last().is_some_and(|event| matches!(
        event.event.as_ref(),
        Some(proto::nvp_stream_frame::Event::Stopped(s)) if s.cancelled
    )));
}

#[test]
fn suspension_or_host_window_unbind_revokes_active_stream() {
    let h = Harness::new(ModelMode::Normal);
    let mut stopped = false;
    let result = h.generate("film-suspend-01", |bytes| {
        let msg = proto::NvpStreamFrame::decode(bytes.as_slice()).unwrap();
        if matches!(msg.event, Some(proto::nvp_stream_frame::Event::Text(_))) && !stopped {
            h.workspaces.suspend_instance("film-instance-1").unwrap();
            stopped = true;
        }
        Ok(())
    });
    assert_eq!(result, Err(NvpBridgeError::Cancelled));
    assert_eq!(h.proposal_count(), 0);
    h.workspaces.resume_instance("film-instance-1").unwrap();

    let mut unbound = false;
    let result = h.generate("film-unbind-01", |bytes| {
        let msg = proto::NvpStreamFrame::decode(bytes.as_slice()).unwrap();
        if matches!(msg.event, Some(proto::nvp_stream_frame::Event::Text(_))) && !unbound {
            h.windows.unbind_host_window("film-window").unwrap();
            unbound = true;
        }
        Ok(())
    });
    assert_eq!(result, Err(NvpBridgeError::Cancelled));
    assert_eq!(h.proposal_count(), 0);
    assert!(matches!(h.bridge.read_project(
        &h.scope, "read-after-unbind",
        &proto::NvpProjectReadRequest {}.encode_to_vec(),
    ), Err(NvpBridgeError::Denied)));
}

#[test]
fn no_model_loaded_never_commits_proposal() {
    let h = Harness::new(ModelMode::Unloaded);
    let mut packets = vec![];
    assert_eq!(h.generate("film-no-model", |x| { packets.push(x); Ok(()) }),
        Err(NvpBridgeError::ModelUnavailable));
    assert_eq!(h.proposal_count(), 0);
    assert!(frames(&packets).last().is_some_and(|event| matches!(
        event.event.as_ref(), Some(proto::nvp_stream_frame::Event::Stopped(s))
            if s.code == "MODEL_UNAVAILABLE"
    )));
}

#[test]
fn non_screenplay_output_cannot_be_committed_as_screenplay() {
    let h = Harness::new(ModelMode::WrongText);
    assert_eq!(h.generate("film-bad-text", |_| Ok(())),
        Err(NvpBridgeError::InvalidRequest));
    assert_eq!(h.proposal_count(), 0);
}

#[test]
fn revoked_host_policy_denies_subsequent_calls_even_with_cached_scope() {
    let h = Harness::new(ModelMode::Normal);
    h.policy.read.store(false, Ordering::Release);
    let result = h.bridge.read_project(
        &h.scope, "read-revoked",
        &proto::NvpProjectReadRequest {}.encode_to_vec(),
    );
    assert_eq!(result, Err(NvpBridgeError::Denied));
}
