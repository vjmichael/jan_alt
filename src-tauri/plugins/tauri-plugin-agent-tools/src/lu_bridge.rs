//! Feature-gated bridge from Jan's existing native tools to Lu's registry.
//!
//! No MCP server is involved. This adapter is not connected to the desktop or
//! Cowork: it exists so legacy implementations can be tested behind the new
//! native contract without modifying their current dispatch paths.
//!
//! Security: the legacy gate is applied IN ADDITION to Lu's ToolAuthorizer.
//! For now any legacy gate decision requiring a UI prompt is denied; the
//! future interactive PolicyEngine must supply actual approval round trips.

use std::{
    path::{Path, PathBuf},
    sync::Arc,
};

use lu_core::{
    wire::{proto, typed_result},
    ModuleKind, ModuleManifest, NativeTool, NativeToolRegistry, RegistryError, ToolDescriptor,
    ToolEffect, ToolFailure, ToolFuture, ToolInvocation, ToolOutput, CORE_CONTRACT_VERSION,
};
use prost::Message;

use crate::{
    permissions::ToolPermissions,
    tools::{
        gate::{self, Decision, GateContext, SessionGrants},
        handlers, BuiltinTool, Capability, ToolContext, BUILTIN_TOOLS,
    },
};

const MODULE_ID: &str = "jan.legacy";
const INPUT_TYPE: &str = "type.googleapis.com/lu.v1.LegacyJsonArguments";
const OUTPUT_TYPE: &str = "type.googleapis.com/lu.v1.LegacyToolResult";

#[derive(Clone)]
pub struct LegacyRoots {
    pub project_root: PathBuf,
    pub store_root: PathBuf,
}

impl LegacyRoots {
    /// The roots must exist and must not nest inside each other: tool file
    /// operations must not be able to reach durable Lu/Jan memory storage.
    pub fn validated(project_root: &Path, store_root: &Path) -> Result<Self, RegistryError> {
        let project_root = project_root.canonicalize().map_err(|_| {
            RegistryError::InvalidDescriptor("project root must exist".into())
        })?;
        let store_root = store_root.canonicalize().map_err(|_| {
            RegistryError::InvalidDescriptor("store root must exist".into())
        })?;
        if project_root.starts_with(&store_root) || store_root.starts_with(&project_root) {
            return Err(RegistryError::InvalidDescriptor(
                "tool workspace and persistent memory root must be disjoint".into(),
            ));
        }
        Ok(Self { project_root, store_root })
    }
}

struct LegacyBuiltin {
    descriptor: ToolDescriptor,
    builtin: BuiltinTool,
    roots: Arc<LegacyRoots>,
}

fn effect(capability: Capability) -> ToolEffect {
    match capability {
        Capability::Read => ToolEffect::ReadWorkspace,
        Capability::Write => ToolEffect::WriteWorkspace,
        Capability::Exec => ToolEffect::ExecuteCode,
        Capability::Net => ToolEffect::NetworkRead,
    }
}

fn failure(code: &str, message: impl Into<String>) -> ToolFailure {
    ToolFailure::new(code, message, false)
}

impl NativeTool for LegacyBuiltin {
    fn descriptor(&self) -> &ToolDescriptor {
        &self.descriptor
    }

    fn invoke(&self, invocation: ToolInvocation) -> ToolFuture<'_> {
        Box::pin(async move {
            let input = proto::LegacyJsonArguments::decode(invocation.input.bytes.as_slice())
                .map_err(|e| failure("BAD_PROTOBUF", format!("decode: {e}")))?;
            let args: serde_json::Value = serde_json::from_str(&input.json)
                .map_err(|e| failure("BAD_LEGACY_JSON", format!("parse: {e}")))?;
            if !args.is_object() {
                return Err(failure(
                    "BAD_LEGACY_ARGS",
                    "legacy tool arguments must be a JSON object",
                ));
            }

            let gate_ctx = GateContext {
                project_root: &self.roots.project_root,
                scratch: None,
                read_roots: &[],
                write_roots: &[],
                hidden_root: None,
            };
            match gate::resolve_decision(
                &self.builtin,
                &args,
                &gate_ctx,
                &ToolPermissions::default(),
                &SessionGrants::default(),
            ) {
                Decision::Allow => {}
                Decision::HardDeny(reason) => {
                    return Err(failure("LEGACY_HARD_DENY", format!("{reason:?}")));
                }
                Decision::Prompt(kind) => {
                    return Err(failure("LEGACY_APPROVAL_REQUIRED", format!("{kind:?}")));
                }
            }

            // Agent ToolContext retains the underlying Jan symlink checks,
            // confined filesystem access, hooks, and existing tool behavior.
            let empty_skills: &[String] = &[];
            let ctx = ToolContext::new(
                &self.roots.project_root,
                &self.roots.store_root,
                empty_skills,
            )
            .with_confined_writes(true)
            .with_sandbox(true)
            .with_network(false);

            let (content, diff, images) =
                handlers::execute_builtin_with_diff(&self.builtin, &args, &ctx).await;
            if handlers::tool_result_failed(&self.builtin, &content) {
                return Err(failure("LEGACY_TOOL_ERROR", content));
            }
            let payload = proto::LegacyToolResult {
                content,
                diff,
                images: images
                    .unwrap_or_default()
                    .into_iter()
                    .map(|img| proto::LegacyImage {
                        name: img.name,
                        data_url: img.data_url,
                    })
                    .collect(),
            };
            let result: ToolOutput = typed_result(OUTPUT_TYPE, &payload);
            Ok(result)
        })
    }
}

/// Register all Jan built-ins under a qualified `jan.legacy.*` namespace.
/// Registry registration is atomic; no previously registered Lu-native tool
/// is replaced. The existing Cowork dispatcher continues to run untouched.
pub fn register_legacy_builtins(
    registry: &NativeToolRegistry,
    roots: LegacyRoots,
) -> Result<(), RegistryError> {
    let roots = Arc::new(roots);
    let descriptors: Vec<_> = BUILTIN_TOOLS
        .iter()
        .map(|builtin| ToolDescriptor {
            id: format!("{MODULE_ID}.{}", builtin.name),
            display_name: format!("Legacy Jan {}", builtin.name),
            effect: effect(builtin.capability),
            input_type_url: INPUT_TYPE.into(),
            output_type_url: OUTPUT_TYPE.into(),
        })
        .collect();
    let implementations: Vec<Arc<dyn NativeTool>> = BUILTIN_TOOLS
        .iter()
        .zip(descriptors.iter())
        .map(|(builtin, descriptor)| {
            Arc::new(LegacyBuiltin {
                descriptor: descriptor.clone(),
                builtin: *builtin,
                roots: Arc::clone(&roots),
            }) as Arc<dyn NativeTool>
        })
        .collect();
    registry.register(
        ModuleManifest {
            id: MODULE_ID.into(),
            display_name: "Jan legacy tools (compatibility only)".into(),
            contract_version: CORE_CONTRACT_VERSION,
            kind: ModuleKind::Core,
            tools: descriptors,
            panels: vec![],
            workflows: vec![],
        },
        implementations,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use lu_core::{AuthorizationError, DispatchError, ProtoPayload, ToolAuthorizer};

    struct Allow;
    impl ToolAuthorizer for Allow {
        fn authorize(
            &self,
            _invocation: &ToolInvocation,
            _descriptor: &ToolDescriptor,
        ) -> Result<(), AuthorizationError> {
            Ok(())
        }
    }

    fn fixture() -> (NativeToolRegistry, LegacyRoots) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let n = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("lu-legacy-{}-{n}", std::process::id()));
        let project = root.join("work");
        let store = root.join("store");
        std::fs::create_dir_all(&project).unwrap();
        std::fs::create_dir_all(&store).unwrap();
        let roots = LegacyRoots::validated(&project, &store).unwrap();
        (NativeToolRegistry::new(), roots)
    }

    #[tokio::test]
    async fn legacy_read_works_through_native_registry_without_mcp() {
        let (registry, roots) = fixture();
        std::fs::write(roots.project_root.join("hello.txt"), "Lu says hello").unwrap();
        register_legacy_builtins(&registry, roots).unwrap();
        let args = proto::LegacyJsonArguments { json: r#"{"path":"hello.txt"}"#.into() };
        let result = registry.dispatch(
            ToolInvocation {
                call_id: "read-1".into(),
                tool_id: "jan.legacy.read".into(),
                workspace_id: None,
                input: ProtoPayload {
                    type_url: INPUT_TYPE.into(),
                    bytes: args.encode_to_vec(),
                },
            },
            &Allow,
        ).await.unwrap();
        let out = proto::LegacyToolResult::decode(result.payload.bytes.as_slice()).unwrap();
        assert!(out.content.contains("Lu says hello"));
    }

    #[tokio::test]
    async fn legacy_write_needs_separate_approval_even_when_lu_authorizes() {
        let (registry, roots) = fixture();
        register_legacy_builtins(&registry, roots).unwrap();
        let args = proto::LegacyJsonArguments {
            json: r#"{"path":"unsafe.txt","content":"no"}"#.into(),
        };
        let result = registry.dispatch(
            ToolInvocation {
                call_id: "write-1".into(),
                tool_id: "jan.legacy.write".into(),
                workspace_id: None,
                input: ProtoPayload {
                    type_url: INPUT_TYPE.into(),
                    bytes: args.encode_to_vec(),
                },
            },
            &Allow,
        ).await;
        assert!(matches!(result, Err(DispatchError::Execution(ToolFailure { code, .. })) if code == "LEGACY_APPROVAL_REQUIRED"));
    }
}
