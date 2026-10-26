//! Feature-gated Lu native tools exposed to the Jan desktop via Tauri IPC.
//!
//! This desktop adapter owns no agent loop. Cowork remains unchanged.
//! A model may only read its own Jan-created thread scratch directory;
//! the webview cannot grant new filesystem roots or privileged capabilities.

#[cfg(feature = "lu-foundation")]
mod enabled {
    use std::{collections::BTreeSet, path::PathBuf};

    use lu_core::{
        native_files::register_bundled_file_tools,
        policy::{CapabilityGrant, PolicyEngine},
        model::ModelToolCatalog, NativeToolRegistry, ToolEffect,
    };
    use serde_json::Value;
    use tauri::State;

    const READ: &str = "lu_files_read_text";
    const LIST: &str = "lu_files_list_directory";

    struct Session {
        registry: NativeToolRegistry,
        catalog: ModelToolCatalog,
        policy: PolicyEngine,
    }

    pub struct LuDesktopState {
        data_folder: PathBuf,
    }

    impl LuDesktopState {
        pub fn new(data_folder: PathBuf) -> Self {
            Self { data_folder }
        }

        // No permanently cached Dir handle: Windows must be able to delete a
        // closed thread's scratch workspace without waiting for Lu shutdown.
        fn session(&self, thread_id: &str) -> Result<Session, String> {

            // Reuse Jan's existing checked per-thread workspace namespace,
            // not a user-selected path supplied by JavaScript or a model.
            let workspace = tauri_plugin_agent_tools::workspace::thread_workspace(
                &self.data_folder, thread_id
            )?;
            let parent = tauri_plugin_agent_tools::workspace::threads_dir(&self.data_folder);
            std::fs::create_dir_all(&parent)
                .map_err(|e| format!("cannot create Lu workspace parent: {e}"))?;
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
            let canonical_parent = parent.canonicalize()
                .map_err(|e| format!("cannot resolve workspace parent: {e}"))?;
            let canonical_workspace = workspace.canonicalize()
                .map_err(|e| format!("cannot resolve thread root: {e}"))?;
            if canonical_workspace.parent() != Some(canonical_parent.as_path()) {
                return Err("Lu thread root escaped its sandbox namespace".into());
            }

            let registry = NativeToolRegistry::new();
            let catalog = register_bundled_file_tools(&registry, &canonical_workspace)
                .map_err(|e| format!("native tool registration failed: {e:?}"))?;
            let policy = PolicyEngine::new();
            // The only implicit host-owned grants cover read-only files
            // inside this ephemeral per-thread sandbox. They grant NO
            // access to the wider user's disk, network, code or devices.
            for tool_id in ["lu.files.read_text", "lu.files.list_directory"] {
                policy.grant(CapabilityGrant {
                    tool_id: tool_id.into(),
                    scope_id: thread_id.into(),
                    effect: ToolEffect::ReadWorkspace,
                    expires_at: None,
                }).map_err(|e| format!("cannot grant thread scratch read: {e:?}"))?;
            }
            Ok(Session { registry, catalog, policy })
        }
    }

    fn allowed() -> BTreeSet<String> {
        BTreeSet::from([READ.to_string(), LIST.to_string()])
    }

    /// Models see only the narrowly scoped bundled tools. This adapter
    /// explicitly does not advertise any other registry entries or MCP tools.
    pub async fn lu_native_tool_catalog(
        thread_id: String,
        state: State<'_, LuDesktopState>,
    ) -> Result<Vec<Value>, String> {
        let session = state.session(&thread_id)?;
        session.catalog.schemas(&allowed())
            .map_err(|e| format!("Lu tool catalog error: {e:?}"))
    }

    pub async fn lu_native_tool_execute(
        thread_id: String,
        tool_name: String,
        call_id: String,
        arguments_json: String,
        state: State<'_, LuDesktopState>,
    ) -> Result<Value, String> {
        let session = state.session(&thread_id)?;
        let allowed = allowed();
        let invocation = session.catalog.encode_call(
            &allowed, &tool_name, &call_id, Some(&thread_id), &arguments_json
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
        state: State<'_, LuDesktopState>,
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
#[tauri::command]
pub async fn lu_native_tool_catalog(
    thread_id: String,
    state: tauri::State<'_, LuDesktopState>,
) -> Result<Vec<serde_json::Value>, String> {
    enabled::lu_native_tool_catalog(thread_id, state).await
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_native_tool_execute(
    thread_id: String,
    tool_name: String,
    call_id: String,
    arguments_json: String,
    state: tauri::State<'_, LuDesktopState>,
) -> Result<serde_json::Value, String> {
    enabled::lu_native_tool_execute(
        thread_id, tool_name, call_id, arguments_json, state,
    ).await
}

// Default Jan builds ship with this feature disabled; the commands safely
// advertise nothing and reject calls until Lu is explicitly built in.
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_native_tool_catalog(thread_id: String) -> Result<Vec<serde_json::Value>, String> {
    let _ = thread_id;
    Ok(Vec::new())
}

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_native_tool_execute(
    thread_id: String,
    tool_name: String,
    call_id: String,
    arguments_json: String,
) -> Result<serde_json::Value, String> {
    let _ = (thread_id, tool_name, call_id, arguments_json);
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
    enabled::lu_memory_inspect(thread_id, query, after_id, entry_id, state).await
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
