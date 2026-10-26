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

pub mod ansf;
pub mod ansf_import;
pub mod ansf_library;
pub mod ansf_revisions;
pub mod ansf_sync;
pub mod continuity;
pub mod contracts;
pub mod conversation_authority;
pub mod durable;
pub mod host_resource_authority;
pub mod journal;
pub mod model;
pub mod ownership_store;
pub mod native_files;
pub mod policy;
pub mod privilege_guard;
pub use policy::{CapabilityGrant, PolicyEngine, PolicyError};
pub mod registry;
pub mod tasks;
pub mod wire;
pub mod workspace;
pub mod workspace_quarantine;

pub use ansf::{AnsfError, AnsfStore, Chapter as AnsfChapter, Entry as AnsfEntry, EntryRole};
pub use ansf_import::{
    import_jan_jsonl, import_jan_jsonl_with_policy, ImportError as AnsfImportError, ImportStats,
    JanImportPolicy,
};
pub use ansf_library::{AnsfLibrary, BookIndex, ChapterIndex, LibraryError};
pub use ansf_revisions::{CurrentMessage, RevisionLink, RevisionOrigin};
pub use ansf_sync::{reconcile_book_index, sync_verified_snapshot, SyncError};
pub use continuity::{ContinuityError, ContinuityStore, TaskCheckpoint};
pub use contracts::{
    AuthorizationError, ModuleKind, ModuleManifest, NativeTool, PanelContribution, ProtoPayload,
    ToolAuthorizer, ToolDescriptor, ToolEffect, ToolFailure, ToolFuture, ToolInvocation,
    ToolOutput, WorkflowContribution, CORE_CONTRACT_VERSION,
};
pub use conversation_authority::{
    AuthorityError, AuthorizedCapability, BoundCallOrigin, ConversationAuthority, TaskAuthority,
    TrustedUserTurnVerifier,
};
pub use ownership_store::{OwnershipStore, OwnershipStoreError};
pub use durable::DurableDispatcher;
pub use host_resource_authority::{
    AuthorizedResource, HostPrincipal, HostResourceAuthority, ResourceAction, ResourceDenial,
    ResourceRecord, Sensitivity,
};
pub use journal::{EffectJournal, EffectRecord, EffectState, JournalError, PrepareOutcome};
pub use registry::{DispatchError, NativeToolRegistry, RegistryError, ToolResponse};
pub use tasks::{TaskRecord, TaskState, TaskStore, TaskStoreError};
pub use workspace::{WorkspaceError, WorkspaceHost, WorkspaceInstance, WorkspaceState};
pub use workspace_quarantine::{IntakeReceipt, IntakeStatus, QuarantineError, WorkspaceQuarantine};
