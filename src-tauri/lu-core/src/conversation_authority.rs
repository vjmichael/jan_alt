//! Conversation-bound authority for Lu agent actions.
//!
//! A model can REQUEST a tool call but cannot CREATE a capability. The trusted
//! host opens a task only after verifying a real user-authored conversation
//! turn. Untrusted documents, retrieved pages, model output, subagents, and
//! tool responses are task data, never authorities.
//!
//! Deliberately not wired into Jan's desktop or Cowork yet: the desktop must
//! implement a real conversation ownership/role verifier, attach immutable
//! origin context on the Rust side, and constrain argument-level resource
//! scope before this can be a production authorization boundary.

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::{Arc, RwLock},
    time::SystemTime,
};

use crate::{
    contracts::{AuthorizationError, ToolAuthorizer, ToolDescriptor, ToolEffect, ToolInvocation},
    privilege_guard::{enforce_model_ceiling, ProtectedEffect},
    registry::{NativeToolRegistry, ToolResponse},
};

/// MUST be implemented with host-owned conversation records. In particular,
/// check the authenticated account owns this conversation, the referenced
/// message exists, and its persisted role is USER (not system, model, tool,
/// quoted text or a retrieved document). Never trust an LLM-reported role.
pub trait TrustedUserTurnVerifier: Send + Sync {
    fn verify_user_turn(&self, conversation_id: &str, user_turn_id: &str) -> bool;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuthorizedCapability {
    pub tool_id: String,
    pub effect: ToolEffect,
}

/// Immutable, exact origin of a task and its delegated capabilities.
/// The host, not the model or webview, chooses these identifiers.
#[derive(Debug, Clone)]
pub struct TaskAuthority {
    pub conversation_id: String,
    pub user_turn_id: String,
    pub task_id: String,
    /// Exact workspace/session scope bound by the host. Do not accept this
    /// value directly from a model or arbitrary webview invocation.
    pub execution_scope_id: String,
    pub capabilities: Vec<AuthorizedCapability>,
    pub expires_at: Option<SystemTime>,
}

/// Out-of-band provenance attached by Lu's trusted task scheduler. It is NOT
/// a token or permission claim that should be serialized into model prompts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BoundCallOrigin {
    pub conversation_id: String,
    pub user_turn_id: String,
    pub task_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuthorityError {
    InvalidIdentifier,
    InvalidGrant,
    UnverifiedUserTurn,
    DuplicateTask,
    UnknownTask,
    ProtectedEffect(ProtectedEffect),
    Unavailable,
}

#[derive(Clone)]
struct Record {
    authority: TaskAuthority,
    active: bool,
    allowed: BTreeMap<String, ToolEffect>,
}

#[derive(Clone, Default)]
pub struct ConversationAuthority {
    tasks: Arc<RwLock<BTreeMap<String, Record>>>,
}

fn valid_identity(value: &str) -> bool {
    !value.trim().is_empty() && value.len() <= 128 && !value.contains('\0')
}

impl ConversationAuthority {
    pub fn new() -> Self {
        Self::default()
    }

    /// Called ONLY from a trusted host handler after checking the actual
    /// persisted USER message and ownership. No "model says user approved"
    /// string can satisfy the verifier.
    pub fn open_user_task(
        &self,
        authority: TaskAuthority,
        verifier: &dyn TrustedUserTurnVerifier,
    ) -> Result<(), AuthorityError> {
        for id in [
            &authority.conversation_id,
            &authority.user_turn_id,
            &authority.task_id,
            &authority.execution_scope_id,
        ] {
            if !valid_identity(id) {
                return Err(AuthorityError::InvalidIdentifier);
            }
        }
        if !verifier.verify_user_turn(&authority.conversation_id, &authority.user_turn_id) {
            return Err(AuthorityError::UnverifiedUserTurn);
        }
        if authority.capabilities.is_empty() {
            return Err(AuthorityError::InvalidGrant);
        }
        if authority
            .expires_at
            .is_some_and(|expires| SystemTime::now() >= expires)
        {
            return Err(AuthorityError::InvalidGrant);
        }
        let mut allowed = BTreeMap::new();
        for capability in &authority.capabilities {
            if !valid_identity(&capability.tool_id) {
                return Err(AuthorityError::InvalidGrant);
            }
            enforce_model_ceiling(capability.effect).map_err(AuthorityError::ProtectedEffect)?;
            if allowed
                .insert(capability.tool_id.clone(), capability.effect)
                .is_some()
            {
                return Err(AuthorityError::InvalidGrant);
            }
        }
        let mut tasks = self
            .tasks
            .write()
            .map_err(|_| AuthorityError::Unavailable)?;
        if tasks.contains_key(&authority.task_id) {
            return Err(AuthorityError::DuplicateTask);
        }
        tasks.insert(
            authority.task_id.clone(),
            Record {
                authority,
                active: true,
                allowed,
            },
        );
        Ok(())
    }

    /// An existing task cannot gain new capabilities via a model message.
    /// Changed user intent should be reverified and expressed as a NEW task.
    pub fn revoke_task(&self, task_id: &str) -> Result<(), AuthorityError> {
        let mut tasks = self
            .tasks
            .write()
            .map_err(|_| AuthorityError::Unavailable)?;
        let entry = tasks.get_mut(task_id).ok_or(AuthorityError::UnknownTask)?;
        entry.active = false;
        Ok(())
    }

    pub fn revoke_conversation(&self, conversation_id: &str) -> Result<usize, AuthorityError> {
        let mut tasks = self
            .tasks
            .write()
            .map_err(|_| AuthorityError::Unavailable)?;
        let mut count = 0;
        for task in tasks.values_mut() {
            if task.authority.conversation_id == conversation_id && task.active {
                task.active = false;
                count += 1;
            }
        }
        Ok(count)
    }

    /// This is the safe dispatch entry point for future model-originated
    /// calls. It checks the immutable origin, exact tool/effect/scope, and
    /// delegates to existing host policy. It does NOT infer whether a request
    /// is semantically relevant to the user's task: the host must additionally
    /// enforce typed argument scope and high-risk action review.
    pub async fn dispatch_bound(
        &self,
        registry: &NativeToolRegistry,
        invocation: ToolInvocation,
        origin: BoundCallOrigin,
        host_policy: &dyn ToolAuthorizer,
    ) -> ToolResponse {
        let guard = BoundAuthorizer {
            authority: self,
            origin: &origin,
            host_policy,
        };
        registry.dispatch(invocation, &guard).await
    }

    /// For a model-facing tool catalog, filter candidate tools by the
    /// currently authenticated task. This MUST NOT be used to approve an
    /// action: dispatch_bound independently re-checks these conditions.
    pub fn permitted_tool_ids(
        &self,
        origin: &BoundCallOrigin,
    ) -> Result<BTreeSet<String>, AuthorityError> {
        let tasks = self.tasks.read().map_err(|_| AuthorityError::Unavailable)?;
        let record = tasks
            .get(&origin.task_id)
            .ok_or(AuthorityError::UnknownTask)?;
        if !record.active
            || record.authority.conversation_id != origin.conversation_id
            || record.authority.user_turn_id != origin.user_turn_id
            || record
                .authority
                .expires_at
                .is_some_and(|expires| SystemTime::now() >= expires)
        {
            return Ok(BTreeSet::new());
        }
        Ok(record.allowed.keys().cloned().collect())
    }

    fn authorize_internal(
        &self,
        origin: &BoundCallOrigin,
        invocation: &ToolInvocation,
        descriptor: &ToolDescriptor,
    ) -> Result<(), AuthorizationError> {
        let tasks = self
            .tasks
            .read()
            .map_err(|_| AuthorizationError::new("conversation authority unavailable"))?;
        let task = tasks
            .get(&origin.task_id)
            .ok_or_else(|| AuthorizationError::new("no authorized task for tool call"))?;
        if !task.active
            || task.authority.conversation_id != origin.conversation_id
            || task.authority.user_turn_id != origin.user_turn_id
            || task
                .authority
                .expires_at
                .is_some_and(|expires| SystemTime::now() >= expires)
        {
            return Err(AuthorizationError::new("task authority invalid or revoked"));
        }
        if invocation.workspace_id.as_deref() != Some(task.authority.execution_scope_id.as_str()) {
            return Err(AuthorizationError::new(
                "tool call scope differs from authorized task",
            ));
        }
        if invocation.tool_id != descriptor.id
            || task.allowed.get(&descriptor.id) != Some(&descriptor.effect)
        {
            return Err(AuthorizationError::new(
                "tool action exceeds conversation-delegated capabilities",
            ));
        }
        Ok(())
    }
}

struct BoundAuthorizer<'a> {
    authority: &'a ConversationAuthority,
    origin: &'a BoundCallOrigin,
    host_policy: &'a dyn ToolAuthorizer,
}

impl ToolAuthorizer for BoundAuthorizer<'_> {
    fn authorize(
        &self,
        invocation: &ToolInvocation,
        descriptor: &ToolDescriptor,
    ) -> Result<(), AuthorizationError> {
        self.authority
            .authorize_internal(self.origin, invocation, descriptor)?;
        self.host_policy.authorize(invocation, descriptor)
    }
}
