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
    #[tauri::command]
    pub async fn lu_native_tool_catalog(
        thread_id: String,
        state: State<'_, LuDesktopState>,
    ) -> Result<Vec<Value>, String> {
        let session = state.session(&thread_id)?;
        session.catalog.schemas(&allowed())
            .map_err(|e| format!("Lu tool catalog error: {e:?}"))
    }

    #[tauri::command]
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
}

#[cfg(feature = "lu-foundation")]
pub use enabled::{lu_native_tool_catalog, lu_native_tool_execute, LuDesktopState};

// Default Jan builds ship with this feature disabled; the commands safely
// advertise nothing and reject calls until Lu is explicitly built in.
#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_native_tool_catalog(_thread_id: String) -> Result<Vec<serde_json::Value>, String> {
    Ok(Vec::new())
}

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_native_tool_execute(
    _thread_id: String,
    _tool_name: String,
    _call_id: String,
    _arguments_json: String,
) -> Result<serde_json::Value, String> {
    Err("Lu native tool runtime is not enabled in this build".into())
}
