//! Durable native dispatch for operations whose effects must not be replayed.
//!
//! A successful effect is replayed from the persisted Protobuf receipt, not
//! re-executed. Interrupted or ambiguously failed effects are held UNCERTAIN.
//! This dispatcher is currently opt-in: Cowork is not using it yet.

use crate::{
    contracts::{ProtoPayload, ToolAuthorizer, ToolFailure, ToolInvocation, ToolOutput},
    inference_host::Cancellation,
    journal::{EffectJournal, EffectState, JournalError, PrepareOutcome},
    privilege_guard::enforce_model_ceiling,
    registry::{DispatchError, NativeToolRegistry, ToolResponse},
    wire::{self, proto},
};

fn journal_error(error: JournalError) -> DispatchError {
    DispatchError::Execution(ToolFailure::new(
        "JOURNAL_FAILURE",
        format!("effect journal unavailable: {error:?}; do not retry blindly"),
        false,
    ))
}

fn halted(reason: impl Into<String>) -> DispatchError {
    DispatchError::Execution(ToolFailure::new("EFFECT_REPLAY_BLOCKED", reason, false))
}

pub struct DurableDispatcher<'a> {
    pub registry: &'a NativeToolRegistry,
    pub journal: &'a EffectJournal,
}

/// If the owning future is dropped, mark the possibly-started side effect
/// uncertain immediately. Process termination still requires startup
/// reconcile_interrupted after exclusive ownership is established.
struct PendingEffect<'a> {
    journal: &'a EffectJournal,
    call_id: String,
    pending: bool,
}
impl Drop for PendingEffect<'_> {
    fn drop(&mut self) {
        if self.pending {
            let _ = self.journal.mark_uncertain(&self.call_id);
        }
    }
}

impl DurableDispatcher<'_> {
    pub async fn dispatch(
        &self,
        invocation: ToolInvocation,
        authorizer: &dyn ToolAuthorizer,
    ) -> ToolResponse {
        self.dispatch_inner(invocation, authorizer, None).await
    }

    /// Cancel a pending native invocation without losing effect provenance.
    /// An already started native operation may have changed files. A dropped
    /// future is NOT OS-process termination: classify the effect UNCERTAIN
    /// and require reconciliation before any retry.
    pub async fn dispatch_cancellable(
        &self,
        invocation: ToolInvocation,
        authorizer: &dyn ToolAuthorizer,
        cancel: &Cancellation,
    ) -> ToolResponse {
        self.dispatch_inner(invocation, authorizer, Some(cancel)).await
    }

    async fn dispatch_inner(
        &self,
        invocation: ToolInvocation,
        authorizer: &dyn ToolAuthorizer,
        cancel: Option<&Cancellation>,
    ) -> ToolResponse {
        // Recheck current authorization before revealing even a cached
        // committed result. User permission revocation must take effect even
        // when a previous call_id already has a receipt.
        let descriptor = self
            .registry
            .tools()
            .map_err(|_| halted("native registry unavailable"))?
            .into_iter()
            .find(|tool| tool.id == invocation.tool_id)
            .ok_or_else(|| DispatchError::UnknownTool(invocation.tool_id.clone()))?;
        if invocation.input.type_url != descriptor.input_type_url {
            return Err(DispatchError::InputTypeMismatch {
                expected: descriptor.input_type_url,
                actual: invocation.input.type_url,
            });
        }
        // Cached receipts cannot bypass a newly applied privilege ceiling.
        enforce_model_ceiling(descriptor.effect).map_err(DispatchError::ProtectedEffect)?;
        authorizer
            .authorize(&invocation, &descriptor)
            .map_err(|e| DispatchError::Denied(e.reason))?;
        let prior = self.journal.prepare(&invocation).map_err(journal_error)?;
        match prior {
            PrepareOutcome::Existing(EffectState::Applied) => {
                let record = self
                    .journal
                    .get(&invocation.call_id)
                    .map_err(journal_error)?
                    .ok_or_else(|| halted("committed effect has no journal entry"))?;
                let bytes = record
                    .receipt
                    .ok_or_else(|| halted("committed effect has no durable receipt"))?;
                let reply = wire::decode_reply(&bytes)
                    .map_err(|_| halted("stored Protobuf effect receipt is unreadable"))?;
                if reply.call_id != invocation.call_id {
                    return Err(halted("stored receipt call ID mismatch"));
                }
                return match reply.outcome {
                    Some(proto::tool_reply::Outcome::Output(bytes)) => Ok(ToolOutput {
                        payload: ProtoPayload {
                            type_url: reply.output_type_url,
                            bytes,
                        },
                    }),
                    _ => Err(halted("committed effect has no success result")),
                };
            }
            PrepareOutcome::Existing(EffectState::Executing)
            | PrepareOutcome::Existing(EffectState::Uncertain)
            | PrepareOutcome::Existing(EffectState::Failed) => {
                return Err(halted(
                    "effect has already begun, failed, or is uncertain; reconcile before proceeding",
                ));
            }
            PrepareOutcome::New | PrepareOutcome::Existing(EffectState::Prepared) => {}
        }

        // Even a prepared record is not authority. Do not enter EXECUTING if
        // the trusted host has already cancelled the task.
        if cancel.is_some_and(Cancellation::is_cancelled) {
            return Err(halted("cancelled before the native effect was started"));
        }
        // Transition to EXECUTING is a compare-and-swap guard against two
        // concurrent callers running the same call_id.
        self.journal
            .mark_executing(&invocation.call_id)
            .map_err(journal_error)?;

        let call_id = invocation.call_id.clone();
        let mut pending = PendingEffect {
            journal: self.journal,
            call_id: call_id.clone(),
            pending: true,
        };
        let response = if let Some(cancel) = cancel {
            tokio::select! {
                biased;
                _ = cancel.cancelled() => {
                    // Drop the native future; workers that spawn detached or
                    // blocking work must be killed/joined by their OS owner.
                    // The durable intent is *uncertain*, never safe to replay.
                    return Err(halted(
                        "native effect interrupted; result uncertain; reconcile before retry",
                    ));
                }
                outcome = self.registry.dispatch(invocation, authorizer) => outcome,
            }
        } else {
            self.registry.dispatch(invocation, authorizer).await
        };
        match &response {
            Ok(_) => {
                let encoded = wire::encode_reply(&call_id, &response).map_err(|error| {
                    let _ = self.journal.mark_uncertain(&call_id);
                    halted(format!(
                        "effect succeeded but receipt encoding failed: {error:?}"
                    ))
                })?;
                self.journal
                    .mark_applied(&call_id, &encoded)
                    .map_err(journal_error)?;
            }
            Err(DispatchError::Execution(_)) => {
                // We cannot infer from a tool error whether partial effects
                // occurred. Err on the side of requiring reconciliation.
                self.journal
                    .mark_uncertain(&call_id)
                    .map_err(journal_error)?;
            }
            Err(_) => {
                // No native implementation was invoked (validation/authorization
                // failed), so no side effect should have occurred.
                self.journal.mark_failed(&call_id).map_err(journal_error)?;
            }
        }
        pending.pending = false;
        response
    }
}
