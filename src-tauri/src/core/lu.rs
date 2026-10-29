//! Feature-gated Lu native tools exposed to the Jan desktop via Tauri IPC.
//!
//! This desktop adapter owns no agent loop. The direct IPC is a Cowork
//! compatibility path; ordinary Lu chat dispatches inside the trusted turn.
//! The webview cannot grant filesystem roots or privileged capabilities.
//! Scope IDs are not yet host-attested; the legacy IPC is limited to the
//! Cowork session namespace. Ordinary chat uses the saved-turn host bridge.

#[path = "lu_cowork_gate.rs"]
mod cowork_gate;

#[cfg(feature = "lu-foundation")]
mod enabled {
    use std::{collections::BTreeSet, path::PathBuf};

    use lu_core::{
        native_files::register_bundled_file_tools,
        native_file_extra::register_inspection_tools,
        policy::{CapabilityGrant, PolicyEngine},
        model::ModelToolCatalog, NativeToolRegistry, ToolEffect,
    };
    use serde_json::Value;
    use tauri::State;
    use super::cowork_gate::legacy_ipc_is_cowork_session;

    const READ: &str = "lu_files_read_text";
    const LIST: &str = "lu_files_list_directory";
    const STAT: &str = "lu_files_stat";
    const SEARCH: &str = "lu_files_search_text";

    struct Session {
        scope_id: String,
        registry: NativeToolRegistry,
        catalog: ModelToolCatalog,
        policy: PolicyEngine,
    }

    pub struct LuDesktopState {
        data_folder: PathBuf,
    }

    /// Host-owned read-only workspace for native GGUF tool turns.
    /// Never expose arbitrary paths or write-capable grants to the webview.
    pub(crate) struct ReadOnlyTurnContext {
        pub scope_id: String,
        pub registry: NativeToolRegistry,
        pub catalog: ModelToolCatalog,
        pub policy: PolicyEngine,
        pub journal_path: PathBuf,
        pub trusted_prompt: String,
    }

    pub(crate) fn readonly_names() -> BTreeSet<String> {
        BTreeSet::from([READ.to_owned(), LIST.to_owned(), STAT.to_owned(), SEARCH.to_owned()])
    }

    impl LuDesktopState {
        pub fn new(data_folder: PathBuf) -> Self {
            Self { data_folder }
        }

        /// The main desktop window may request only a saved USER turn in a
        /// canonical conversation, and only that thread's read-only scratch
        /// capabilities. This is not authorization for the user's other files.
        pub(crate) fn read_only_turn_context(
            &self,
            thread_id: &str,
            user_turn_id: &str,
        ) -> Result<ReadOnlyTurnContext, String> {
            use crate::core::threads::utils::{
                get_data_dir, get_messages_path, get_thread_metadata_path,
            };
            let id = uuid::Uuid::parse_str(thread_id)
                .map_err(|_| "invalid Lu chat conversation ID".to_string())?;
            if id.to_string() != thread_id {
                return Err("noncanonical Lu chat conversation ID".into());
            }
            let threads = get_data_dir(&self.data_folder)
                .canonicalize().map_err(|_| "Lu conversations directory unavailable")?;
            let dir = threads.join(thread_id);
            let resolved = dir.canonicalize().map_err(|_| "Lu conversation not found")?;
            if resolved != dir || resolved.parent() != Some(threads.as_path()) {
                return Err("Lu conversation escaped its directory".into());
            }
            let meta_path = get_thread_metadata_path(&self.data_folder, thread_id);
            let meta = std::fs::symlink_metadata(&meta_path)
                .map_err(|_| "Lu conversation metadata missing")?;
            if !meta.is_file() || meta.file_type().is_symlink() ||
                meta_path.canonicalize().map_err(|_| "Lu metadata unavailable")?
                    .parent() != Some(resolved.as_path()) {
                return Err("Lu conversation metadata path rejected".into());
            }
            let raw: Value = serde_json::from_reader(
                std::fs::File::open(meta_path)
                    .map_err(|_| "Lu conversation metadata unavailable")?,
            ).map_err(|_| "Lu conversation metadata invalid")?;
            if raw.get("id").and_then(Value::as_str) != Some(thread_id) {
                return Err("Lu conversation metadata ID mismatch".into());
            }
            if user_turn_id.is_empty() || user_turn_id.len() > 128
                || user_turn_id.contains('\0') {
                return Err("invalid Lu user message identifier".into());
            }
            // Verify the durable USER role and message identity on disk. The
            // webview cannot mint authorizations by inventing a message ID.
            // Desktop Jan uses JSONL; mobile SQLite is outside this Win64 gate.
            let messages = get_messages_path(&self.data_folder, thread_id);
            let source_meta = std::fs::symlink_metadata(&messages)
                .map_err(|_| "Lu conversation messages unavailable")?;
            if !source_meta.is_file() || source_meta.file_type().is_symlink()
                || source_meta.len() > 64 * 1024 * 1024
                || messages.canonicalize().map_err(|_| "Lu messages path unavailable")?
                    .parent() != Some(resolved.as_path()) {
                return Err("Lu conversation message file rejected".into());
            }
            // Build a canonical prompt from persisted USER and ASSISTANT records.
            // The webview cannot substitute its own prompt or forge prior roles.
            let source = std::fs::File::open(messages)
                .map_err(|_| "Lu conversation messages unavailable")?;
            let trusted_prompt = lu_core::saved_chat_prompt::prompt_from_saved_messages(
                std::io::BufReader::new(source),
                thread_id,
                user_turn_id,
            ).map_err(|e| format!("Lu saved user-turn prompt rejected: {e:?}"))?;

            let session = self.session(thread_id, Some("thread"))?;
            let data_root = self.data_folder.canonicalize()
                .map_err(|_| "Lu profile directory unavailable")?;
            let journal_path = data_root.join("lu-native-model-audit.sqlite3");
            if let Ok(meta) = std::fs::symlink_metadata(&journal_path) {
                if !meta.is_file() || meta.file_type().is_symlink() {
                    return Err("Lu native audit database path rejected".into());
                }
            }
            Ok(ReadOnlyTurnContext {
                scope_id: session.scope_id,
                registry: session.registry,
                catalog: session.catalog,
                policy: session.policy,
                journal_path,
                trusted_prompt,
            })
        }

        // No permanently cached Dir handle: Windows must be able to delete a
        // closed thread's scratch workspace without waiting for Lu shutdown.
        fn session(&self, thread_id: &str, scope: Option<&str>) -> Result<Session, String> {
            // Strictly separate the two existing sandbox namespaces. A scope
            // chooses only a host-defined root, NEVER a model-provided path.
            let (workspace, parent, scope_kind) = match scope.unwrap_or("thread") {
                "thread" => (
                    tauri_plugin_agent_tools::workspace::thread_workspace(&self.data_folder, thread_id)?,
                    tauri_plugin_agent_tools::workspace::threads_dir(&self.data_folder),
                    "thread",
                ),
                "session" => (
                    tauri_plugin_agent_tools::workspace::session_workspace(&self.data_folder, thread_id)?,
                    tauri_plugin_agent_tools::workspace::sessions_dir(&self.data_folder),
                    "session",
                ),
                _ => return Err("unknown Lu native tool scope".into()),
            };
            let scope_id = format!("{scope_kind}:{thread_id}");
            // Refuse redirected ancestors before creating a workspace. A
            // symlinked agent-workspace/sessions parent must not silently
            // redirect read access into another part of the user's disk.
            let store = tauri_plugin_agent_tools::workspace::permanent_store(&self.data_folder);
            for dir in [&store, &parent] {
                match std::fs::symlink_metadata(dir) {
                    Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => {}
                    Ok(_) => return Err("Lu native workspace parent is not an ordinary directory".into()),
                    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
                        std::fs::create_dir(dir)
                            .map_err(|e| format!("cannot create Lu workspace parent: {e}"))?;
                    }
                    Err(err) => return Err(format!("cannot inspect Lu workspace parent: {err}")),
                }
            }
            let canonical_data = self.data_folder.canonicalize()
                .map_err(|e| format!("cannot resolve Lu data folder: {e}"))?;
            let canonical_store = store.canonicalize()
                .map_err(|e| format!("cannot resolve Lu agent store: {e}"))?;
            let canonical_parent = parent.canonicalize()
                .map_err(|e| format!("cannot resolve Lu workspace parent: {e}"))?;
            if canonical_store.parent() != Some(canonical_data.as_path())
                || canonical_parent.parent() != Some(canonical_store.as_path())
            {
                return Err("Lu native workspace parent escaped application data".into());
            }
            if workspace.exists() {
                let meta = std::fs::symlink_metadata(&workspace)
                    .map_err(|e| format!("cannot inspect thread root: {e}"))?;
                if meta.file_type().is_symlink() || !meta.is_dir() {
                    return Err("Lu thread workspace root must be an ordinary directory".into());
                }
            } else {
                std::fs::create_dir(&workspace)
                    .map_err(|e| format!("cannot create Lu thread root: {e}"))?;
            }
            let canonical_workspace = workspace.canonicalize()
                .map_err(|e| format!("cannot resolve thread root: {e}"))?;
            if canonical_workspace.parent() != Some(canonical_parent.as_path()) {
                return Err("Lu thread root escaped its sandbox namespace".into());
            }

            let registry = NativeToolRegistry::new();
            let mut catalog = register_bundled_file_tools(&registry, &canonical_workspace)
                .map_err(|e| format!("native tool registration failed: {e:?}"))?;
            register_inspection_tools(&registry, &mut catalog, &canonical_workspace)?;
            let policy = PolicyEngine::new();
            // The only implicit host-owned grants cover read-only files
            // inside this ephemeral per-thread sandbox. They grant NO
            // access to the wider user's disk, network, code or devices.
            for tool_id in ["lu.files.read_text", "lu.files.list_directory", "lu.inspect.stat", "lu.inspect.search_text"] {
                policy.grant(CapabilityGrant {
                    tool_id: tool_id.into(),
                    scope_id: scope_id.clone(),
                    effect: ToolEffect::ReadWorkspace,
                    expires_at: None,
                }).map_err(|e| format!("cannot grant thread scratch read: {e:?}"))?;
            }
            Ok(Session { scope_id, registry, catalog, policy })
        }
    }

    fn allowed() -> BTreeSet<String> {
        BTreeSet::from([READ.to_string(), LIST.to_string(), STAT.to_string(), SEARCH.to_string()])
    }

    /// Models see only the narrowly scoped bundled tools. This adapter
    /// explicitly does not advertise any other registry entries or MCP tools.
    pub async fn lu_native_tool_catalog(
        thread_id: String,
        scope: Option<String>,
        state: State<'_, LuDesktopState>,
    ) -> Result<Vec<Value>, String> {
        // Ordinary chat must obtain its catalog from the trusted native turn,
        // which verifies a persisted USER message before opening authority.
        // The direct IPC remains only for Cowork compatibility.
        if !legacy_ipc_is_cowork_session(scope.as_deref()) {
            return Ok(Vec::new());
        }
        let session = state.session(&thread_id, scope.as_deref())?;
        session.catalog.schemas(&allowed())
            .map_err(|e| format!("Lu tool catalog error: {e:?}"))
    }

    pub async fn lu_native_tool_execute(
        thread_id: String,
        tool_name: String,
        call_id: String,
        arguments_json: String,
        scope: Option<String>,
        state: State<'_, LuDesktopState>,
    ) -> Result<Value, String> {
        if !legacy_ipc_is_cowork_session(scope.as_deref()) {
            return Err("Lu ordinary chat tools require a saved native turn".into());
        }
        let session = state.session(&thread_id, scope.as_deref())?;
        let allowed = allowed();
        let invocation = session.catalog.encode_call(
            &allowed, &tool_name, &call_id, Some(&session.scope_id), &arguments_json
        ).map_err(|e| format!("Lu rejected model tool call: {e:?}"))?;
        let output = session.registry.dispatch(invocation, &session.policy).await;
        session.catalog.decode_result(&allowed, &tool_name, &output)
            .map_err(|e| format!("Lu could not serialize tool result: {e:?}"))
    }

    /// Read-only memory inspection. The UI may choose a known Jan thread but
    /// cannot choose an arbitrary book path, workspace or SQL expression.
    pub async fn lu_memory_inspect(
        thread_id: String,
        query: Option<String>,
        after_id: Option<i64>,
        entry_id: Option<i64>,
        state: &State<'_, LuDesktopState>,
    ) -> Result<Value, String> {
        use lu_core::ansf::AnsfStore;
        use crate::core::threads::utils::{get_data_dir, get_thread_metadata_path};
        let id = uuid::Uuid::parse_str(&thread_id)
            .map_err(|_| "invalid Jan conversation identifier".to_string())?;
        if id.to_string() != thread_id {
            return Err("noncanonical Jan conversation identifier".into());
        }
        // Never use a catalog search hit or webview-supplied path as a file.
        // Confirm the backing Jan conversation still exists and its metadata
        // matches the ID before exposing any corresponding indexed history.
        let threads = get_data_dir(&state.data_folder).canonicalize()
            .map_err(|_| "Jan thread directory unavailable".to_string())?;
        let dir = threads.join(&thread_id);
        let resolved = dir.canonicalize()
            .map_err(|_| "Jan conversation unavailable".to_string())?;
        if resolved != dir || resolved.parent() != Some(threads.as_path()) {
            return Err("invalid Jan conversation directory".into());
        }
        let meta_path = get_thread_metadata_path(&state.data_folder, &thread_id);
        let metadata = std::fs::symlink_metadata(&meta_path).map_err(|e| e.to_string())?;
        if !metadata.is_file() || metadata.file_type().is_symlink()
            || meta_path.canonicalize().map_err(|e| e.to_string())?.parent() != Some(resolved.as_path())
        {
            return Err("invalid Jan conversation metadata path".into());
        }
        let raw: Value = serde_json::from_reader(
            std::fs::File::open(meta_path).map_err(|e| e.to_string())?
        ).map_err(|_| "invalid Jan conversation metadata".to_string())?;
        if raw.get("id").and_then(Value::as_str) != Some(thread_id.as_str()) {
            return Err("Jan conversation metadata ID mismatch".into());
        }
        let root = state.data_folder.join("lu-memory");
        let books = root.join("books");
        for parent in [&root, &books] {
            let kind = std::fs::symlink_metadata(parent).map_err(|_| "Lu memory is not initialized".to_string())?;
            if !kind.is_dir() || kind.file_type().is_symlink() {
                return Err("invalid Lu memory storage".into());
            }
        }
        let book = books.join(format!("{thread_id}.sqlite"));
        let kind = std::fs::symlink_metadata(&book).map_err(|_| "No indexed memory for this conversation; sync first".to_string())?;
        if !kind.is_file() || kind.file_type().is_symlink() {
            return Err("invalid Lu memory book".into());
        }
        let store = AnsfStore::open(&book).map_err(|e| format!("ANSF open error: {e:?}"))?;
        let chapters = store.chapters(&thread_id).map_err(|e| format!("{e:?}"))?;
        let entries = if let Some(phrase) = query.as_ref().filter(|s| !s.trim().is_empty()) {
            if phrase.len() > 256 { return Err("memory search is too long".into()); }
            // Literal phrase matching; reject FTS operators supplied by UI.
            let literal = format!("\"{}\"", phrase.replace('"', "\"\""));
            store.search(&thread_id, &literal, 30).map_err(|e| format!("{e:?}"))?
        } else {
            store.page_after(&thread_id, after_id.unwrap_or(0), 30).map_err(|e| format!("{e:?}"))?
        };
        let detail = if let Some(selected) = entry_id {
            let entry = store.read_entry(&thread_id, selected).map_err(|e| format!("{e:?}"))?
                .ok_or_else(|| "Archived message not found".to_string())?;
            // Revision links are looked up via the immutable original message identity.
            let original = store.find_message(&thread_id, &entry.message_id)
                .map_err(|e| format!("{e:?}"))?;
            let links = if original.is_some() {
                store.revision_history(&thread_id, &entry.message_id).map_err(|e| format!("{e:?}"))?
            } else { Vec::new() };
            let mut versions = Vec::new();
            if let Some(first) = original {
                versions.push(first);
            }
            for link in &links {
                if let Some(version) = store.read_entry(&thread_id, link.revised_entry_id).map_err(|e| format!("{e:?}"))? {
                    versions.push(version);
                }
            }
            Some(serde_json::json!({
                "selected_entry_id": selected,
                "versions": versions.iter().map(|v| serde_json::json!({
                    "id": v.id, "role": v.role, "content": v.content, "summary": v.summary
                })).collect::<Vec<_>>(),
                "revisions": links.iter().map(|link| serde_json::json!({
                    "revision_number": link.revision_number,
                    "origin": format!("{:?}", link.origin),
                    "observed_at_utc": link.observed_at_utc,
                    "note": link.note
                })).collect::<Vec<_>>()
            }))
        } else { None };
        Ok(serde_json::json!({
            "detail": detail,
            "chapters": chapters.iter().map(|ch| serde_json::json!({
                "id": ch.id, "title": ch.title, "summary": ch.summary,
                "start_entry_id": ch.start_entry_id, "end_entry_id": ch.end_entry_id,
                "closed": ch.closed
            })).collect::<Vec<_>>(),
            "entries": entries.iter().map(|entry| serde_json::json!({
                "id": entry.id, "chapter_id": entry.chapter_id,
                "message_id": entry.message_id, "role": entry.role,
                "summary": entry.summary
            })).collect::<Vec<_>>()
        }))
    }

    /// Explicit desktop-user checkpoint action. No model tool registry entry.
    pub async fn lu_memory_checkpoint(
        thread_id: String,
        source_entry_id: i64,
        completed_work: String,
        next_action: String,
        state: State<'_, LuDesktopState>,
    ) -> Result<Value, String> {
        use lu_core::{AnsfStore, ContinuityStore, TaskCheckpoint};
        // Reuse the existing bounded, Jan-identity-checked read endpoint.
        // This must succeed before reading a source or writing a checkpoint.
        let result = lu_memory_inspect(
            thread_id.clone(), None, Some(0), Some(source_entry_id), &state,
        ).await?;
        let versions = result.get("detail")
            .and_then(|v| v.get("versions")).and_then(Value::as_array)
            .ok_or_else(|| "ANSF source is unavailable".to_string())?;
        if versions.is_empty() {
            return Err("ANSF source is unavailable".into());
        }
        let root = state.data_folder.join("lu-memory");
        let book_path = root.join("books").join(format!("{thread_id}.sqlite"));
        let source = AnsfStore::open(&book_path).map_err(|e| format!("{e:?}"))?;
        let path = root.join("continuity.sqlite");
        if path.exists() {
            let kind = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
            if !kind.is_file() || kind.file_type().is_symlink() {
                return Err("invalid continuity database file".into());
            }
        }
        let checkpoints = ContinuityStore::open(&path).map_err(|e| format!("{e:?}"))?;
        let record = TaskCheckpoint {
            checkpoint_id: uuid::Uuid::new_v4().to_string(),
            project_id: "lu".into(),
            task_id: "memory-worker".into(),
            conversation_id: thread_id,
            source_entry_ids: vec![source_entry_id],
            completed_work,
            next_action,
            blockers: Vec::new(),
        };
        checkpoints.append_verified(&record, &source).map_err(|e| format!("{e:?}"))?;
        Ok(serde_json::json!({"checkpoint_id":record.checkpoint_id}))
    }

    pub async fn lu_memory_checkpoints(
        thread_id: String,
        state: State<'_, LuDesktopState>,
    ) -> Result<Value, String> {
        use lu_core::ContinuityStore;
        lu_memory_inspect(thread_id.clone(), None, Some(0), None, &state).await?;
        let path = state.data_folder.join("lu-memory").join("continuity.sqlite");
        if !path.exists() {
            return Ok(serde_json::json!({"checkpoints":[]}));
        }
        let kind = std::fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        if !kind.is_file() || kind.file_type().is_symlink() {
            return Err("invalid continuity database file".into());
        }
        let store = ContinuityStore::open(&path).map_err(|e| format!("{e:?}"))?;
        let records = store.recent_for_conversation(&thread_id, 20)
            .map_err(|e| format!("{e:?}"))?;
        // A checkpoint is derived context, not an authority. Reject stale or
        // mismatched sources rather than presenting an unverifiable resume.
        let source = lu_core::AnsfStore::open(
            &state.data_folder.join("lu-memory").join("books")
                .join(format!("{thread_id}.sqlite"))
        ).map_err(|e| format!("{e:?}"))?;
        for record in &records {
            for entry_id in &record.source_entry_ids {
                let entry = source.read_entry(&thread_id, *entry_id)
                    .map_err(|e| format!("{e:?}"))?;
                if entry.is_none() {
                    return Err("checkpoint cites a missing ANSF entry".into());
                }
            }
        }
        Ok(serde_json::json!({"checkpoints": records.iter().map(|r| serde_json::json!({
            "checkpoint_id":r.checkpoint_id,
            "source_entry_ids":r.source_entry_ids,
            "completed_work":r.completed_work,
            "next_action":r.next_action
        })).collect::<Vec<_>>()}))
    }

    /// Read-only native engine capability report, using Jan's existing worker.
    /// No user-supplied program path, environment overrides or model execution.
    pub async fn lu_compute_diagnostics(
        app: tauri::AppHandle,
    ) -> Result<Value, String> {
        use lu_core::compute_inventory::collect_compute_inventory;
        let inventory = collect_compute_inventory();
        let engine = tauri_plugin_llamacpp::engine::commands::engine_devices(
            app,
            std::collections::HashMap::new(),
        ).await?;
        Ok(serde_json::json!({
            "os": inventory.os,
            "arch": inventory.arch,
            "logical_threads": inventory.cpu.available_logical_threads,
            "cpu": {
                "sse42": inventory.instructions.x86_sse42,
                "avx2": inventory.instructions.x86_avx2,
                "fma": inventory.instructions.x86_fma,
                "avx512f": inventory.instructions.x86_avx512f,
                "neon": inventory.instructions.arm_neon
            },
            "engine_devices": engine,
            "backend_initialized": false,
            "note": "Jan worker device listing is not a model-load readiness attestation"
        }))
    }

    /// User-initiated local Jan history import; no arbitrary filesystem path
    /// or revision chronology assertion can cross the IPC boundary.
    pub async fn lu_memory_sync(
        thread_id: String,
        state: State<'_, LuDesktopState>,
    ) -> Result<Value, String> {
        use std::{fs::File, io::BufReader};
        use lu_core::{
            ansf::AnsfStore,
            ansf_import::JanImportPolicy,
            ansf_library::{AnsfLibrary, BookIndex},
            ansf_sync::sync_verified_snapshot,
        };
        use crate::core::threads::{
            helpers::get_lock_for_thread,
            utils::{get_data_dir, get_thread_metadata_path, get_messages_path},
        };

        let id = uuid::Uuid::parse_str(&thread_id)
            .map_err(|_| "invalid Jan conversation identifier".to_string())?;
        if id.to_string() != thread_id {
            return Err("noncanonical Jan conversation identifier".into());
        }

        // Exclude concurrent Jan message writers while reading a consistent
        // snapshot. Jan remains the sole authority for its source history.
        let lock = get_lock_for_thread(&thread_id).await;
        let _guard = lock.lock().await;
        let root = get_data_dir(&state.data_folder).canonicalize()
            .map_err(|_| "Jan thread directory unavailable".to_string())?;
        let thread = root.join(&thread_id);
        let resolved = thread.canonicalize()
            .map_err(|_| "Jan thread not found".to_string())?;
        if resolved.parent() != Some(root.as_path()) || resolved != thread {
            return Err("Jan thread path is not a direct ordinary child".into());
        }
        let metadata_path = get_thread_metadata_path(&state.data_folder, &thread_id);
        let messages_path = get_messages_path(&state.data_folder, &thread_id);
        for path in [&metadata_path, &messages_path] {
            let meta = std::fs::symlink_metadata(path)
                .map_err(|_| "Jan source file unavailable".to_string())?;
            if !meta.is_file() || meta.file_type().is_symlink() {
                return Err("Jan source file must be an ordinary file".into());
            }
            if path.canonicalize().map_err(|e| e.to_string())?.parent() != Some(resolved.as_path()) {
                return Err("Jan source file escaped its conversation directory".into());
            }
        }
        let metadata: Value = serde_json::from_reader(
            File::open(&metadata_path).map_err(|e| e.to_string())?
        ).map_err(|_| "invalid Jan conversation metadata".to_string())?;
        if metadata.get("id").and_then(Value::as_str) != Some(thread_id.as_str()) {
            return Err("Jan conversation metadata ID mismatch".into());
        }
        let title = metadata.get("title").and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("Imported Jan conversation")
            .chars().take(256).collect::<String>();

        // This opt-in cache lives in Lu-owned application data, not Jan's
        // thread directory. Reject symlinked cache roots/files rather than
        // permitting an untrusted cache path to redirect SQLite writes.
        let lu_root = state.data_folder.join("lu-memory");
        if lu_root.exists() {
            let kind = std::fs::symlink_metadata(&lu_root).map_err(|e| e.to_string())?;
            if !kind.is_dir() || kind.file_type().is_symlink() {
                return Err("invalid Lu memory root".into());
            }
        } else {
            std::fs::create_dir(&lu_root).map_err(|e| e.to_string())?;
        }
        let books = lu_root.join("books");
        if books.exists() {
            let kind = std::fs::symlink_metadata(&books).map_err(|e| e.to_string())?;
            if !kind.is_dir() || kind.file_type().is_symlink() {
                return Err("invalid Lu books directory".into());
            }
        } else {
            std::fs::create_dir(&books).map_err(|e| e.to_string())?;
        }
        let db = books.join(format!("{thread_id}.sqlite"));
        let catalog_path = lu_root.join("library.sqlite");
        for target in [&db, &catalog_path] {
            if target.exists() {
                let meta = std::fs::symlink_metadata(target).map_err(|e| e.to_string())?;
                if !meta.is_file() || meta.file_type().is_symlink() {
                    return Err("invalid Lu memory database path".into());
                }
            }
        }
        let store = AnsfStore::open(&db).map_err(|e| format!("ANSF open failed: {e:?}"))?;
        // First import initializes one session. Later imports reuse the book.
        store.ensure_session(&thread_id, "lu", &title)
            .map_err(|e| format!("ANSF session identity mismatch: {e:?}"))?;
        let library = AnsfLibrary::open(&catalog_path)
            .map_err(|e| format!("ANSF library open failed: {e:?}"))?;
        let book = BookIndex {
            session_id: thread_id.clone(),
            workspace_id: "lu".into(),
            relative_path: format!("books/{thread_id}.sqlite"),
            title,
            summary: "Imported Jan desktop history".into(),
        };
        let source = File::open(&messages_path).map_err(|e| e.to_string())?;
        let stats = sync_verified_snapshot(
            &store, &library, &book, BufReader::new(source),
            JanImportPolicy::RejectChangedSource,
        ).map_err(|e| format!("Lu memory import needs attention: {e:?}"))?;
        Ok(serde_json::json!({
            "source_lines": stats.source_lines,
            "added": stats.added,
            "unchanged": stats.unchanged,
            "revised": stats.revised,
            "blank_lines": stats.blank_lines
        }))
    }

}

// Tauri's generate_handler macro looks for command metadata in this module.
// Keep the decorated entry points here; the implementation remains private
// and feature-gated in enabled, without exposing permission mutators.
#[cfg(feature = "lu-foundation")]
pub use enabled::LuDesktopState;
#[cfg(feature = "lu-foundation")]
pub(crate) use enabled::readonly_names;

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_native_tool_catalog(
    thread_id: String,
    scope: Option<String>,
    state: tauri::State<'_, LuDesktopState>,
) -> Result<Vec<serde_json::Value>, String> {
    enabled::lu_native_tool_catalog(thread_id, scope, state).await
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_native_tool_execute(
    thread_id: String,
    tool_name: String,
    call_id: String,
    arguments_json: String,
    scope: Option<String>,
    state: tauri::State<'_, LuDesktopState>,
) -> Result<serde_json::Value, String> {
    enabled::lu_native_tool_execute(
        thread_id, tool_name, call_id, arguments_json, scope, state,
    ).await
}

// Default Jan builds ship with this feature disabled; the commands safely
// advertise nothing and reject calls until Lu is explicitly built in.
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_native_tool_catalog(thread_id: String, scope: Option<String>) -> Result<Vec<serde_json::Value>, String> {
    let _ = (thread_id, scope);
    Ok(Vec::new())
}

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_native_tool_execute(
    thread_id: String,
    tool_name: String,
    call_id: String,
    arguments_json: String,
    scope: Option<String>,
) -> Result<serde_json::Value, String> {
    let _ = (thread_id, tool_name, call_id, arguments_json, scope);
    Err("Lu native tool runtime is not enabled in this build".into())
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_memory_sync(
    thread_id: String,
    state: tauri::State<'_, LuDesktopState>,
) -> Result<serde_json::Value, String> {
    enabled::lu_memory_sync(thread_id, state).await
}

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_memory_sync(thread_id: String) -> Result<serde_json::Value, String> {
    let _ = thread_id;
    Err("Lu memory synchronization is not enabled in this build".into())
}

#[tauri::command]
pub async fn lu_memory_available() -> bool {
    cfg!(feature = "lu-foundation")
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_memory_inspect(
    thread_id: String,
    query: Option<String>,
    after_id: Option<i64>,
    entry_id: Option<i64>,
    state: tauri::State<'_, LuDesktopState>,
) -> Result<serde_json::Value, String> {
    enabled::lu_memory_inspect(thread_id, query, after_id, entry_id, &state).await
}

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_memory_inspect(
    thread_id: String,
    query: Option<String>,
    after_id: Option<i64>,
    entry_id: Option<i64>,
) -> Result<serde_json::Value, String> {
    let _ = (thread_id, query, after_id, entry_id);
    Err("Lu memory inspection is not enabled in this build".into())
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_memory_checkpoint(
    thread_id: String,
    source_entry_id: i64,
    completed_work: String,
    next_action: String,
    state: tauri::State<'_, LuDesktopState>,
) -> Result<serde_json::Value, String> {
    enabled::lu_memory_checkpoint(thread_id, source_entry_id, completed_work, next_action, state).await
}

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_memory_checkpoint(
    thread_id: String,
    source_entry_id: i64,
    completed_work: String,
    next_action: String,
) -> Result<serde_json::Value, String> {
    let _ = (thread_id, source_entry_id, completed_work, next_action);
    Err("Lu memory checkpoints are unavailable".into())
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_memory_checkpoints(
    thread_id: String,
    state: tauri::State<'_, LuDesktopState>,
) -> Result<serde_json::Value, String> {
    enabled::lu_memory_checkpoints(thread_id, state).await
}

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_memory_checkpoints(thread_id: String) -> Result<serde_json::Value, String> {
    let _ = thread_id;
    Err("Lu memory checkpoints are unavailable".into())
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_compute_diagnostics(
    app: tauri::AppHandle,
) -> Result<serde_json::Value, String> {
    enabled::lu_compute_diagnostics(app).await
}

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_compute_diagnostics() -> Result<serde_json::Value, String> {
    Err("Lu compute diagnostics are unavailable in this build".into())
}
