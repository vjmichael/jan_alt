//! Test-only Lu WorkspaceHost contract for the optional NVP Film DLC.
//! This does not install, launch or authorize a real external DLC worker.

use std::sync::Arc;
use lu_core::contracts::{
    AuthorizationError, ModuleKind, ModuleManifest, NativeTool, PanelContribution,
    ProtoPayload, ToolAuthorizer, ToolDescriptor, ToolEffect, ToolFuture, ToolInvocation,
    ToolOutput, WorkflowContribution, CORE_CONTRACT_VERSION,
};
use lu_core::registry::DispatchError;
use lu_core::workspace::{WorkspaceError, WorkspaceHost};

const MODULE_ID: &str = "nvp.film";
const TOOL_ID: &str = "nvp.project.read";

struct FixtureRead(ToolDescriptor);
impl NativeTool for FixtureRead {
    fn descriptor(&self) -> &ToolDescriptor { &self.0 }
    fn invoke(&self, _: ToolInvocation) -> ToolFuture<'_> {
        Box::pin(async {
            Ok(ToolOutput {
                payload: ProtoPayload {
                    type_url: "type.googleapis.com/lu.v1.CeReadResult".into(),
                    bytes: vec![],
                },
            })
        })
    }
}
struct Deny;
impl ToolAuthorizer for Deny {
    fn authorize(&self, _: &ToolInvocation, _: &ToolDescriptor)
        -> Result<(), AuthorizationError> {
        Err(AuthorizationError::new("no current host grant"))
    }
}
struct AllowReadOnly;
impl ToolAuthorizer for AllowReadOnly {
    fn authorize(&self, _: &ToolInvocation, tool: &ToolDescriptor)
        -> Result<(), AuthorizationError> {
        if tool.effect == ToolEffect::ReadWorkspace && tool.id == TOOL_ID {
            Ok(())
        } else {
            Err(AuthorizationError::new("not a reviewed read-only film operation"))
        }
    }
}
fn fixture() -> (ModuleManifest, Vec<Arc<dyn NativeTool>>) {
    let descriptor = ToolDescriptor {
        id: TOOL_ID.into(),
        display_name: "Read NVP project fixture".into(),
        effect: ToolEffect::ReadWorkspace,
        input_type_url: "type.googleapis.com/lu.v1.CeReadRequest".into(),
        output_type_url: "type.googleapis.com/lu.v1.CeReadResult".into(),
    };
    let manifest = ModuleManifest {
        id: MODULE_ID.into(),
        display_name: "NVP - Make Your Movie".into(),
        contract_version: CORE_CONTRACT_VERSION,
        kind: ModuleKind::Workspace,
        tools: vec![descriptor.clone()],
        panels: vec![PanelContribution {
            id: "nvp.story".into(),
            title: "Develop your idea".into(),
        }],
        workflows: vec![WorkflowContribution {
            id: "nvp.idea_to_script".into(),
            title: "Idea to screenplay".into(),
        }],
    };
    (manifest, vec![Arc::new(FixtureRead(descriptor))])
}
fn call(instance: Option<&str>) -> ToolInvocation {
    ToolInvocation {
        call_id: "film-fixture".into(),
        tool_id: TOOL_ID.into(),
        workspace_id: instance.map(str::to_string),
        input: ProtoPayload {
            type_url: "type.googleapis.com/lu.v1.CeReadRequest".into(),
            bytes: vec![],
        },
    }
}

#[tokio::test]
async fn nvp_workspace_must_be_active_and_host_authorized() {
    let host = WorkspaceHost::default();
    let (manifest, implementations) = fixture();
    host.register_workspace(manifest, implementations).unwrap();

    assert!(matches!(
        host.dispatch(call(Some("film-1")), &AllowReadOnly).await,
        Err(DispatchError::Denied(_))
    ));

    host.open_instance(MODULE_ID, "film-1").unwrap();
    assert!(matches!(
        host.dispatch(call(Some("film-1")), &Deny).await,
        Err(DispatchError::Denied(_))
    ));
    assert!(host.dispatch(call(Some("film-1")), &AllowReadOnly).await.is_ok());

    assert!(matches!(
        host.dispatch(call(None), &AllowReadOnly).await,
        Err(DispatchError::Denied(_))
    ));
    assert!(matches!(
        host.dispatch(call(Some("not-film-1")), &AllowReadOnly).await,
        Err(DispatchError::Denied(_))
    ));

    host.suspend_instance("film-1").unwrap();
    assert!(matches!(
        host.dispatch(call(Some("film-1")), &AllowReadOnly).await,
        Err(DispatchError::Denied(_))
    ));
    host.resume_instance("film-1").unwrap();
    assert!(host.dispatch(call(Some("film-1")), &AllowReadOnly).await.is_ok());

    assert!(matches!(
        host.unregister_workspace(MODULE_ID),
        Err(WorkspaceError::InstanceInUse(_))
    ));
    host.close_instance("film-1").unwrap();
    host.unregister_workspace(MODULE_ID).unwrap();
    assert!(host.instances().unwrap().is_empty());
}

#[tokio::test]
async fn nvp_workspace_rejects_wrong_proto_payload_type() {
    let host = WorkspaceHost::default();
    let (manifest, implementations) = fixture();
    host.register_workspace(manifest, implementations).unwrap();
    host.open_instance(MODULE_ID, "film-1").unwrap();
    let mut wrong = call(Some("film-1"));
    wrong.input.type_url = "type.googleapis.com/lu.v1.CeExecuteRequest".into();
    assert!(matches!(
        host.dispatch(wrong, &AllowReadOnly).await,
        Err(DispatchError::InputTypeMismatch { .. })
    ));
    host.close_instance("film-1").unwrap();
    host.unregister_workspace(MODULE_ID).unwrap();
}
