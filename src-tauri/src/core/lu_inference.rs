//! P3 trusted Tauri adapter for Lu-owned inference.
//! Default packaging intentionally fails closed: to enable, a trusted release
//! build must embed LU_TRUSTED_LLAMA_SERVER_SHA256 and bundle the matching CPU
//! llama-server.exe in resources/lu-inference. The WebView cannot choose an
//! executable, hash, GGUF path, resource limit, or projector.
#[cfg(feature = "lu-foundation")]
mod enabled {
    use lu_core::{
        agent_tool_loop::NativeToolTurn,
        contracts::ToolEffect,
        conversation_authority::{
            AuthorizedCapability, BoundCallOrigin, ConversationAuthority, TaskAuthority,
            TrustedUserTurnVerifier,
        },
        inference_bridge::BridgeError,
        inference_host::{Cancellation, EnginePhase},
        inference_supervisor::TrustedInferenceSupervisor,
        inference_wire::decode_frame,
        model_admission::ModelAdmissionManager,
        journal::EffectJournal,
        model_turn_journal::ModelTurnJournal,
        persistent_llama_backend::{PersistentEngineConfig, PersistentLlamaBackend},
        supervised_tool_generation::{
            run_supervised_native_turn_with_effects, NativeTurnServices, SupervisorModelStep,
        },
        wire::proto,
    };
    use rand::RngCore;
    use serde::Serialize;
    use sha2::{Digest, Sha256};
    use std::collections::{BTreeMap, BTreeSet};
    use std::{
        fs,
        num::NonZeroUsize,
        path::{Path, PathBuf},
        sync::{Arc, Mutex},
        time::Duration,
    };
    use tauri::{Emitter, Manager, State, WebviewWindow};

    const EVENT: &str = "lu-inference-proto";
    const ERROR_EVENT: &str = "lu-inference-error";
    const WEB_EVENT: &str = "lu-inference-event";
    const CONTEXT_TOKENS: u32 = 4096;
    const BACKEND_ID: &str = "llama-cpu";

    type Host = TrustedInferenceSupervisor<PersistentLlamaBackend>;

    #[derive(Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ModelChoice {
        id: String,
        name: String,
    }

    /// Installed resources and a separate Lu-only model directory are
    /// inspected by the trusted host, never selected by model tool calls.
    pub struct LuInferenceDesktopState {
        supervisor: Option<Arc<Host>>,
        models: Vec<ModelChoice>,
        reason: Option<String>,
        // One read-only native conversation turn at a time per loaded engine.
        // The host owns cancellation flags; no model-visible ID is a grant.
        native_turns: Arc<Mutex<BTreeMap<String, (String, Cancellation)>>>,
    }

    /// A main-window request must pass Lu's durable USER-role verification
    /// in read_only_turn_context before opening this read-only scratch task.
    /// Broader filesystem capabilities remain unavailable.
    struct VerifiedDesktopAction {
        conversation_id: String,
        user_turn_id: String,
    }
    impl TrustedUserTurnVerifier for VerifiedDesktopAction {
        fn verify_user_turn(&self, conversation_id: &str, user_turn_id: &str) -> bool {
            conversation_id == self.conversation_id && user_turn_id == self.user_turn_id
        }
    }

    fn decode_checksum(value: &str) -> Result<[u8; 32], String> {
        if value.len() != 64 {
            return Err("missing trusted engine SHA-256".into());
        }
        let mut bytes = [0u8; 32];
        for (i, byte) in bytes.iter_mut().enumerate() {
            *byte = u8::from_str_radix(&value[2 * i..2 * i + 2], 16)
                .map_err(|_| "invalid bundled engine checksum")?;
        }
        if bytes.iter().all(|b| *b == 0) {
            return Err("invalid engine digest".into());
        }
        Ok(bytes)
    }

    /// The manifest itself is pinned by the compiled Lu host. Verify every
    /// staged executable/DLL and refuse unknown package files or links.
    fn verify_package(
        root: &Path,
        expected_manifest: [u8; 32],
        expected_exe: [u8; 32],
    ) -> Result<(), String> {
        let manifest = root.join("manifest.json");
        if !fs::symlink_metadata(&manifest)
            .map_err(|_| "Lu manifest missing")?
            .file_type()
            .is_file()
        {
            return Err("Lu manifest must be a regular file".into());
        }
        let bytes = fs::read(&manifest).map_err(|_| "cannot read Lu engine manifest")?;
        if bytes.len() > 64 * 1024 || Sha256::digest(&bytes).as_slice() != expected_manifest {
            return Err("Lu engine package manifest checksum mismatch".into());
        }
        let parsed: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| "malformed Lu engine manifest")?;
        if parsed["schema"] != "lu-inference-package-v1"
            || parsed["upstreamCommit"] != "7fe450e19305b828c199d602c23a8337aaa1f03b"
            || parsed["architecture"] != "x86_64-pc-windows-msvc"
        {
            return Err("unsupported Lu engine package provenance".into());
        }
        let entries = parsed["files"]
            .as_array()
            .ok_or("missing Lu engine files")?;
        if entries.is_empty() || entries.len() > 48 {
            return Err("invalid Lu engine package size".into());
        }
        let mut seen = BTreeSet::new();
        for entry in entries {
            let name = entry["name"]
                .as_str()
                .ok_or("invalid Lu engine file name")?;
            if !(name == "llama-server.exe"
                || (name.ends_with(".dll")
                    && name
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_' | b'.'))))
            {
                return Err("unexpected Lu engine package filename".into());
            }
            if !seen.insert(name.to_owned()) {
                return Err("duplicated Lu engine file".into());
            }
            let path = root.join(name);
            if !fs::symlink_metadata(&path)
                .map_err(|_| "missing Lu engine component")?
                .file_type()
                .is_file()
                || path.canonicalize().map_err(|_| "Lu file invalid")?.parent()
                    != Some(
                        root.canonicalize()
                            .map_err(|_| "Lu engine root invalid")?
                            .as_path(),
                    )
            {
                return Err("Lu package contains redirected or nonregular file".into());
            }
            let expected =
                decode_checksum(entry["sha256"].as_str().ok_or("missing component digest")?)?;
            let file = fs::read(&path).map_err(|_| "cannot read Lu engine component")?;
            if Sha256::digest(file).as_slice() != expected {
                return Err("Lu engine package component checksum mismatch".into());
            }
            if name == "llama-server.exe" && expected != expected_exe {
                return Err("Lu engine checksum differs from trusted host identity".into());
            }
        }
        if !seen.contains("llama-server.exe") {
            return Err("Lu engine executable absent".into());
        }
        let mut actual = BTreeSet::new();
        for child in fs::read_dir(root).map_err(|_| "cannot enumerate Lu engine directory")? {
            let child = child.map_err(|_| "cannot inspect Lu package file")?;
            let name = child.file_name().to_string_lossy().to_string();
            if name != "manifest.json" {
                actual.insert(name);
            }
        }
        if seen != actual {
            return Err("unmanifested files in Lu inference package".into());
        }
        Ok(())
    }

    fn checked_models_root(data_folder: &Path) -> Result<PathBuf, String> {
        // This root is host-established and separate from Jan conversations.
        let canonical_data = data_folder
            .canonicalize()
            .map_err(|_| "Lu data folder unavailable".to_string())?;
        let root = canonical_data.join("lu-models");
        match fs::create_dir(&root) {
            Ok(()) => {}
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err("cannot create Lu model directory".into()),
        }
        let kind = fs::symlink_metadata(&root)
            .map_err(|_| "cannot inspect Lu model directory".to_string())?;
        if !kind.file_type().is_dir() {
            return Err("Lu model root must be an ordinary directory".into());
        }
        let canonical = root
            .canonicalize()
            .map_err(|_| "invalid Lu model directory")?;
        if canonical.parent() != Some(canonical_data.as_path()) {
            return Err("Lu model directory escaped application data".into());
        }
        Ok(canonical)
    }

    fn approved_models(
        root: &Path,
    ) -> Result<
        (
            Vec<ModelChoice>,
            Vec<(String, lu_core::model_admission::AdmittedModel)>,
        ),
        String,
    > {
        let mut names = Vec::new();
        for entry in fs::read_dir(root).map_err(|_| "cannot inspect Lu models")? {
            let entry = entry.map_err(|_| "Lu model directory read failed")?;
            let name = entry.file_name();
            let Some(name) = name.to_str() else { continue };
            if !name.to_ascii_lowercase().ends_with(".gguf")
                || name.to_ascii_lowercase().starts_with("mmproj")
            {
                continue;
            }
            names.push(name.to_owned());
        }
        names.sort();
        if names.len() > 64 {
            return Err("too many GGUF models in Lu model directory".into());
        }
        let mut choices = Vec::new();
        let mut catalog = Vec::new();
        for name in names {
            let mut admission = ModelAdmissionManager::new();
            if let Ok(model) = admission.admit(root, &name) {
                let id = format!("m-{}", uuid::Uuid::new_v4().simple());
                choices.push(ModelChoice {
                    id: id.clone(),
                    name,
                });
                catalog.push((id, model.clone()));
            }
        }
        Ok((choices, catalog))
    }

    impl LuInferenceDesktopState {
        pub fn new<R: tauri::Runtime>(app: &tauri::AppHandle<R>, data_folder: PathBuf) -> Self {
            match Self::initialize(app, &data_folder) {
                Ok((supervisor, models)) => Self {
                    supervisor: Some(Arc::new(supervisor)),
                    models,
                    reason: None,
                    native_turns: Arc::new(Mutex::new(BTreeMap::new())),
                },
                Err(reason) => Self {
                    supervisor: None,
                    models: Vec::new(),
                    reason: Some(reason),
                    native_turns: Arc::new(Mutex::new(BTreeMap::new())),
                },
            }
        }

        fn initialize<R: tauri::Runtime>(
            app: &tauri::AppHandle<R>,
            data_folder: &Path,
        ) -> Result<(Host, Vec<ModelChoice>), String> {
            // Compile-time package provenance: never trust WebView or an
            // editable per-user manifest for the engine identity.
            let checksum = option_env!("LU_TRUSTED_LLAMA_SERVER_SHA256")
                .ok_or("Lu inference package is not enabled in this build")?;
            let expected_sha256 = decode_checksum(checksum)?;
            let trusted_package = option_env!("LU_TRUSTED_LLAMA_PACKAGE_SHA256")
                .ok_or("Lu complete engine package identity is not embedded")?;
            let expected_package = decode_checksum(trusted_package)?;
            let resource_dir = app
                .path()
                .resource_dir()
                .map_err(|_| "Lu resources unavailable")?;
            let engine_dir = resource_dir.join("lu-inference");
            if !fs::symlink_metadata(&engine_dir)
                .map_err(|_| "bundled Lu engine directory missing")?
                .file_type()
                .is_dir()
            {
                return Err("bundled Lu engine directory must be ordinary".into());
            }
            let executable = engine_dir.join("llama-server.exe");
            if !fs::symlink_metadata(&executable)
                .map_err(|_| "bundled llama.cpp engine missing")?
                .file_type()
                .is_file()
            {
                return Err("bundled Lu engine must be an ordinary file".into());
            }
            let canonical_engine = engine_dir
                .canonicalize()
                .map_err(|_| "Lu engine directory invalid")?;
            if executable
                .canonicalize()
                .map_err(|_| "Lu engine invalid")?
                .parent()
                != Some(canonical_engine.as_path())
            {
                return Err("Lu engine escaped its package".into());
            }
            verify_package(&canonical_engine, expected_package, expected_sha256)?;
            let model_root = checked_models_root(data_folder)?;
            let (choices, models) = approved_models(&model_root)?;
            if models.is_empty() {
                return Err("No admitted text GGUF models in Lu model directory".into());
            }
            let threads = NonZeroUsize::new(
                std::thread::available_parallelism()
                    .map_or(2, |count| count.get())
                    .min(8),
            )
            .expect("positive CPU thread count");
            let supervisor = TrustedInferenceSupervisor::new(
                BACKEND_ID.into(),
                CONTEXT_TOKENS,
                models,
                move || {
                    let mut entropy = [0u8; 32];
                    rand::rngs::OsRng.fill_bytes(&mut entropy);
                    let api_key = entropy.iter().map(|b| format!("{b:02x}")).collect();
                    PersistentLlamaBackend::new(PersistentEngineConfig {
                        executable: executable.clone(),
                        expected_sha256,
                        threads,
                        context_tokens: CONTEXT_TOKENS,
                        startup_timeout: Duration::from_secs(180),
                        request_timeout: Duration::from_secs(300),
                        api_key,
                    })
                },
            )
            .map_err(|_| "Lu supervisor initialization failed")?;
            Ok((supervisor, choices))
        }

        fn supervisor(&self) -> Result<Arc<Host>, String> {
            self.supervisor.as_ref().cloned().ok_or_else(|| {
                self.reason
                    .clone()
                    .unwrap_or_else(|| "Lu inference unavailable".into())
            })
        }
    }

    fn require_primary_window(window: &WebviewWindow) -> Result<(), String> {
        // Workspaces/secondary windows receive no inference authority by
        // default. The main Lu WebView is the sole initial desktop principal.
        if window.label() == "main" {
            Ok(())
        } else {
            Err("Lu inference is restricted to the primary desktop window".into())
        }
    }
    // WebView JSON is a boundary projection only. Lu internally continues
    // using canonical, validated Protobuf frames for every inference event.
    fn emit_webview_event(window: &WebviewWindow, wire: &[u8]) -> Result<(), String> {
        let frame = decode_frame(wire).map_err(generic_error)?;
        let Some(proto::inference_frame::Body::Event(event)) = frame.body else {
            return Err("Lu inference returned a non-event frame".into());
        };
        let (kind, payload) = match event.kind {
            Some(proto::inference_event::Kind::State(state)) => (
                "state",
                serde_json::json!({"phase": state.phase, "backendId": state.backend_id, "modelRef": state.model_ref}),
            ),
            Some(proto::inference_event::Kind::TextChunk(chunk)) => (
                "text",
                serde_json::json!({"text": chunk.text, "chunkIndex": chunk.chunk_index}),
            ),
            Some(proto::inference_event::Kind::Finished(done)) => (
                "finished",
                serde_json::json!({"cancelled": done.cancelled, "generatedBytes": done.generated_bytes, "outputPieces": done.output_pieces}),
            ),
            Some(proto::inference_event::Kind::Failure(failure)) => (
                "failure",
                serde_json::json!({"code": failure.code, "retryable": failure.retryable}),
            ),
            Some(proto::inference_event::Kind::ResourceUsage(usage)) => (
                "resource",
                serde_json::json!({"residentBytes": usage.resident_bytes, "generationMillis": usage.generation_millis}),
            ),
            None => return Err("Lu inference event has no kind".into()),
        };
        window
            .emit(
                WEB_EVENT,
                serde_json::json!({
                    "requestId": frame.request_id,
                    "sessionId": event.session_id,
                    "generationId": event.generation_id,
                    "sequence": event.sequence,
                    "kind": kind,
                    "data": payload,
                }),
            )
            .map_err(generic_error)
    }

    fn request_id() -> String {
        format!("r-{}", uuid::Uuid::new_v4().simple())
    }
    fn generic_error(err: impl std::fmt::Debug) -> String {
        // Avoid disclosing raw paths, prompts, engine diagnostics or secrets.
        let _ = err;
        "Lu native inference operation was rejected or failed".into()
    }

    pub async fn models(
        state: State<'_, LuInferenceDesktopState>,
        window: WebviewWindow,
    ) -> Result<serde_json::Value, String> {
        require_primary_window(&window)?;
        Ok(serde_json::json!({
            "available": state.supervisor.is_some(),
            "reason": state.reason.as_deref(),
            "models": &state.models,
            "backendId": BACKEND_ID,
            "contextTokens": CONTEXT_TOKENS,
        }))
    }

    pub async fn status(
        state: State<'_, LuInferenceDesktopState>,
        window: WebviewWindow,
    ) -> Result<serde_json::Value, String> {
        require_primary_window(&window)?;
        let snapshot = state.supervisor()?.status().map_err(generic_error)?;
        Ok(serde_json::json!({
            "sessionId": snapshot.session_id,
            "modelRef": snapshot.model_ref,
            "generationId": snapshot.generation_id,
            "phase": format!("{:?}", snapshot.phase),
            "pid": snapshot.pid,
        }))
    }

    pub async fn load(
        model_ref: String,
        state: State<'_, LuInferenceDesktopState>,
        window: WebviewWindow,
    ) -> Result<serde_json::Value, String> {
        require_primary_window(&window)?;
        let supervisor = state.supervisor()?;
        let session_id = format!("s-{}", uuid::Uuid::new_v4().simple());
        let id = request_id();
        let model = model_ref.clone();
        let session = session_id.clone();
        let wire =
            tauri::async_runtime::spawn_blocking(move || supervisor.load(&model, session, &id))
                .await
                .map_err(generic_error)?
                .map_err(generic_error)?;
        window.emit(EVENT, &wire).map_err(generic_error)?;
        emit_webview_event(&window, &wire)?;
        Ok(serde_json::json!({ "sessionId": session_id, "modelRef": model_ref }))
    }

    pub async fn generate(
        session_id: String,
        prompt: String,
        max_new_tokens: u32,
        state: State<'_, LuInferenceDesktopState>,
        window: WebviewWindow,
    ) -> Result<serde_json::Value, String> {
        require_primary_window(&window)?;
        let supervisor = state.supervisor()?;
        // Validate the public boundary before returning an accepted job ID.
        if prompt.trim().is_empty()
            || prompt.len() > 2 * 1024 * 1024
            || !(1..=32768).contains(&max_new_tokens)
        {
            return Err("invalid Lu inference request limits".into());
        }
        let snapshot = supervisor.status().map_err(generic_error)?;
        if snapshot.session_id.as_deref() != Some(session_id.as_str())
            || snapshot.phase != EnginePhase::Ready
        {
            return Err("Lu inference session is not ready".into());
        }
        let generation_id = format!("g-{}", uuid::Uuid::new_v4().simple());
        let request = request_id();
        // Reserve synchronously before acknowledging the job. Cancel/unload
        // cannot race a scheduled worker and treat the model as idle.
        supervisor
            .reserve_generation(
                &session_id,
                &generation_id,
                &request,
                &prompt,
                max_new_tokens,
            )
            .map_err(generic_error)?;
        let generation = generation_id.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let result = supervisor.run_reserved(
                &session_id,
                &generation,
                &request,
                prompt,
                max_new_tokens,
                |frame| {
                    window
                        .emit(EVENT, &frame)
                        .map_err(|_| BridgeError::Consumer)?;
                    emit_webview_event(&window, &frame).map_err(|_| BridgeError::Consumer)
                },
            );
            if result.is_err() {
                let _ = window.emit(
                    ERROR_EVENT,
                    serde_json::json!({
                        "generationId": generation, "code": "GENERATION_FAILED",
                    }),
                );
            }
        });
        Ok(serde_json::json!({ "generationId": generation_id }))
    }

    /// Host-owned bridge from Lu desktop chat into the already-tested
    /// GGUF -> JSON boundary -> native Protobuf dispatcher -> model loop.
    /// Only the main window and a validated persisted conversation may use it.
    pub async fn native_turn(
        session_id: String,
        thread_id: String,
        user_turn_id: String,
        turn_id: String,
        state: State<'_, LuInferenceDesktopState>,
        tools: State<'_, crate::core::lu::LuDesktopState>,
        window: WebviewWindow,
    ) -> Result<serde_json::Value, String> {
        require_primary_window(&window)?;
        if uuid::Uuid::parse_str(&turn_id).is_err() || turn_id.len() > 48 {
            return Err("invalid Lu native chat turn".into());
        }
        let supervisor = state.supervisor()?;
        let status = supervisor.status().map_err(generic_error)?;
        if status.session_id.as_deref() != Some(session_id.as_str())
            || status.phase != EnginePhase::Ready
        {
            return Err("Lu model session is not ready for a native turn".into());
        }
        // This call checks canonical conversation metadata and prepares a
        // confined, read-only tool registry with no user-selected filesystem root.
        let context = tools.read_only_turn_context(&thread_id, &user_turn_id)?;
        let cancellation = Cancellation::default();
        let active = Arc::clone(&state.native_turns);
        {
            let mut running = active.lock().map_err(generic_error)?;
            if !running.is_empty() || running.contains_key(&turn_id) {
                return Err("Lu already has an active native tool turn".into());
            }
            running.insert(turn_id.clone(), (session_id.clone(), cancellation.clone()));
        }
        let for_cleanup = turn_id.clone();
        let outcome = tauri::async_runtime::spawn_blocking(move || {
            tauri::async_runtime::block_on(async move {
                let nonce = format!("native-{}", uuid::Uuid::new_v4().simple());
                // USER role and message ID were attested from saved JSONL
                // before any authority record was created.
                let task_id = format!("task-{}", uuid::Uuid::new_v4().simple());
                let origin = BoundCallOrigin {
                    conversation_id: thread_id.clone(),
                    user_turn_id: user_turn_id.clone(),
                    task_id: task_id.clone(),
                };
                let authority = ConversationAuthority::new();
                let verifier = VerifiedDesktopAction {
                    conversation_id: thread_id,
                    user_turn_id,
                };
                authority
                    .open_user_task(
                        TaskAuthority {
                            conversation_id: origin.conversation_id.clone(),
                            user_turn_id: origin.user_turn_id.clone(),
                            task_id,
                            execution_scope_id: context.scope_id.clone(),
                            capabilities: [
                                "lu.files.read_text",
                                "lu.files.list_directory",
                                "lu.inspect.stat",
                                "lu.inspect.search_text",
                            ]
                            .into_iter()
                            .map(|id| AuthorizedCapability {
                                tool_id: id.into(),
                                effect: ToolEffect::ReadWorkspace,
                            })
                            .collect(),
                            expires_at: None,
                        },
                        &verifier,
                    )
                    .map_err(generic_error)?;
                let allowed = crate::core::lu::readonly_names();
                let mut turn = NativeToolTurn::new(
                    &context.catalog,
                    &authority,
                    origin,
                    context.scope_id,
                    &allowed,
                )
                .map_err(generic_error)?;
                let journal =
                    ModelTurnJournal::open(&context.journal_path).map_err(generic_error)?;
                let effects = EffectJournal::open(&context.effects_path).map_err(generic_error)?;
                // Existing EXECUTING effects stay replay-blocked. Automatic
                // reconciliation requires exclusive process/profile ownership;
                // never reclassify another live process's in-flight call.
                let mut model = SupervisorModelStep::new(&supervisor, session_id, nonce)
                    .map_err(generic_error)?;
                let report = run_supervised_native_turn_with_effects(
                    &context.trusted_prompt,
                    &mut turn,
                    &mut model,
                    &NativeTurnServices {
                        catalog: &context.catalog,
                        registry: &context.registry,
                        authority: &authority,
                        host_policy: &context.policy,
                    },
                    &cancellation,
                    &journal,
                    &effects,
                )
                .await
                .map_err(generic_error)?;
                Ok::<_, String>(serde_json::json!({
                    "answer": report.answer,
                    "toolCalls": report.tool_calls,
                    "modelGenerations": report.model_generations,
                }))
            })
        })
        .await
        .map_err(generic_error);
        if let Ok(mut running) = active.lock() {
            running.remove(&for_cleanup);
        }
        outcome?
    }

    pub async fn cancel_native_turn(
        session_id: String,
        turn_id: String,
        state: State<'_, LuInferenceDesktopState>,
        window: WebviewWindow,
    ) -> Result<serde_json::Value, String> {
        require_primary_window(&window)?;
        let running = state.native_turns.lock().map_err(generic_error)?;
        let Some((active_session, cancellation)) = running.get(&turn_id) else {
            return Ok(serde_json::json!({"signalled": false}));
        };
        if active_session != &session_id {
            return Err("Lu native turn session mismatch".into());
        }
        cancellation.cancel();
        drop(running);
        // Signal the currently active inference generation as well, so a
        // blocked backend does not continue until its full token budget.
        let supervisor = state.supervisor()?;
        if let Ok(status) = supervisor.status() {
            if status.session_id.as_deref() == Some(session_id.as_str()) {
                if let Some(generation_id) = status.generation_id {
                    let _ = supervisor.cancel(&session_id, &generation_id, &request_id());
                }
            }
        }
        Ok(serde_json::json!({"signalled": true}))
    }

    pub async fn cancel(
        session_id: String,
        generation_id: String,
        state: State<'_, LuInferenceDesktopState>,
        window: WebviewWindow,
    ) -> Result<serde_json::Value, String> {
        require_primary_window(&window)?;
        let supervisor = state.supervisor()?;
        supervisor
            .cancel(&session_id, &generation_id, &request_id())
            .map_err(generic_error)?;
        // Acknowledges only the signal. Actual completion arrives via stream.
        Ok(serde_json::json!({ "signalled": true }))
    }

    pub async fn unload(
        session_id: String,
        state: State<'_, LuInferenceDesktopState>,
        window: WebviewWindow,
    ) -> Result<serde_json::Value, String> {
        require_primary_window(&window)?;
        let supervisor = state.supervisor()?;
        let id = request_id();
        let wire =
            tauri::async_runtime::spawn_blocking(move || supervisor.unload(&session_id, &id))
                .await
                .map_err(generic_error)?
                .map_err(generic_error)?;
        window.emit(EVENT, &wire).map_err(generic_error)?;
        emit_webview_event(&window, &wire)?;
        Ok(serde_json::json!({ "unloaded": true }))
    }
}
#[cfg(feature = "lu-foundation")]
pub use enabled::LuInferenceDesktopState;

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_inference_models(
    state: tauri::State<'_, LuInferenceDesktopState>,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    enabled::models(state, window).await
}
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_inference_models() -> Result<serde_json::Value, String> {
    Ok(
        serde_json::json!({"available": false, "models": [], "reason": "Lu inference is not enabled"}),
    )
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_inference_status(
    state: tauri::State<'_, LuInferenceDesktopState>,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    enabled::status(state, window).await
}
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_inference_status() -> Result<serde_json::Value, String> {
    Err("Lu inference is not enabled".into())
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_inference_load(
    model_ref: String,
    state: tauri::State<'_, LuInferenceDesktopState>,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    enabled::load(model_ref, state, window).await
}
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_inference_load(model_ref: String) -> Result<serde_json::Value, String> {
    let _ = model_ref;
    Err("Lu inference is not enabled".into())
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_inference_generate(
    session_id: String,
    prompt: String,
    max_new_tokens: u32,
    state: tauri::State<'_, LuInferenceDesktopState>,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    enabled::generate(session_id, prompt, max_new_tokens, state, window).await
}
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_inference_generate(
    session_id: String,
    prompt: String,
    max_new_tokens: u32,
) -> Result<serde_json::Value, String> {
    let _ = (session_id, prompt, max_new_tokens);
    Err("Lu inference is not enabled".into())
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_inference_native_turn(
    session_id: String,
    thread_id: String,
    user_turn_id: String,
    turn_id: String,
    state: tauri::State<'_, LuInferenceDesktopState>,
    tools: tauri::State<'_, crate::core::lu::LuDesktopState>,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    enabled::native_turn(
        session_id,
        thread_id,
        user_turn_id,
        turn_id,
        state,
        tools,
        window,
    )
    .await
}
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_inference_native_turn(
    session_id: String,
    thread_id: String,
    user_turn_id: String,
    turn_id: String,
) -> Result<serde_json::Value, String> {
    let _ = (session_id, thread_id, user_turn_id, turn_id);
    Err("Lu native tool turns are not enabled".into())
}
#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_inference_native_turn_cancel(
    session_id: String,
    turn_id: String,
    state: tauri::State<'_, LuInferenceDesktopState>,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    enabled::cancel_native_turn(session_id, turn_id, state, window).await
}
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_inference_native_turn_cancel(
    session_id: String,
    turn_id: String,
) -> Result<serde_json::Value, String> {
    let _ = (session_id, turn_id);
    Err("Lu native tool turns are not enabled".into())
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_inference_cancel(
    session_id: String,
    generation_id: String,
    state: tauri::State<'_, LuInferenceDesktopState>,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    enabled::cancel(session_id, generation_id, state, window).await
}
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_inference_cancel(
    session_id: String,
    generation_id: String,
) -> Result<serde_json::Value, String> {
    let _ = (session_id, generation_id);
    Err("Lu inference is not enabled".into())
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_inference_unload(
    session_id: String,
    state: tauri::State<'_, LuInferenceDesktopState>,
    window: tauri::WebviewWindow,
) -> Result<serde_json::Value, String> {
    enabled::unload(session_id, state, window).await
}
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_inference_unload(session_id: String) -> Result<serde_json::Value, String> {
    let _ = session_id;
    Err("Lu inference is not enabled".into())
}
