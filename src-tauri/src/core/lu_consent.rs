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
        path::{Path, PathBuf},
        sync::Mutex,
        time::{Duration, Instant},
    };

    use crate::core::app::commands::get_jan_data_folder_path;
    use lu_core::{
        CeApprovalGate, CeApprovalPrompt, CeExecutableStager, CeGrantRequest,
        CePermissionStore, PersistedJanTurnVerifier, StagedCeExecutable,
        TrustedCeApprovalSource, TrustedUserTurnVerifier,
    };
    use serde::Serialize;
    use tauri::{Emitter, State, WebviewWindow};

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
        staged: StagedCeExecutable,
        grant: CeGrantRequest,
        permissions: CePermissionStore,
        inserted: Instant,
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
        // The deadline begins when the host queues the prompt, NOT when
        // the native Yes/No dialog returns.
        inserted: Instant,
    }
    impl NativeOneUseDecision {
        fn granted(prompt: CeApprovalPrompt, inserted: Instant) -> Self {
            Self {
                confirmed: Mutex::new(Some(prompt)),
                inserted,
            }
        }
    }
    impl TrustedCeApprovalSource for NativeOneUseDecision {
        fn consume_exact_confirmation(&self, prompt: &CeApprovalPrompt) -> Option<Instant> {
            // Consume even a stale or mismatched decision: no replay path.
            // Return the original host queue deadline so SQLite admission
            // rechecks it after any writer-lock contention.
            self.confirmed
                .lock()
                .ok()
                .and_then(|mut current| current.take())
                .and_then(|expected| {
                    if &expected == prompt && self.inserted.elapsed() < PROMPT_TIMEOUT {
                        self.inserted.checked_add(PROMPT_TIMEOUT)
                    } else {
                        None
                    }
                })
        }
    }

    pub struct LuCeConsentState {
        pending: Mutex<BTreeMap<String, Pending>>,
        // Immutable host-selected profile folder captured at desktop setup.
        // A later data-folder switch invalidates this consent state.
        data_folder: PathBuf,
        verifier: PersistedJanTurnVerifier,
    }

    impl LuCeConsentState {
        pub fn new(data_folder: PathBuf) -> Self {
            Self {
                pending: Mutex::new(BTreeMap::new()),
                data_folder: data_folder.clone(),
                verifier: PersistedJanTurnVerifier::new(data_folder),
            }
        }

        fn matches_profile_folder(&self, active_folder: &Path) -> bool {
            self.data_folder == active_folder
        }

        fn require_current_profile(&self, app: &tauri::AppHandle) -> Result<(), String> {
            if !self.matches_profile_folder(&get_jan_data_folder_path(app.clone())) {
                return Err("CE consent state belongs to a different data-folder profile; restart Lu before reviewing permissions".into());
            }
            Ok(())
        }

        /// TRUSTED RUST HOST ONLY. The executable CE loader must have already
        /// verified the signed package using the SAME persisted trust/grant
        /// store the resource broker will use. This API is NOT a Tauri command.
        /// A model cannot request a popup merely by invoking tools.
        /// Host-only signed-package loader -> desktop consent admission.
        /// This is not a Tauri command, installer, or permission to launch.
        /// The same durable store verifies the signature and later records
        /// the user's native, one-use decision.
        pub fn enqueue_host_signed_package(
            &self,
            app: &tauri::AppHandle,
            conversation_id: &str,
            signed_envelope: &str,
            executable_bytes: &[u8],
            stager: &CeExecutableStager,
            grant: CeGrantRequest,
            permissions: CePermissionStore,
        ) -> Result<String, String> {
            self.require_current_profile(app)?;
            if !self.verifier.verify_user_turn(conversation_id, &grant.approved_user_turn_id) {
                return Err("unverified user turn".into());
            }
            let verified = permissions
                .verify_signed_package(signed_envelope, executable_bytes)
                .map_err(|_| "signed CE publisher or digest not trusted")?;
            let staged = stager
                .stage(verified)
                .map_err(|_| "signed CE executable staging failed")?;
            self.enqueue_host_staged(app, conversation_id, staged, grant, permissions)
        }

        fn enqueue_host_staged(
            &self,
            app: &tauri::AppHandle,
            conversation_id: &str,
            staged: StagedCeExecutable,
            grant: CeGrantRequest,
            permissions: CePermissionStore,
        ) -> Result<String, String> {
            self.require_current_profile(app)?;
            staged.verify_on_disk().map_err(|_| "staged CE changed on disk")?;
            let package = staged.package();
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
                prompt, staged, grant, permissions, inserted: Instant::now(),
            });
            drop(pending);
            // A profile change during signature verification or staging must
            // not leave a reviewable prompt in the newly selected profile.
            if let Err(error) = self.require_current_profile(app) {
                self.dismiss(&id)?;
                return Err(error);
            }
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

        fn finalize(&self, app: &tauri::AppHandle, pending: &Pending, confirmed: bool) -> Result<bool, String> {
            if !confirmed { return Ok(false); }
            self.require_current_profile(app)?;
            // take() checks the deadline before displaying the native dialog,
            // but a dialog can remain open past the 120-second queue TTL.
            if pending.inserted.elapsed() >= PROMPT_TIMEOUT {
                return Err("CE approval request expired".into());
            }
            // A pending prompt is not a stable executable identity. Rehash
            // the staged artifact before consuming the human approval.
            pending.staged.verify_on_disk()
                .map_err(|_| "staged CE changed before native approval")?;
            // Recheck immediately before the durable admission attempt.
            // A profile switch while the OS modal was open must fail closed.
            self.require_current_profile(app)?;
            let decision = NativeOneUseDecision::granted(
                pending.prompt.clone(),
                pending.inserted,
            );
            CeApprovalGate {
                permissions: &pending.permissions,
                turns: &self.verifier,
                confirmations: &decision,
            }.approve_confirmed(
                &pending.prompt.conversation_id, pending.staged.package(), &pending.grant
            ).map_err(|e| format!("CE approval denied by host: {e:?}"))?;
            Ok(true)
        }
    }


    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn profile_switch_invalidates_pending_consent_state() {
            let state = LuCeConsentState::new(PathBuf::from("profile-a"));
            assert!(state.matches_profile_folder(Path::new("profile-a")));
            assert!(!state.matches_profile_folder(Path::new("profile-b")));
            // Fail closed even if the new path is a different spelling of
            // the same location; the host must reinitialize consent state.
            assert!(!state.matches_profile_folder(Path::new("profile-a/.")));
        }

        #[test]
        fn confirmed_prompt_is_one_use_and_exact_match() {
            use lu_core::ToolEffect;
            let prompt = CeApprovalPrompt {
                conversation_id:"c".into(),user_turn_id:"t".into(),
                profile_id:"profile".into(),scope_id:"scope".into(),
                package_id:"publisher.worker".into(),artifact_digest:"digest".into(),
                signer_key_id:"signer".into(),publisher:"Publisher".into(),
                tool_id:"publisher.worker.run".into(),effect:ToolEffect::ReadWorkspace,
                expires_at:i64::MAX,
            };
            let inserted = Instant::now();
            let decision = NativeOneUseDecision::granted(prompt.clone(), inserted);
            assert!(decision.consume_exact_confirmation(&prompt).is_some());
            assert!(decision.consume_exact_confirmation(&prompt).is_none());
            let mut changed = prompt.clone();
            changed.scope_id = "other".into();
            assert!(NativeOneUseDecision::granted(prompt.clone(), inserted)
                .consume_exact_confirmation(&changed)
                .is_none());

            // A human may click Yes after leaving the OS dialog open beyond
            // the host queue TTL. That late Yes must not become a durable grant.
            let expired = Instant::now().checked_sub(PROMPT_TIMEOUT).unwrap();
            let late = NativeOneUseDecision::granted(prompt.clone(), expired);
            assert!(late.consume_exact_confirmation(&prompt).is_none());
            assert!(late.consume_exact_confirmation(&prompt).is_none());
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
        state.require_current_profile(window.app_handle())?;
        state.views()
    }

    pub async fn deny(request_id: String, window: WebviewWindow, state: State<'_, LuCeConsentState>)
        -> Result<bool, String> {
        main_window_only(&window)?;
        state.require_current_profile(window.app_handle())?;
        state.dismiss(&request_id)
    }

    pub async fn review(request_id: String, window: WebviewWindow, state: State<'_, LuCeConsentState>)
        -> Result<bool, String> {
        main_window_only(&window)?;
        state.require_current_profile(window.app_handle())?;
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
        state.finalize(window.app_handle(), &pending, confirmed)
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
