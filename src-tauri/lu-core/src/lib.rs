//! Lu's general-purpose, Tauri-independent core contracts.
//!
//! Foundation only: this crate does not replace Jan's Cowork agent loop,
//! expose new IPC commands, load workspace packages, or execute untrusted code.
//! Registering a native tool never requires an MCP server.
//!
//! The internal payload envelope names a Protobuf message type. Later adapters
//! will decode and validate generated Protobuf messages at each boundary; this
//! crate deliberately does not pretend opaque bytes have been validated.

#![forbid(unsafe_code)]

pub mod contracts;
pub mod journal;
pub mod registry;
pub mod wire;
pub mod workspace;

pub use contracts::{
    AuthorizationError, ModuleKind, ModuleManifest, NativeTool, PanelContribution, ProtoPayload,
    ToolAuthorizer, ToolDescriptor, ToolEffect, ToolFailure, ToolFuture, ToolInvocation,
    ToolOutput, WorkflowContribution, CORE_CONTRACT_VERSION,
};
pub use journal::{EffectJournal, EffectRecord, EffectState, JournalError, PrepareOutcome};
pub use registry::{DispatchError, NativeToolRegistry, RegistryError, ToolResponse};
pub use workspace::{WorkspaceError, WorkspaceHost, WorkspaceInstance, WorkspaceState};
