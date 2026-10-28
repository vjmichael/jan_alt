//! P3 trusted Tauri adapter for Lu-owned inference.
//! Default packaging intentionally fails closed: to enable, a trusted release
//! build must embed LU_TRUSTED_LLAMA_SERVER_SHA256 and bundle the matching CPU
//! llama-server.exe in resources/lu-inference. The WebView cannot choose an
//! executable, hash, GGUF path, resource limit, or projector.
#[cfg(feature = "lu-foundation")]
mod enabled {
    use lu_core::{
        inference_bridge::BridgeError,
        inference_wire::decode_frame,
        wire::proto,
        inference_host::EnginePhase,
        inference_supervisor::TrustedInferenceSupervisor,
        model_admission::ModelAdmissionManager,
        persistent_llama_backend::{PersistentEngineConfig, PersistentLlamaBackend},
    };
    use rand::RngCore;
    use serde::Serialize;
    use std::{
        fs,
        num::NonZeroUsize,
        path::{Path, PathBuf},
        sync::Arc,
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
                },
                Err(reason) => Self {
                    supervisor: None,
                    models: Vec::new(),
                    reason: Some(reason),
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
            Some(proto::inference_event::Kind::State(state)) =>
                ("state", serde_json::json!({"phase": state.phase, "backendId": state.backend_id, "modelRef": state.model_ref})),
            Some(proto::inference_event::Kind::TextChunk(chunk)) =>
                ("text", serde_json::json!({"text": chunk.text, "chunkIndex": chunk.chunk_index})),
            Some(proto::inference_event::Kind::Finished(done)) =>
                ("finished", serde_json::json!({"cancelled": done.cancelled, "generatedBytes": done.generated_bytes, "outputPieces": done.output_pieces})),
            Some(proto::inference_event::Kind::Failure(failure)) =>
                ("failure", serde_json::json!({"code": failure.code, "retryable": failure.retryable})),
            Some(proto::inference_event::Kind::ResourceUsage(usage)) =>
                ("resource", serde_json::json!({"residentBytes": usage.resident_bytes, "generationMillis": usage.generation_millis})),
            None => return Err("Lu inference event has no kind".into()),
        };
        window.emit(WEB_EVENT, serde_json::json!({
            "requestId": frame.request_id,
            "sessionId": event.session_id,
            "generationId": event.generation_id,
            "sequence": event.sequence,
            "kind": kind,
            "data": payload,
        })).map_err(generic_error)
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
                    window.emit(EVENT, &frame).map_err(|_| BridgeError::Consumer)?;
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
