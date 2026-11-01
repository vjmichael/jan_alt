//! Independent Lu desktop host. No Jan commands, plugins or route handlers.
//! WebView receives opaque model/image/session IDs only. All disk selection is
//! from native OS dialogs; only host code can resolve the signed engine package.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use lu_core::{
    inference_bridge::BridgeError,
    inference_supervisor::TrustedInferenceSupervisor,
    inference_wire::decode_frame,
    mmproj_admission::admit_projector,
    model_admission::ModelAdmissionManager,
    model_import::{import_selected_gguf, import_selected_projector},
    multimodal_saved_turn::{admit_data_url, PinnedImage, MAX_TOTAL_IMAGE_BYTES},
    persistent_llama_backend::{PersistentEngineConfig, PersistentLlamaBackend},
    projector_identity::projector_filename_for_model,
    wire::proto,
};
use rand::{rngs::OsRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    num::NonZeroUsize,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

const ENGINE_SHA256: &str = "36155bc14f8eb02224105377c946528ccac91337d715386a77d6187cb98105b4";
const ENGINE_FILES: [(&str, &str, u64); 4] = [
    ("llama-server.exe", ENGINE_SHA256, 55_099_904),
    (
        "msvcp140.dll",
        "0f885b509a685d2bbfa652fed26b5fb31d88fbdab0a978c641d1c7b8aa460aa9",
        557_728,
    ),
    (
        "vcruntime140.dll",
        "d5e4d9a3e835fa679450145d6a7d94e36573a509317111904d9b3712c30d9066",
        124_544,
    ),
    (
        "vcruntime140_1.dll",
        "1f2d41c4aa5db0bc33ebf7b66d72943a817d7ce6cbe880502a9403823633093f",
        49_792,
    ),
];
const MAX_CHAT_LOG_BYTES: u64 = 32 * 1024 * 1024;
const MAX_CATALOG_BYTES: u64 = 64 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredModel {
    model_ref: String,
    filename: String,
    projector_attached: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ModelView {
    model_ref: String,
    filename: String,
    projector_attached: bool,
}
impl From<&StoredModel> for ModelView {
    fn from(v: &StoredModel) -> Self {
        Self {
            model_ref: v.model_ref.clone(),
            filename: v.filename.clone(),
            projector_attached: v.projector_attached,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeView {
    model_ref: Option<String>,
    session_id: Option<String>,
    generation_id: Option<String>,
    phase: String,
    pid: Option<u32>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageView {
    image_ref: String,
    mime_type: String,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChatEvent {
    generation_id: String,
    text: String,
    index: u32,
}

struct DesktopState {
    models_dir: PathBuf,
    catalog_path: PathBuf,
    chat_path: PathBuf,
    catalog: Mutex<Vec<StoredModel>>,
    images: Mutex<HashMap<String, PinnedImage>>,
    supervisor: Arc<TrustedInferenceSupervisor<PersistentLlamaBackend>>,
}

fn next_id(prefix: &str) -> String {
    let mut random = [0u8; 16];
    OsRng.fill_bytes(&mut random);
    let mut s = prefix.to_owned();
    for byte in random {
        s.push_str(&format!("{byte:02x}"));
    }
    s
}
fn decode_sha(raw: &str) -> Result<[u8; 32], String> {
    if raw.len() != 64 {
        return Err("invalid pinned engine SHA-256 length".into());
    }
    let mut bytes = [0; 32];
    for (i, b) in bytes.iter_mut().enumerate() {
        *b = u8::from_str_radix(&raw[i * 2..i * 2 + 2], 16)
            .map_err(|_| "invalid pinned engine SHA-256")?;
    }
    Ok(bytes)
}
fn check_file(path: &Path, sha: &str, bytes: u64) -> Result<(), String> {
    let meta = fs::symlink_metadata(path).map_err(|_| "required Lu engine file missing")?;
    if !meta.file_type().is_file() || meta.len() != bytes {
        return Err(format!(
            "invalid bundled engine component: {}",
            path.display()
        ));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if meta.file_attributes() & 0x400 != 0 {
            return Err("engine component is a reparse point".into());
        }
    }
    let mut f = File::open(path).map_err(|e| e.to_string())?;
    let mut h = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    loop {
        let n = f.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        h.update(&buf[..n]);
    }
    if h.finalize().as_slice() != decode_sha(sha)? {
        return Err("Lu engine component hash mismatch".into());
    }
    Ok(())
}

fn checked_catalog(path: &Path) -> Result<Vec<StoredModel>, String> {
    let Ok(meta) = fs::metadata(path) else {
        return Ok(Vec::new());
    };
    if meta.len() > MAX_CATALOG_BYTES {
        return Err("model catalog exceeds limit".into());
    }
    let data = fs::read(path).map_err(|e| e.to_string())?;
    let models: Vec<StoredModel> = serde_json::from_slice(&data).map_err(|e| e.to_string())?;
    if models.len() > 64 {
        return Err("too many registered models".into());
    }
    let mut refs = HashSet::new();
    let mut filenames = HashSet::new();
    for model in &models {
        projector_filename_for_model(&model.model_ref)
            .map_err(|_| "invalid stored model identity")?;
        let name = Path::new(&model.filename);
        if model.filename.len() > 200
            || name.file_name().and_then(|n| n.to_str()) != Some(&model.filename)
            || model.filename.contains(['/', '\\', ':'])
            || !model.filename.to_ascii_lowercase().ends_with(".gguf")
            || !refs.insert(model.model_ref.clone())
            || !filenames.insert(model.filename.clone())
        {
            return Err("invalid or duplicate model catalog entry".into());
        }
    }
    Ok(models)
}
fn persist_catalog(path: &Path, records: &[StoredModel]) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(records).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_CATALOG_BYTES {
        return Err("catalog too large".into());
    }
    let temp = path.with_file_name(format!(".model-index-{}.tmp", next_id("")));
    let mut f = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp)
        .map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        f.write_all(&bytes).map_err(|e| e.to_string())?;
        f.sync_all().map_err(|e| e.to_string())?;
        drop(f);
        fs::rename(&temp, path).map_err(|e| e.to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temp);
    }
    result
}
fn append_chat(path: &Path, role: &str, content: &str) -> Result<(), String> {
    if content.len() > 2 * 1024 * 1024 {
        return Err("chat event exceeds limit".into());
    }
    if fs::metadata(path).map(|m| m.len()).unwrap_or(0) > MAX_CHAT_LOG_BYTES {
        return Err("chat history size cap reached".into());
    }
    let mut line = serde_json::to_vec(&serde_json::json!({"role":role, "text":content}))
        .map_err(|e| e.to_string())?;
    line.push(b'\n');
    let mut file = OpenOptions::new()
        .append(true)
        .create(true)
        .open(path)
        .map_err(|e| e.to_string())?;
    file.write_all(&line).map_err(|e| e.to_string())?;
    file.sync_data().map_err(|e| e.to_string())
}

impl DesktopState {
    fn new(app: &AppHandle) -> Result<Self, String> {
        let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
        fs::create_dir_all(&root).map_err(|e| e.to_string())?;
        let models_dir = root.join("lu-models");
        fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;
        let engine_dir = app
            .path()
            .resource_dir()
            .map_err(|e| e.to_string())?
            .join("lu-inference");
        for (name, sha, bytes) in ENGINE_FILES {
            check_file(&engine_dir.join(name), sha, bytes)?;
        }
        let executable = engine_dir.join("llama-server.exe");
        let catalog_path = root.join("model-index.json");
        let models = checked_catalog(&catalog_path)?;
        let mut admitted_models = Vec::new();
        let mut projectors = Vec::new();
        for record in &models {
            let mut admission = ModelAdmissionManager::new();
            admission
                .admit(&models_dir, &record.filename)
                .map_err(|e| format!("model admission failed: {e:?}"))?;
            admitted_models.push((
                record.model_ref.clone(),
                admission.current().unwrap().clone(),
            ));
            if record.projector_attached {
                let filename = projector_filename_for_model(&record.model_ref)
                    .map_err(|e| format!("invalid projector ID: {e:?}"))?;
                let projector = admit_projector(&models_dir, &filename)
                    .map_err(|e| format!("projector admission failed: {e:?}"))?;
                projectors.push((record.model_ref.clone(), projector));
            }
        }
        let supervisor = TrustedInferenceSupervisor::new(
            "llama-vulkan".into(),
            4096,
            admitted_models,
            move || {
                let mut raw = [0u8; 32];
                OsRng.fill_bytes(&mut raw);
                let key = raw.iter().map(|b| format!("{b:02x}")).collect::<String>();
                PersistentLlamaBackend::new(PersistentEngineConfig {
                    executable: executable.clone(),
                    expected_sha256: decode_sha(ENGINE_SHA256)?,
                    threads: NonZeroUsize::new(4).unwrap(),
                    context_tokens: 4096,
                    startup_timeout: Duration::from_secs(180),
                    request_timeout: Duration::from_secs(180),
                    api_key: key,
                })
            },
        )
        .map_err(|e| format!("supervisor init: {e:?}"))?;
        for (model_ref, projector) in projectors {
            supervisor
                .attach_projector(&model_ref, projector)
                .map_err(|e| format!("saved projector binding: {e:?}"))?;
        }
        Ok(Self {
            models_dir,
            catalog_path,
            chat_path: root.join("chats.jsonl"),
            catalog: Mutex::new(models),
            images: Mutex::new(HashMap::new()),
            supervisor: Arc::new(supervisor),
        })
    }
}

#[tauri::command]
fn lu_status(state: State<'_, Arc<DesktopState>>) -> Result<RuntimeView, String> {
    let s = state.supervisor.status().map_err(|e| format!("{e:?}"))?;
    Ok(RuntimeView {
        session_id: s.session_id,
        model_ref: s.model_ref,
        generation_id: s.generation_id,
        phase: format!("{:?}", s.phase),
        pid: s.pid,
    })
}
#[tauri::command]
fn lu_list_models(state: State<'_, Arc<DesktopState>>) -> Result<Vec<ModelView>, String> {
    let models = state.catalog.lock().map_err(|_| "catalog poisoned")?;
    Ok(models.iter().map(ModelView::from).collect())
}

fn native_pick_gguf(app: &AppHandle) -> Result<Option<PathBuf>, String> {
    let file = app
        .dialog()
        .file()
        .add_filter("GGUF models", &["gguf"])
        .blocking_pick_file();
    file.map(|p| p.into_path().map_err(|e| e.to_string()))
        .transpose()
}
#[tauri::command]
async fn lu_import_model(
    app: AppHandle,
    state: State<'_, Arc<DesktopState>>,
) -> Result<Option<ModelView>, String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let Some(source) = native_pick_gguf(&app)? else {
            return Ok(None);
        };
        let imported = import_selected_gguf(&state.models_dir, &source)
            .map_err(|e| format!("GGUF import: {e:?}"))?;
        let mut catalog = state.catalog.lock().map_err(|_| "catalog poisoned")?;
        let mut admission = ModelAdmissionManager::new();
        admission
            .admit(&state.models_dir, &imported.filename)
            .map_err(|e| format!("model admission: {e:?}"))?;
        let record = StoredModel {
            model_ref: next_id("m-"),
            filename: imported.filename,
            projector_attached: false,
        };
        state
            .supervisor
            .register_model(
                record.model_ref.clone(),
                admission.current().unwrap().clone(),
            )
            .map_err(|e| format!("model registration: {e:?}"))?;
        let mut after = catalog.clone();
        after.push(record.clone());
        persist_catalog(&state.catalog_path, &after)?;
        *catalog = after;
        Ok(Some(ModelView::from(&record)))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn lu_attach_projector(
    app: AppHandle,
    state: State<'_, Arc<DesktopState>>,
    model_ref: String,
) -> Result<Option<ModelView>, String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let Some(source) = native_pick_gguf(&app)? else {
            return Ok(None);
        };
        let mut catalog = state.catalog.lock().map_err(|_| "catalog poisoned")?;
        let index = catalog
            .iter()
            .position(|m| m.model_ref == model_ref && !m.projector_attached)
            .ok_or("model unavailable or already paired")?;
        import_selected_projector(&state.models_dir, &source, &model_ref)
            .map_err(|e| format!("projector import: {e:?}"))?;
        let filename = projector_filename_for_model(&model_ref).map_err(|e| format!("{e:?}"))?;
        let projector = admit_projector(&state.models_dir, &filename)
            .map_err(|e| format!("projector admission: {e:?}"))?;
        state
            .supervisor
            .attach_projector(&model_ref, projector)
            .map_err(|e| format!("projector binding: {e:?}"))?;
        let mut after = catalog.clone();
        after[index].projector_attached = true;
        persist_catalog(&state.catalog_path, &after)?;
        *catalog = after;
        Ok(Some(ModelView::from(&catalog[index])))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn lu_pick_image(
    app: AppHandle,
    state: State<'_, Arc<DesktopState>>,
) -> Result<Option<ImageView>, String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let file = app
            .dialog()
            .file()
            .add_filter("Image", &["png", "jpg", "jpeg"])
            .blocking_pick_file();
        let Some(file) = file else { return Ok(None) };
        let path = file.into_path().map_err(|e| e.to_string())?;
        let mut f = File::open(path).map_err(|e| e.to_string())?;
        let size = f.metadata().map_err(|e| e.to_string())?.len();
        if size == 0 || size > 8 * 1024 * 1024 {
            return Err("unsupported image size".into());
        }
        let mut bytes = Vec::with_capacity(size as usize);
        (&mut f)
            .take(8 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
            "image/png"
        } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
            "image/jpeg"
        } else {
            return Err("unsupported image format".into());
        };
        let pinned = admit_data_url(&format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
            .map_err(|e| format!("image admission: {e:?}"))?;
        let mut images = state.images.lock().map_err(|_| "image registry poisoned")?;
        if images.len() >= 4 && !images.contains_key(&pinned.image_ref) {
            return Err("four image limit".into());
        }
        let total = images.values().map(|i| i.bytes.len()).sum::<usize>();
        if !images.contains_key(&pinned.image_ref)
            && total + pinned.bytes.len() > MAX_TOTAL_IMAGE_BYTES
        {
            return Err("total image size limit".into());
        }
        let view = ImageView {
            image_ref: pinned.image_ref.clone(),
            mime_type: mime.into(),
        };
        images.insert(pinned.image_ref.clone(), pinned);
        Ok(Some(view))
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn lu_load_model(
    state: State<'_, Arc<DesktopState>>,
    model_ref: String,
) -> Result<String, String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let catalog = state.catalog.lock().map_err(|_| "catalog poisoned")?;
        if !catalog.iter().any(|m| m.model_ref == model_ref) {
            return Err("unknown model".into());
        }
        drop(catalog);
        let session_id = next_id("s-");
        state
            .supervisor
            .load(&model_ref, session_id.clone(), &next_id("req-"))
            .map_err(|e| format!("model load failed: {e:?}"))?;
        Ok(session_id)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn lu_unload_model(
    state: State<'_, Arc<DesktopState>>,
    session_id: String,
) -> Result<(), String> {
    let state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        state
            .supervisor
            .unload(&session_id, &next_id("req-"))
            .map_err(|e| format!("unload: {e:?}"))?;
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn lu_cancel(
    state: State<'_, Arc<DesktopState>>,
    session_id: String,
    generation_id: String,
) -> Result<(), String> {
    state
        .supervisor
        .cancel(&session_id, &generation_id, &next_id("req-"))
        .map_err(|e| format!("cancel: {e:?}"))
}
#[tauri::command]
async fn lu_generate(
    app: AppHandle,
    state: State<'_, Arc<DesktopState>>,
    session_id: String,
    prompt: String,
    image_refs: Vec<String>,
    max_new_tokens: u32,
) -> Result<String, String> {
    let state = Arc::clone(state.inner());
    // Never accept image bytes or paths from the WebView. Only the native
    // picker can create a pinned image and its opaque content-derived ID.
    let images: Vec<PinnedImage> = {
        let registered = state.images.lock().map_err(|_| "image registry poisoned")?;
        let mut resolved = Vec::new();
        let mut seen = HashSet::new();
        for id in &image_refs {
            if !seen.insert(id) {
                return Err("duplicate image reference".into());
            }
            resolved.push(registered.get(id).ok_or("unknown image reference")?.clone());
        }
        resolved
    };
    if prompt.trim().is_empty()
        || prompt.len() > 16 * 1024
        || max_new_tokens == 0
        || max_new_tokens > 4096
    {
        return Err("invalid generation limits".into());
    }
    let generation_id = next_id("g-");
    let request_id = next_id("req-");
    let supervisor = Arc::clone(&state.supervisor);
    // A failed disk write must not leave a reservation permanently active.
    append_chat(&state.chat_path, "user", &prompt)?;
    if images.is_empty() {
        supervisor
            .reserve_generation(
                &session_id,
                &generation_id,
                &request_id,
                &prompt,
                max_new_tokens,
            )
            .map_err(|e| format!("reserve: {e:?}"))?;
    } else {
        supervisor
            .reserve_generation_images(
                &session_id,
                &generation_id,
                &request_id,
                &prompt,
                max_new_tokens,
                &images,
            )
            .map_err(|e| format!("reserve images: {e:?}"))?;
    }
    // UI event emission is best-effort and must not strand a reserved turn.
    let _ = app.emit("lu-generation-start", &generation_id);
    let sid = session_id.clone();
    let gid = generation_id.clone();
    let rid = request_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut answer = String::new();
        let emit = |wire: Vec<u8>| -> Result<(), BridgeError> {
            let frame = decode_frame(&wire).map_err(BridgeError::Wire)?;
            if let Some(proto::inference_frame::Body::Event(event)) = frame.body {
                if let Some(proto::inference_event::Kind::TextChunk(chunk)) = event.kind {
                    answer.push_str(&chunk.text);
                    app.emit(
                        "lu-token",
                        ChatEvent {
                            generation_id: gid.clone(),
                            text: chunk.text,
                            index: chunk.chunk_index,
                        },
                    )
                    .map_err(|_| BridgeError::WrongOperation)?;
                }
            }
            Ok(())
        };
        let result = if images.is_empty() {
            supervisor.run_reserved(&sid, &gid, &rid, prompt, max_new_tokens, emit)
        } else {
            supervisor.run_reserved_images(&sid, &gid, &rid, prompt, max_new_tokens, images, emit)
        };
        result.map_err(|e| format!("generation: {e:?}"))?;
        append_chat(&state.chat_path, "assistant", &answer)?;
        Ok(answer)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
fn lu_history(state: State<'_, Arc<DesktopState>>) -> Result<Vec<serde_json::Value>, String> {
    let Ok(meta) = fs::metadata(&state.chat_path) else {
        return Ok(Vec::new());
    };
    if meta.len() > MAX_CHAT_LOG_BYTES {
        return Err("history too large".into());
    }
    let content = fs::read_to_string(&state.chat_path).map_err(|e| e.to_string())?;
    content
        .lines()
        .map(|line| serde_json::from_str(line).map_err(|e| e.to_string()))
        .collect()
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let state = DesktopState::new(app.handle()).map_err(std::io::Error::other)?;
            app.manage(Arc::new(state));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            lu_status,
            lu_list_models,
            lu_import_model,
            lu_attach_projector,
            lu_pick_image,
            lu_load_model,
            lu_unload_model,
            lu_cancel,
            lu_generate,
            lu_history
        ])
        .run(tauri::generate_context!())
        .expect("Lu native desktop failed");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_untrusted_model_catalog() {
        let dir = std::env::temp_dir().join(next_id("lu-catalog-test-"));
        fs::create_dir_all(&dir).unwrap();
        let catalog = dir.join("catalog.json");
        fs::write(
            &catalog,
            r#"[{"model_ref":"../../x","filename":"good.gguf","projector_attached":false}]"#,
        )
        .unwrap();
        assert!(checked_catalog(&catalog).is_err());
        fs::write(&catalog, r#"[{"model_ref":"m-00112233445566778899aabbccddeeff","filename":"../escape.gguf","projector_attached":false}]"#).unwrap();
        assert!(checked_catalog(&catalog).is_err());
        fs::remove_dir_all(dir).unwrap();
    }
    #[test]
    fn decodes_pinned_engine_digest() {
        assert_eq!(decode_sha(ENGINE_SHA256).unwrap().len(), 32);
        assert!(decode_sha("bad").is_err());
    }
}
