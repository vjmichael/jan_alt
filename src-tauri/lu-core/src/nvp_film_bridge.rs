//! Lu-owned, typed NVP Film Workspace project/inference/proposal bridge.
//!
//! No NVP model loader, HTTP service, UI-granted scope or arbitrary worker
//! path exists in this module. The trusted desktop host supplies the existing
//! loaded InferenceHost, active WorkspaceHost, policy, and enrolled owner/session
//! records. Public Rust entrypoints MUST NOT be exposed as raw WebView commands:
//! window identity and call IDs are derived from trusted host lifecycle data.
//!
//! This crate-level bridge is not itself the signed external DLC installer,
//! process sandbox, or desktop event sender.

use std::{
    path::Path,
    sync::{atomic::{AtomicU64, Ordering}, Arc, Mutex},
};

use prost::Message;
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

use crate::{
    contracts::{ProtoPayload, ToolAuthorizer, ToolDescriptor, ToolEffect, ToolInvocation},
    host_resource_authority::ResourceAction,
    host_session::HostSessionRegistry,
    inference_host::{
        Cancellation, EngineError, EnginePhase, GenerationRequest, InferenceBackend,
        InferenceHost, TokenChunk,
    },
    inference_supervisor::{SupervisorError, TrustedInferenceSupervisor},
    inference_wire::decode_frame,
    inference_bridge::BridgeError,
    journal::{EffectJournal, EffectState, PrepareOutcome},
    ownership_store::OwnershipStore,
    wire::proto,
    workspace::{WorkspaceHost, WorkspaceState},
};

pub const NVP_MODULE: &str = "nvp.film";
const READ_ID: &str = "nvp.film.project.read";
const GENERATE_ID: &str = "nvp.film.story.generate";
const PROPOSE_ID: &str = "nvp.film.story.propose";
const READ_REQ_TYPE: &str = "type.googleapis.com/lu.v1.NvpProjectReadRequest";
const READ_RESULT_TYPE: &str = "type.googleapis.com/lu.v1.NvpProjectSnapshot";
const GENERATE_REQ_TYPE: &str = "type.googleapis.com/lu.v1.NvpGenerateProposalRequest";
const GENERATE_RESULT_TYPE: &str = "type.googleapis.com/lu.v1.NvpStreamFrame";
const SAVE_REQ_TYPE: &str = "type.googleapis.com/lu.v1.NvpSaveProposalRequest";
const SAVE_RESULT_TYPE: &str = "type.googleapis.com/lu.v1.NvpProposalReceipt";

const MAX_REQUEST: usize = 32 * 1024;
const MAX_DRAFT: usize = 120_000;
const MAX_CHUNK: usize = 8192;
const MAX_PROMPT: usize = 48_000;
const MAX_SCRIPT: usize = 1_000_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum NvpBridgeError {
    Denied,
    InvalidRequest,
    MissingProject,
    StaleRevision,
    DuplicateEffect,
    Busy,
    Cancelled,
    ModelUnavailable,
    ModelFailed,
    Storage,
    Journal,
    StreamClosed,
}
impl NvpBridgeError {
    fn code(&self) -> &'static str {
        match self {
            Self::Denied => "DENIED",
            Self::InvalidRequest => "INVALID_REQUEST",
            Self::MissingProject => "PROJECT_MISSING",
            Self::StaleRevision => "REVISION_CHANGED",
            Self::DuplicateEffect => "DUPLICATE_EFFECT",
            Self::Busy => "BUSY",
            Self::Cancelled => "CANCELLED",
            Self::ModelUnavailable => "MODEL_UNAVAILABLE",
            Self::ModelFailed => "MODEL_FAILED",
            Self::Storage => "STORAGE_FAILED",
            Self::Journal => "JOURNAL_FAILED",
            Self::StreamClosed => "STREAM_CLOSED",
        }
    }
}

/// Only the trusted Rust host constructs this scope; it is not a serializable
/// token, model tool argument, user-supplied window ID, or authority by itself.
#[derive(Clone)]
pub struct NvpHostScope {
    window: String,
    conversation: String,
    workspace: String,
    project: String,
    incarnation: Arc<()>,
}

#[derive(Clone, Copy)]
enum Operation {
    Read,
    Generate,
    Propose,
}
impl Operation {
    fn descriptor(self) -> ToolDescriptor {
        let (id, name, effect, input, output) = match self {
            Self::Read => (READ_ID, "Read film project", ToolEffect::ReadWorkspace,
                READ_REQ_TYPE, READ_RESULT_TYPE),
            Self::Generate => (GENERATE_ID, "Generate NVP writing proposal",
                ToolEffect::ExecuteCode, GENERATE_REQ_TYPE, GENERATE_RESULT_TYPE),
            Self::Propose => (PROPOSE_ID, "Store proposed film draft",
                ToolEffect::WriteWorkspace, SAVE_REQ_TYPE, SAVE_RESULT_TYPE),
        };
        ToolDescriptor {
            id: id.into(),
            display_name: name.into(),
            effect,
            input_type_url: input.into(),
            output_type_url: output.into(),
        }
    }
}

/// These descriptors MUST be registered by the trusted Lu Workspace loader
/// with vetted implementations. This function only supplies deterministic
/// metadata; discovery never grants authorization.
pub fn nvp_host_descriptors() -> Vec<ToolDescriptor> {
    vec![
        Operation::Read.descriptor(),
        Operation::Generate.descriptor(),
        Operation::Propose.descriptor(),
    ]
}

/// Bound to Lu's already-loaded model; no load/unload/switch methods.
pub trait LuSharedFilmInference: Send + Sync {
    fn generate(
        &self,
        prompt: &str,
        max_new_tokens: u32,
        cancel: Cancellation,
        emit: &mut dyn FnMut(TokenChunk) -> Result<(), EngineError>,
    ) -> Result<(), EngineError>;
    /// Signal any active supervisor-managed generation without waiting for
    /// the engine mutex. Default is sufficient for direct InferenceHost ports.
    fn cancel_active(&self) {}
}

/// The real inference adapter: one existing, Lu-owned resident model, with a
/// mutex controlling foreground contention. Cancellation is independent of
/// this mutex and may be signalled from another trusted host thread.
pub struct ExistingLuInference<B: InferenceBackend + Send> {
    host: Arc<Mutex<InferenceHost<B>>>,
}
impl<B: InferenceBackend + Send> ExistingLuInference<B> {
    pub fn new(loaded_lu_host: Arc<Mutex<InferenceHost<B>>>) -> Self {
        Self { host: loaded_lu_host }
    }
}
impl<B: InferenceBackend + Send> LuSharedFilmInference for ExistingLuInference<B> {
    fn generate(
        &self,
        prompt: &str,
        max_new_tokens: u32,
        cancel: Cancellation,
        emit: &mut dyn FnMut(TokenChunk) -> Result<(), EngineError>,
    ) -> Result<(), EngineError> {
        let mut engine = self.host.lock()
            .map_err(|_| EngineError::Backend("Lu inference lock unavailable".into()))?;
        engine.generate(
            GenerationRequest { prompt: prompt.to_owned(), max_new_tokens },
            cancel,
            |chunk| emit(chunk),
        )
    }
}

/// Production-compatible adapter for Lu's existing desktop supervisor.
/// Uses its already-loaded session, reservation, typed InferenceFrame stream
/// and cancellation. This does not create a second engine or load weights.
pub struct ExistingLuSupervisor<B: InferenceBackend + Send + 'static> {
    host: Arc<TrustedInferenceSupervisor<B>>,
    generation: Mutex<Option<(String, String, String)>>,
    serial: AtomicU64,
}
impl<B: InferenceBackend + Send + 'static> ExistingLuSupervisor<B> {
    pub fn new(host: Arc<TrustedInferenceSupervisor<B>>) -> Self {
        Self {
            host,
            generation: Mutex::new(None),
            serial: AtomicU64::new(1),
        }
    }
    fn supervisor_error(error: SupervisorError) -> EngineError {
        match error {
            SupervisorError::Unavailable | SupervisorError::UnknownModel =>
                EngineError::NotLoaded,
            SupervisorError::Busy => EngineError::Busy,
            _ => EngineError::Backend("Lu supervisor generation failed".into()),
        }
    }
}
impl<B: InferenceBackend + Send + 'static> LuSharedFilmInference for ExistingLuSupervisor<B> {
    fn generate(
        &self,
        prompt: &str,
        max_new_tokens: u32,
        cancel: Cancellation,
        emit: &mut dyn FnMut(TokenChunk) -> Result<(), EngineError>,
    ) -> Result<(), EngineError> {
        let status = self.host.status().map_err(Self::supervisor_error)?;
        let session = status.session_id.ok_or(EngineError::NotLoaded)?;
        if status.phase != EnginePhase::Ready {
            return Err(EngineError::Busy);
        }
        let id = self.serial.fetch_add(1, Ordering::Relaxed);
        let generation = format!("nvp-film-{}-{id}", std::process::id());
        let request = format!("nvp-request-{}-{id}", std::process::id());
        self.host.reserve_generation(
            &session, &generation, &request, prompt, max_new_tokens,
        ).map_err(Self::supervisor_error)?;
        {
            let mut job = self.generation.lock()
                .map_err(|_| EngineError::Backend("Lu generation state unavailable".into()))?;
            *job = Some((session.clone(), generation.clone(), request.clone()));
        }
        if cancel.is_cancelled() {
            self.cancel_active();
        }
        let result = self.host.run_reserved(
            &session, &generation, &request, prompt.to_owned(), max_new_tokens,
            |raw: Vec<u8>| {
                let frame = decode_frame(&raw).map_err(|_| BridgeError::Consumer)?;
                if let Some(proto::inference_frame::Body::Event(event)) = frame.body {
                    if let Some(proto::inference_event::Kind::TextChunk(chunk)) = event.kind {
                        if cancel.is_cancelled() {
                            return Err(BridgeError::Consumer);
                        }
                        emit(TokenChunk {
                            text: chunk.text, index: chunk.chunk_index,
                        }).map_err(|_| BridgeError::Consumer)?;
                    }
                }
                Ok(())
            },
        );
        if let Ok(mut job) = self.generation.lock() {
            if job.as_ref().is_some_and(|(_, generation_id, _)|
                generation_id == &generation) {
                *job = None;
            }
        }
        if cancel.is_cancelled() {
            return Err(EngineError::Cancelled);
        }
        result.map_err(Self::supervisor_error)
    }

    fn cancel_active(&self) {
        let active = self.generation.lock().ok()
            .and_then(|job| job.clone());
        if let Some((session, generation, request)) = active {
            let _ = self.host.cancel(&session, &generation, &request);
        }
    }
}

struct ActiveGeneration {
    request_id: String,
    scope: Arc<()>,
    cancellation: Cancellation,
}

/// In-process Lu host service. The desktop adapter must obtain the actual
/// caller window from trusted Tauri context, not from a WebView parameter.
/// Paths and policy implementations come from the trusted Lu host only.
pub struct NvpFilmBridge {
    workspaces: Arc<WorkspaceHost>,
    windows: Arc<HostSessionRegistry>,
    ownership: Arc<OwnershipStore>,
    policy: Arc<dyn ToolAuthorizer>,
    inference: Arc<dyn LuSharedFilmInference>,
    projects: Mutex<Connection>,
    journal: EffectJournal,
    active: Mutex<Option<ActiveGeneration>>,
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}
fn valid_stage(s: &str) -> bool {
    matches!(s, "logline" | "synopsis" | "beat_sheet" | "treatment" | "screenplay")
}
fn has_scene_heading(content: &str) -> bool {
    content.lines().any(|line| {
        let line = line.trim().to_ascii_uppercase();
        ["INT.", "EXT.", "INT/EXT.", "EXT/INT.", "I/E."].iter()
            .any(|prefix| line.starts_with(prefix))
    })
}
fn canonical<T: Message + Default>(bytes: &[u8], maximum: usize) -> Result<T, NvpBridgeError> {
    if bytes.len() > maximum {
        return Err(NvpBridgeError::InvalidRequest);
    }
    let value = T::decode(bytes).map_err(|_| NvpBridgeError::InvalidRequest)?;
    if value.encode_to_vec() != bytes {
        return Err(NvpBridgeError::InvalidRequest);
    }
    Ok(value)
}
fn validate_proposal(req: &proto::NvpSaveProposalRequest) -> Result<(), NvpBridgeError> {
    if !valid_identifier(&req.project_id)
        || !valid_stage(&req.stage)
        || req.instructions.len() > 5000
        || req.content.trim().is_empty()
        || req.content.len() > MAX_DRAFT
        || req.expected_revision > i64::MAX as u64
        || (req.stage == "screenplay" && !has_scene_heading(&req.content))
    {
        return Err(NvpBridgeError::InvalidRequest);
    }
    Ok(())
}

impl NvpFilmBridge {
    /// Only the trusted desktop may select the SQLite location and perform
    /// host enrollment. The same file is used for project records and Lu's
    /// durable effect journal; separate WAL connections remain recoverable.
    pub fn open(
        app_owned_db: &Path,
        workspaces: Arc<WorkspaceHost>,
        windows: Arc<HostSessionRegistry>,
        ownership: Arc<OwnershipStore>,
        policy: Arc<dyn ToolAuthorizer>,
        inference: Arc<dyn LuSharedFilmInference>,
    ) -> Result<Self, NvpBridgeError> {
        let connection = Connection::open(app_owned_db)
            .map_err(|_| NvpBridgeError::Storage)?;
        connection.pragma_update(None, "journal_mode", "WAL")
            .map_err(|_| NvpBridgeError::Storage)?;
        connection.pragma_update(None, "synchronous", "FULL")
            .map_err(|_| NvpBridgeError::Storage)?;
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS nvp_film_projects (
               project_id TEXT PRIMARY KEY NOT NULL,
               title TEXT NOT NULL,
               idea TEXT NOT NULL,
               screenplay TEXT NOT NULL,
               revision INTEGER NOT NULL CHECK(revision >= 0)
             );
             CREATE TABLE IF NOT EXISTS nvp_film_proposals (
               proposal_id TEXT PRIMARY KEY NOT NULL,
               project_id TEXT NOT NULL REFERENCES nvp_film_projects(project_id),
               stage TEXT NOT NULL,
               instructions TEXT NOT NULL,
               content TEXT NOT NULL,
               source_revision INTEGER NOT NULL,
               status TEXT NOT NULL CHECK(status = 'proposed')
             );
             CREATE INDEX IF NOT EXISTS nvp_proposals_by_project
               ON nvp_film_proposals(project_id);",
        ).map_err(|_| NvpBridgeError::Storage)?;
        let journal = EffectJournal::open(app_owned_db)
            .map_err(|_| NvpBridgeError::Journal)?;
        Ok(Self {
            workspaces, windows, ownership, policy, inference,
            projects: Mutex::new(connection), journal,
            active: Mutex::new(None),
        })
    }

    /// Trusted-host project enrollment only. No browser/LLM-facing command.
    /// Subsequent reads are scoped to Lu's durable conversation ownership.
    pub fn trusted_create_project(
        &self, project_id: &str, title: &str, idea: &str,
        screenplay: &str,
    ) -> Result<(), NvpBridgeError> {
        if !valid_identifier(project_id) || title.is_empty() || title.len() > 300
            || idea.len() > 20000 || screenplay.len() > MAX_SCRIPT
        {
            return Err(NvpBridgeError::InvalidRequest);
        }
        let db = self.projects.lock().map_err(|_| NvpBridgeError::Storage)?;
        let changed = db.execute(
            "INSERT OR IGNORE INTO nvp_film_projects
             (project_id,title,idea,screenplay,revision) VALUES (?1,?2,?3,?4,0)",
            params![project_id, title, idea, screenplay],
        ).map_err(|_| NvpBridgeError::Storage)?;
        if changed != 1 {
            return Err(NvpBridgeError::DuplicateEffect);
        }
        Ok(())
    }

    /// Called only from a trusted Lu window/workspace lifecycle callback.
    /// Never forward WebView-supplied IDs to this constructor.
    pub fn trusted_open_scope(
        &self, actual_window: &str, enrolled_conversation: &str,
        active_workspace_instance: &str,
    ) -> Result<NvpHostScope, NvpBridgeError> {
        let resource = self.windows.require_window_resource(
            actual_window, enrolled_conversation, ResourceAction::Read,
            &self.ownership,
        ).map_err(|_| NvpBridgeError::Denied)?;
        let scope = NvpHostScope {
            window: actual_window.into(),
            conversation: enrolled_conversation.into(),
            workspace: active_workspace_instance.into(),
            project: resource.project_id().into(),
            incarnation: Arc::new(()),
        };
        // Verify a real registered tool and current host permission.
        self.authorize(&scope, Operation::Read, "nvp-scope-open", &[])?;
        Ok(scope)
    }

    /// The workspace and project can be suspended/revoked after scope creation.
    /// A cached Rust scope never substitutes for a live host authorization.
    fn authorize(
        &self, scope: &NvpHostScope, operation: Operation,
        call_id: &str, payload: &[u8],
    ) -> Result<ToolInvocation, NvpBridgeError> {
        if !valid_identifier(call_id) {
            return Err(NvpBridgeError::InvalidRequest);
        }
        let resource = self.windows.require_window_resource(
            &scope.window, &scope.conversation,
            ResourceAction::Read, &self.ownership,
        ).map_err(|_| NvpBridgeError::Denied)?;
        if resource.project_id() != scope.project {
            return Err(NvpBridgeError::Denied);
        }
        // Fast explicit membership check plus the generic registered Lu
        // streaming gate: this is never an NVP-specific privileged dispatcher.
        let active = self.workspaces.instances()
            .map_err(|_| NvpBridgeError::Denied)?
            .iter()
            .any(|w| w.id == scope.workspace && w.module_id == NVP_MODULE
                && w.state == WorkspaceState::Active);
        if !active {
            return Err(NvpBridgeError::Denied);
        }
        let expected = operation.descriptor();
        let invocation = ToolInvocation {
            call_id: call_id.into(),
            tool_id: expected.id.clone(),
            workspace_id: Some(scope.workspace.clone()),
            input: ProtoPayload {
                type_url: expected.input_type_url.clone(),
                bytes: payload.to_vec(),
            },
        };
        let registered = self.workspaces.authorize_stream_operation(
            &invocation, self.policy.as_ref(),
        ).map_err(|_| NvpBridgeError::Denied)?;
        if registered != expected {
            return Err(NvpBridgeError::Denied);
        }
        Ok(invocation)
    }

    fn snapshot(&self, scope: &NvpHostScope) -> Result<proto::NvpProjectSnapshot, NvpBridgeError> {
        let db = self.projects.lock().map_err(|_| NvpBridgeError::Storage)?;
        let row = db.query_row(
            "SELECT title,idea,screenplay,revision
             FROM nvp_film_projects WHERE project_id=?1",
            params![scope.project],
            |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?, r.get::<_, i64>(3)?)),
        ).optional().map_err(|_| NvpBridgeError::Storage)?
            .ok_or(NvpBridgeError::MissingProject)?;
        Ok(proto::NvpProjectSnapshot {
            project_id: scope.project.clone(),
            title: row.0, idea: row.1, screenplay: row.2,
            screenplay_revision: u64::try_from(row.3)
                .map_err(|_| NvpBridgeError::Storage)?,
        })
    }

    /// Typed Protobuf read, with project identity supplied only by Lu scope.
    pub fn read_project(
        &self, scope: &NvpHostScope, host_call_id: &str, wire: &[u8],
    ) -> Result<Vec<u8>, NvpBridgeError> {
        let _: proto::NvpProjectReadRequest = canonical(wire, MAX_REQUEST)?;
        self.authorize(scope, Operation::Read, host_call_id, wire)?;
        let snapshot = self.snapshot(scope)?;
        // Critical: check revocation again before returning private content.
        self.authorize(scope, Operation::Read, host_call_id, wire)?;
        Ok(snapshot.encode_to_vec())
    }

    /// Host-journaled and revision-checked proposal storage. No code path
    /// here can mark an approved screenplay or mutate its source revision.
    pub fn save_proposal(
        &self, scope: &NvpHostScope, host_call_id: &str, wire: &[u8],
    ) -> Result<Vec<u8>, NvpBridgeError> {
        self.write_proposal(scope, host_call_id, wire, None)
            .map(|receipt| receipt.encode_to_vec())
    }

    fn write_proposal(
        &self, scope: &NvpHostScope, call_id: &str, wire: &[u8],
        cancellation: Option<&Cancellation>,
    ) -> Result<proto::NvpProposalReceipt, NvpBridgeError> {
        let request: proto::NvpSaveProposalRequest = canonical(wire, MAX_DRAFT + 8192)?;
        validate_proposal(&request)?;
        if request.project_id != scope.project {
            return Err(NvpBridgeError::Denied);
        }
        let invocation = self.authorize(scope, Operation::Propose, call_id, wire)?;
        if cancellation.is_some_and(Cancellation::is_cancelled) {
            return Err(NvpBridgeError::Cancelled);
        }
        match self.journal.prepare(&invocation)
            .map_err(|_| NvpBridgeError::Journal)? {
            PrepareOutcome::New => {}
            // Incomplete/uncertain effects are never blindly replayed;
            // even an APPLIED effect must be read using a separate receipt API.
            PrepareOutcome::Existing(_) => return Err(NvpBridgeError::DuplicateEffect),
        }
        self.journal.mark_executing(call_id)
            .map_err(|_| NvpBridgeError::Journal)?;
        let effect = (|| {
            let mut db = self.projects.lock().map_err(|_| NvpBridgeError::Storage)?;
            let tx = db.transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|_| NvpBridgeError::Storage)?;
            let current: Option<i64> = tx.query_row(
                "SELECT revision FROM nvp_film_projects WHERE project_id=?1",
                params![scope.project],
                |r| r.get(0),
            ).optional().map_err(|_| NvpBridgeError::Storage)?;
            let current = current.ok_or(NvpBridgeError::MissingProject)?;
            if u64::try_from(current).map_err(|_| NvpBridgeError::Storage)?
                != request.expected_revision {
                return Err(NvpBridgeError::StaleRevision);
            }
            if cancellation.is_some_and(Cancellation::is_cancelled) {
                return Err(NvpBridgeError::Cancelled);
            }
            // Reauthorize under the write transaction immediately before effect.
            self.authorize(scope, Operation::Propose, call_id, wire)?;
            tx.execute(
                "INSERT INTO nvp_film_proposals
                 (proposal_id,project_id,stage,instructions,content,source_revision,status)
                 VALUES (?1,?2,?3,?4,?5,?6,'proposed')",
                params![call_id, scope.project, request.stage,
                    request.instructions, request.content, current],
            ).map_err(|_| NvpBridgeError::Storage)?;
            tx.commit().map_err(|_| NvpBridgeError::Storage)?;
            Ok(proto::NvpProposalReceipt {
                proposal_id: call_id.into(),
                project_id: scope.project.clone(),
                stage: request.stage.clone(),
                source_revision: request.expected_revision,
                status: "proposed".into(),
            })
        })();
        match effect {
            Ok(receipt) => {
                // A receipt is emitted only after the durable APPLIED transition.
                self.journal.mark_applied(call_id, &receipt.encode_to_vec())
                    .map_err(|_| NvpBridgeError::Journal)?;
                Ok(receipt)
            }
            Err(error) => {
                if error == NvpBridgeError::StaleRevision
                    || error == NvpBridgeError::Cancelled
                    || error == NvpBridgeError::Denied {
                    // For these failures the transaction was not committed.
                    let _ = self.journal.mark_failed(call_id);
                } else {
                    // A disk fault or commit ambiguity may have written output.
                    // Never replay without explicit reconciliation.
                    let _ = self.journal.mark_uncertain(call_id);
                }
                Err(error)
            }
        }
    }

    fn prompt(snapshot: &proto::NvpProjectSnapshot,
              request: &proto::NvpGenerateProposalRequest) -> String {
        let (script, qualified) = if snapshot.screenplay.len() > 16000 {
            ({
                let mut boundary = 16000;
                while !snapshot.screenplay.is_char_boundary(boundary) {
                    boundary -= 1;
                }
                &snapshot.screenplay[..boundary]
            },
             "Excerpt of a longer screenplay. Do not claim you saw omitted scenes.")
        } else {
            (snapshot.screenplay.as_str(), "Screenplay context supplied below.")
        };
        let result = format!(
            "You are NVP's Lu-hosted screenplay collaborator. Output a draft only. \
             Never grant tools, overwrite a screenplay, claim a rendered movie, \
             or turn creator suggestions into approved decisions. For the \
             screenplay stage, write Fountain-style INT./EXT. headings, \
             physical actions, character cues and natural dialogue.\n\
             Film: {}\nCreator's idea: {}\nWriting stage: {}\n\
             Creator guidance: {}\n{}\nScript:\n{}\n",
            snapshot.title, snapshot.idea, request.stage,
            request.instructions, qualified, script
        );
        result
    }

    fn stream_event(
        request_id: &str, sequence: u64,
        event: proto::nvp_stream_frame::Event,
    ) -> Vec<u8> {
        proto::NvpStreamFrame {
            request_id: request_id.into(), sequence, event: Some(event),
        }.encode_to_vec()
    }

    /// Synchronous, bounded streamed inference in a Lu-owned worker thread.
    /// The callback receives typed Protobuf frames; call cancel_request from
    /// another trusted host thread. Does not load or unload any model.
    pub fn generate_proposal(
        &self,
        scope: &NvpHostScope,
        host_call_id: &str,
        wire: &[u8],
        mut emit: impl FnMut(Vec<u8>) -> Result<(), NvpBridgeError>,
    ) -> Result<proto::NvpProposalReceipt, NvpBridgeError> {
        let request: proto::NvpGenerateProposalRequest = canonical(wire, MAX_REQUEST)?;
        if !valid_stage(&request.stage) || request.instructions.len() > 5000
            || request.expected_revision > i64::MAX as u64
            || request.max_new_tokens == 0 || request.max_new_tokens > 8192
        {
            return Err(NvpBridgeError::InvalidRequest);
        }
        self.authorize(scope, Operation::Read, host_call_id, &[])?;
        self.authorize(scope, Operation::Generate, host_call_id, wire)?;
        let snapshot = self.snapshot(scope)?;
        if snapshot.screenplay_revision != request.expected_revision {
            return Err(NvpBridgeError::StaleRevision);
        }
        let prompt = Self::prompt(&snapshot, &request);
        if prompt.len() > MAX_PROMPT {
            return Err(NvpBridgeError::InvalidRequest);
        }
        let cancel = Cancellation::default();
        {
            let mut active = self.active.lock().map_err(|_| NvpBridgeError::Busy)?;
            if active.is_some() {
                return Err(NvpBridgeError::Busy);
            }
            *active = Some(ActiveGeneration {
                request_id: host_call_id.into(),
                scope: Arc::clone(&scope.incarnation),
                cancellation: cancel.clone(),
            });
        }
        let mut sequence = 0u64;
        let result = (|| {
            let mut output = String::new();
            let generated = self.inference.generate(
                &prompt, request.max_new_tokens, cancel.clone(),
                &mut |chunk| {
                    if cancel.is_cancelled() {
                        return Err(EngineError::Cancelled);
                    }
                    if self.authorize(scope, Operation::Generate, host_call_id, wire).is_err() {
                        cancel.cancel();
                        return Err(EngineError::Cancelled);
                    }
                    if chunk.text.len() > MAX_CHUNK
                        || output.len().saturating_add(chunk.text.len()) > MAX_DRAFT {
                        cancel.cancel();
                        return Err(EngineError::InvalidRequest);
                    }
                    output.push_str(&chunk.text);
                    sequence += 1;
                    let bytes = Self::stream_event(
                        host_call_id, sequence,
                        proto::nvp_stream_frame::Event::Text(proto::NvpStreamText {
                            text: chunk.text,
                        }),
                    );
                    emit(bytes).map_err(|_| {
                        cancel.cancel();
                        EngineError::Backend("stream receiver closed".into())
                    })?;
                    Ok(())
                },
            );
            if cancel.is_cancelled() {
                return Err(NvpBridgeError::Cancelled);
            }
            generated.map_err(|e| match e {
                EngineError::NotLoaded => NvpBridgeError::ModelUnavailable,
                EngineError::Cancelled => NvpBridgeError::Cancelled,
                _ => NvpBridgeError::ModelFailed,
            })?;
            if output.trim().is_empty()
                || (request.stage == "screenplay" && !has_scene_heading(&output)) {
                return Err(NvpBridgeError::InvalidRequest);
            }
            self.authorize(scope, Operation::Generate, host_call_id, wire)?;
            let save = proto::NvpSaveProposalRequest {
                project_id: scope.project.clone(),
                stage: request.stage.clone(),
                content: output,
                instructions: request.instructions.clone(),
                expected_revision: request.expected_revision,
            };
            let receipt = self.write_proposal(
                scope, host_call_id, &save.encode_to_vec(), Some(&cancel),
            )?;
            // Once journal APPLIED is durable, the receipt is authoritative.
            // A late cancellation cannot undo an already-committed proposal.
            sequence += 1;
            emit(Self::stream_event(
                host_call_id, sequence,
                proto::nvp_stream_frame::Event::Proposal(receipt.clone()),
            ))?;
            Ok(receipt)
        })();
        // Host supervision serializes new generations; cancellation does not
        // require taking the locked loaded inference host.
        if let Ok(mut active) = self.active.lock() {
            if active.as_ref().is_some_and(|a| a.request_id == host_call_id
                && Arc::ptr_eq(&a.scope, &scope.incarnation)) {
                *active = None;
            }
        }
        if let Err(ref error) = result {
            sequence += 1;
            let _ = emit(Self::stream_event(
                host_call_id, sequence,
                proto::nvp_stream_frame::Event::Stopped(proto::NvpStreamStopped {
                    code: error.code().into(),
                    cancelled: *error == NvpBridgeError::Cancelled,
                }),
            ));
        }
        result
    }

    /// A cancellation request only matches the exact Rust host-issued scope
    /// and active generation. It cannot select an arbitrary Lu conversation.
    /// The host may still cancel after it revoked the corresponding scope.
    pub fn cancel_request(
        &self, scope: &NvpHostScope, host_call_id: &str,
    ) -> Result<(), NvpBridgeError> {
        let active = self.active.lock().map_err(|_| NvpBridgeError::Busy)?;
        match active.as_ref() {
            Some(r) if r.request_id == host_call_id
                && Arc::ptr_eq(&r.scope, &scope.incarnation) => {
                r.cancellation.cancel();
                // Do not wait for the engine lock. The supervisor's separate
                // reservation/cancellation path targets only NVP's generation.
                self.inference.cancel_active();
                Ok(())
            }
            _ => Err(NvpBridgeError::Denied),
        }
    }

    /// Read-only host reconciliation hint: a write receipt is not inferred
    /// from a stored draft alone, and incomplete effects are NOT replayed.
    pub fn effect_state(&self, host_call_id: &str) -> Result<Option<EffectState>, NvpBridgeError> {
        self.journal.get(host_call_id)
            .map(|x| x.map(|r| r.state))
            .map_err(|_| NvpBridgeError::Journal)
    }

    /// Trusted shutdown/restart only, after all workers from the previous host
    /// process have stopped. Never run this on a live host instance.
    pub fn trusted_reconcile_interrupted(&self) -> Result<usize, NvpBridgeError> {
        self.journal.reconcile_interrupted()
            .map_err(|_| NvpBridgeError::Journal)
    }
}
