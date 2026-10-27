//! Desktop consent surface for host-issued signed CE permission requests.
//!
//! The webview can enumerate, deny or *request review* of a pending prompt.
//! It cannot create a prompt, assert an approval, choose a publisher key,
//! choose a filesystem root, or mint an authorization. A Yes from a separate
//! native OS dialog is consumed once by the existing Rust CeApprovalGate.
//!
//! No CE model/Tauri install or launch command is exposed by this module.
#[cfg(feature = "lu-foundation")]
mod enabled {
    use std::{
        collections::BTreeMap,
        fs,
        io::{BufRead, BufReader},
        path::{Path, PathBuf},
        sync::{Arc, Mutex},
        time::{Duration, Instant},
    };

    use lu_core::{
        CeApprovalGate, CeApprovalPrompt, CeGrantRequest, CePermissionStore,
        TrustedCeApprovalSource, TrustedUserTurnVerifier, VerifiedCePackage,
    };
    use serde::Serialize;
    use tauri::{Emitter, Manager, State, WebviewWindow};

    const MAX_PENDING: usize = 8;
    const PROMPT_TIMEOUT: Duration = Duration::from_secs(120);
    const EVENT: &str = "lu-ce-consent-pending";

    /// Safe-to-display projection. The backend never accepts this as an input
    /// to an approval. Always render from the host-owned immutable prompt.
    #[derive(Debug, Clone, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ConsentView {
        request_id: String,
        conversation_id: String,
        user_turn_id: String,
        profile_id: String,
        scope_id: String,
        package_id: String,
        publisher: String,
        signing_key_id: String,
        artifact_digest: String,
        tool_id: String,
        effect: String,
        expires_at: i64,
    }

    struct Pending {
        prompt: CeApprovalPrompt,
        package: VerifiedCePackage,
        grant: CeGrantRequest,
        permissions: CePermissionStore,
        inserted: Instant,
    }

    /// The real Jan desktop user-turn verifier reads the host-selected thread
    /// and messages files; it does not accept a role string from a CE, webview,
    /// model, or prompted text. SQLite mobile history is out of scope.
    pub struct PersistedJanTurnVerifier {
        data_folder: PathBuf,
    }
    impl PersistedJanTurnVerifier {
        pub fn new(data_folder: PathBuf) -> Self {
            Self { data_folder }
        }

        fn verify(&self, thread_id: &str, turn_id: &str) -> bool {
            let Ok(parsed) = uuid::Uuid::parse_str(thread_id) else {
                return false;
            };
            if parsed.to_string() != thread_id || turn_id.is_empty() || turn_id.len() > 128 {
                return false;
            }
            let root = crate::core::threads::utils::get_data_dir(&self.data_folder);
            let Ok(root) = root.canonicalize() else { return false; };
            let thread = root.join(thread_id);
            if thread.canonicalize().ok().as_deref() != Some(thread.as_path())
                || thread.parent() != Some(root.as_path())
            {
                return false;
            }
            let meta = thread.join("thread.json");
            let messages = crate::core::threads::utils::get_messages_path(&self.data_folder, thread_id);
            for path in [&meta, &messages] {
                let Ok(stat) = fs::symlink_metadata(path) else { return false; };
                if !stat.is_file() || stat.file_type().is_symlink()
                    || path.canonicalize().ok().as_deref().and_then(Path::parent) != Some(thread.as_path())
                {
                    return false;
                }
            }
            let Ok(meta) = fs::read(&meta) else { return false; };
            if meta.len() > 64 * 1024 {
                return false;
            }
            let Ok(meta) = serde_json::from_slice::<serde_json::Value>(&meta) else { return false; };
            if meta.get("id").and_then(|v|v.as_str()) != Some(thread_id) {
                return false;
            }
            let Ok(file) = fs::File::open(messages) else { return false; };
            if file.metadata().map(|m|m.len()>32*1024*1024).unwrap_or(true) {
                return false;
            }
            let mut matches = 0;
            let mut count = 0;
            for line in BufReader::new(file).lines() {
                count += 1;
                if count > 8192 { return false; }
                let Ok(line) = line else { return false; };
                if line.len() > 128 * 1024 { return false; }
                let Ok(value) = serde_json::from_str::<serde_json::Value>(&line) else { return false; };
                if value.get("id").and_then(|v|v.as_str()) == Some(turn_id) {
                    if value.get("role").and_then(|v|v.as_str()) != Some("user")
                        || value.get("thread_id").and_then(|v|v.as_str()).is_some_and(|id| id != thread_id)
                    {
                        return false;
                    }
                    matches += 1;
                }
            }
            matches == 1
        }
    }

    impl TrustedUserTurnVerifier for PersistedJanTurnVerifier {
        fn verify_user_turn(&self, conversation_id: &str, user_turn_id: &str) -> bool {
            self.verify(conversation_id, user_turn_id)
        }
    }

    fn projection(request_id: String, prompt: &CeApprovalPrompt) -> ConsentView {
        ConsentView {
            request_id,
            conversation_id: prompt.conversation_id.clone(),
            user_turn_id: prompt.user_turn_id.clone(),
            profile_id: prompt.profile_id.clone(),
            scope_id: prompt.scope_id.clone(),
            package_id: prompt.package_id.clone(),
            publisher: prompt.publisher.clone(),
            signing_key_id: prompt.signer_key_id.clone(),
            artifact_digest: prompt.artifact_digest.clone(),
            tool_id: prompt.tool_id.clone(),
            effect: format!("{:?}", prompt.effect),
            expires_at: prompt.expires_at,
        }
    }

    struct NativeOneUseDecision {
        confirmed: Mutex<Option<CeApprovalPrompt>>,
    }
    impl NativeOneUseDecision {
        fn granted(prompt: CeApprovalPrompt) -> Self {
            Self { confirmed: Mutex::new(Some(prompt)) }
        }
    }
    impl TrustedCeApprovalSource for NativeOneUseDecision {
        fn consume_exact_confirmation(&self, prompt: &CeApprovalPrompt) -> bool {
            self.confirmed.lock().ok().and_then(|mut current| current.take())
                .is_some_and(|expected| &expected == prompt)
        }
    }

    pub struct LuCeConsentState {
        pending: Mutex<BTreeMap<String, Pending>>,
        verifier: PersistedJanTurnVerifier,
    }

    impl LuCeConsentState {
        pub fn new(data_folder: PathBuf) -> Self {
            Self {
                pending: Mutex::new(BTreeMap::new()),
                verifier: PersistedJanTurnVerifier::new(data_folder),
            }
        }

        /// TRUSTED RUST HOST ONLY. The executable CE loader must have already
        /// verified the signed package using the SAME persisted trust/grant
        /// store the resource broker will use. This API is NOT a Tauri command.
        /// A model cannot request a popup merely by invoking tools.
        pub fn enqueue_host_verified(
            &self,
            app: &tauri::AppHandle,
            conversation_id: &str,
            package: VerifiedCePackage,
            grant: CeGrantRequest,
            permissions: CePermissionStore,
        ) -> Result<String, String> {
            if !self.verifier.verify_user_turn(conversation_id, &grant.approved_user_turn_id)
                || !package.manifest().tools.contains(&grant.tool_id)
            {
                return Err("unverified user turn or package tool".into());
            }
            // The grant store will independently recheck signer identity and
            // cryptographic digest before committing any approval.
            let prompt = CeApprovalPrompt {
                conversation_id: conversation_id.into(),
                user_turn_id: grant.approved_user_turn_id.clone(),
                profile_id: grant.profile_id.clone(),
                scope_id: grant.scope_id.clone(),
                package_id: package.manifest().id.clone(),
                artifact_digest: package.artifact_sha256().into(),
                signer_key_id: package.key_id().into(),
                publisher: package.manifest().publisher.clone(),
                tool_id: grant.tool_id.clone(),
                effect: grant.effect,
                expires_at: grant.expires_at,
            };
            let id = uuid::Uuid::new_v4().to_string();
            let view = projection(id.clone(), &prompt);
            let mut pending = self.pending.lock().map_err(|_| "consent state unavailable")?;
            pending.retain(|_, item| item.inserted.elapsed() < PROMPT_TIMEOUT);
            if pending.len() >= MAX_PENDING {
                return Err("too many pending CE consent prompts".into());
            }
            pending.insert(id.clone(), Pending {
                prompt, package, grant, permissions, inserted: Instant::now(),
            });
            drop(pending);
            if app.emit(EVENT, &view).is_err() {
                self.dismiss(&id)?;
                return Err("desktop consent UI unavailable".into());
            }
            Ok(id)
        }

        fn views(&self) -> Result<Vec<ConsentView>, String> {
            let mut pending = self.pending.lock().map_err(|_| "consent state unavailable")?;
            pending.retain(|_, item| item.inserted.elapsed() < PROMPT_TIMEOUT);
            Ok(pending.iter().map(|(id, item)|projection(id.clone(), &item.prompt)).collect())
        }

        fn dismiss(&self, id: &str) -> Result<bool, String> {
            Ok(self.pending.lock().map_err(|_|"consent state unavailable")?.remove(id).is_some())
        }

        fn take(&self, id: &str) -> Result<Pending, String> {
            let mut pending = self.pending.lock().map_err(|_| "consent state unavailable")?;
            let item = pending.remove(id).ok_or("CE approval request already consumed or unknown")?;
            if item.inserted.elapsed() >= PROMPT_TIMEOUT {
                return Err("CE approval request expired".into());
            }
            Ok(item)
        }

        fn finalize(&self, pending: &Pending, confirmed: bool) -> Result<bool, String> {
            if !confirmed { return Ok(false); }
            let decision = NativeOneUseDecision::granted(pending.prompt.clone());
            CeApprovalGate {
                permissions: &pending.permissions,
                turns: &self.verifier,
                confirmations: &decision,
            }.approve_confirmed(
                &pending.prompt.conversation_id, &pending.package, &pending.grant
            ).map_err(|e| format!("CE approval denied by host: {e:?}"))?;
            Ok(true)
        }
    }

    fn main_window_only(window: &WebviewWindow) -> Result<(), String> {
        if window.label() != "main" {
            return Err("only the main desktop window can review CE consent".into());
        }
        Ok(())
    }

    pub async fn pending(window: WebviewWindow, state: State<'_, LuCeConsentState>)
        -> Result<Vec<ConsentView>, String> {
        main_window_only(&window)?;
        state.views()
    }

    pub async fn deny(request_id: String, window: WebviewWindow, state: State<'_, LuCeConsentState>)
        -> Result<bool, String> {
        main_window_only(&window)?;
        state.dismiss(&request_id)
    }

    pub async fn review(request_id: String, window: WebviewWindow, state: State<'_, LuCeConsentState>)
        -> Result<bool, String> {
        main_window_only(&window)?;
        // Consume before spawning a modal: no duplicate popups, replay, or
        // race involving a second tab/window can approve the same grant.
        let pending = state.take(&request_id)?;
        let description = format!(
            "Publisher: {}\nExtension: {}\nSigner: {}\nPackage SHA-256: {}\n\nTool: {}\nEffect: {:?}\nScope: {}\nConversation: {}\nExpires (Unix): {}\n\nAllow this exact Core Extension permission?",
            pending.prompt.publisher, pending.prompt.package_id,
            pending.prompt.signer_key_id, pending.prompt.artifact_digest,
            pending.prompt.tool_id, pending.prompt.effect,
            pending.prompt.scope_id, pending.prompt.conversation_id,
            pending.prompt.expires_at,
        );
        let confirmed = tauri::async_runtime::spawn_blocking(move || {
            rfd::MessageDialog::new()
                .set_title("Lu — Core Extension permission")
                .set_description(description)
                .set_buttons(rfd::MessageButtons::YesNo)
                .set_level(rfd::MessageLevel::Warning)
                .show() == rfd::MessageDialogResult::Yes
        }).await.map_err(|_| "native permission dialog unavailable")?;
        state.finalize(&pending, confirmed)
    }
}

#[cfg(feature = "lu-foundation")]
pub use enabled::LuCeConsentState;

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_ce_consent_pending(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, LuCeConsentState>,
) -> Result<Vec<serde_json::Value>, String> {
    let entries = enabled::pending(window, state).await?;
    entries.into_iter().map(|view| serde_json::to_value(view)
        .map_err(|e|e.to_string())).collect()
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_ce_consent_deny(
    request_id: String,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, LuCeConsentState>,
) -> Result<bool, String> {
    enabled::deny(request_id, window, state).await
}

#[cfg(feature = "lu-foundation")]
#[tauri::command]
pub async fn lu_ce_consent_review(
    request_id: String,
    window: tauri::WebviewWindow,
    state: tauri::State<'_, LuCeConsentState>,
) -> Result<bool, String> {
    enabled::review(request_id, window, state).await
}

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_ce_consent_pending() -> Vec<serde_json::Value> { vec![] }

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_ce_consent_deny(request_id: String) -> Result<bool, String> {
    let _ = request_id;
    Err("Core Extension consent is disabled in this build".into())
}

#[cfg(not(feature = "lu-foundation"))]
#[tauri::command]
pub async fn lu_ce_consent_review(request_id: String) -> Result<bool, String> {
    let _ = request_id;
    Err("Core Extension consent is disabled in this build".into())
}
