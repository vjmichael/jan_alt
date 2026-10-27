#![cfg(target_os = "linux")]

use std::{path::Path, process::Command, sync::Arc, time::Duration};

use ed25519_dalek::{Signer, SigningKey};
use lu_core::{
    AuthorizedCapability, AuthorizationError, BoundCallOrigin, CeExecutableStager,
    CeGrantRequest, CePermissionStore, CePublisherTrust, CeResourceBroker,
    ConversationAuthority, ProtoPayload, TaskAuthority, ToolAuthorizer, ToolDescriptor,
    ToolEffect, ToolInvocation, TrustedUserTurnVerifier,
};
use sha2::{Digest, Sha256};
use tauri_plugin_agent_tools::tools::{
    ce_signed_runtime::{SignedCeRuntime, SignedRuntimeError},
    jail::{self, Backend},
};

struct Verified;
impl TrustedUserTurnVerifier for Verified {
    fn verify_user_turn(&self, _: &str, turn: &str) -> bool { turn == "real-human-turn" }
}
struct Allow;
impl ToolAuthorizer for Allow {
    fn authorize(&self, _: &ToolInvocation, _: &ToolDescriptor) -> Result<(), AuthorizationError> {
        Ok(())
    }
}

const WORKER: &str = r###"
use std::io::{self, Read, Write};
fn read_frame() -> String {
    let mut stdin = io::stdin();
    let mut size = [0u8; 4];
    stdin.read_exact(&mut size).unwrap();
    let len = u32::from_be_bytes(size) as usize;
    assert!(len < 65536);
    let mut bytes = vec![0u8;len];
    stdin.read_exact(&mut bytes).unwrap();
    String::from_utf8(bytes).unwrap()
}
fn send(s: &str) {
    let mut stdout = io::stdout();
    stdout.write_all(&(s.len() as u32).to_be_bytes()).unwrap();
    stdout.write_all(s.as_bytes()).unwrap();
    stdout.flush().unwrap();
}
fn main() {
    let invoke = read_frame();
    if invoke.contains("acme.worker.hold") {
        loop { std::thread::sleep(std::time::Duration::from_millis(100)); }
    }
    send(r#"{"kind":"read","request_id":1,"tool_id":"acme.worker.read","path":"input.txt"}"#);
    let reply = read_frame();
    assert!(reply.contains(r#""ok":true"#));
    assert!(reply.contains("c2FmZQ=="));
    send(r#"{"kind":"result","type_url":"type.googleapis.com/lu.v1.CeOutput","bytes_b64":"c2FmZQ=="}"#);
}
"###;

fn descriptor(id: &str, effect: ToolEffect) -> ToolDescriptor {
    ToolDescriptor {
        id:id.into(),display_name:id.into(),effect,
        input_type_url:"type.googleapis.com/lu.v1.CeInput".into(),
        output_type_url:"type.googleapis.com/lu.v1.CeOutput".into(),
    }
}
fn call(id: &str) -> ToolInvocation {
    ToolInvocation {
        call_id:"call".into(),tool_id:id.into(),workspace_id:Some("scope".into()),
        input:ProtoPayload { type_url:"type.googleapis.com/lu.v1.CeInput".into(),bytes:vec![] },
    }
}

#[tokio::test]
async fn signed_worker_reads_only_through_host_broker_and_revoke_cancels() {
    let root = std::env::temp_dir().join(format!("lu_signed_worker_{}",std::process::id()));
    let workspace = root.join("workspace");
    let stage_root = root.join("staged");
    std::fs::create_dir_all(&workspace).unwrap();
    std::fs::create_dir_all(&stage_root).unwrap();
    std::fs::write(workspace.join("input.txt"),b"safe").unwrap();
    std::fs::write(root.join("outside-secret"),b"never read").unwrap();

    let source = root.join("worker.rs");
    let exe = root.join("worker-unsigned");
    std::fs::write(&source,WORKER).unwrap();
    let status = Command::new("rustc").args(["--edition=2021","-C","opt-level=0"])
        .arg("-o").arg(&exe).arg(&source).status().unwrap();
    assert!(status.success(),"compile native worker fixture");
    let bytes = std::fs::read(&exe).unwrap();
    let signing = SigningKey::from_bytes(&[77u8;32]);
    let mut trust = CePublisherTrust::new();
    trust.pin_key("test-key","Publisher",signing.verifying_key().to_bytes(),0,u64::MAX).unwrap();
    let manifest = serde_json::json!({
        "format_version":1,"id":"acme.worker","version":"1.0.0",
        "contract_version":1,"publisher":"Publisher",
        "artifact_sha256":format!("{:x}",Sha256::digest(&bytes)),
        "dependencies":[],"tools":["acme.worker.execute","acme.worker.read","acme.worker.hold"]
    }).to_string();
    let mut message = b"Lu-CE-Signed-Manifest-v1\0".to_vec();
    message.extend_from_slice(&(8u32).to_be_bytes());
    message.extend_from_slice(b"test-key");
    message.extend_from_slice(&(manifest.len() as u32).to_be_bytes());
    message.extend_from_slice(manifest.as_bytes());
    let sig = signing.sign(&message);
    let envelope = serde_json::json!({
        "format_version":1,"key_id":"test-key","manifest_json":manifest,
        "signature_hex":sig.to_bytes().iter().map(|b|format!("{b:02x}")).collect::<String>()
    }).to_string();
    let verified = trust.verify_at(&envelope,&bytes,200).unwrap();
    let staged = CeExecutableStager::new(&stage_root).unwrap().stage(verified.clone()).unwrap();
    assert!(staged.verify_on_disk().is_ok());

    let authority = ConversationAuthority::new();
    let origin = BoundCallOrigin {
        conversation_id:"conversation".into(),user_turn_id:"real-human-turn".into(),task_id:"task".into()
    };
    let descriptors = vec![
        descriptor("acme.worker.execute",ToolEffect::ExecuteCode),
        descriptor("acme.worker.read",ToolEffect::ReadWorkspace),
        descriptor("acme.worker.hold",ToolEffect::ExecuteCode),
    ];
    authority.open_user_task(TaskAuthority {
        conversation_id:origin.conversation_id.clone(),user_turn_id:origin.user_turn_id.clone(),
        task_id:origin.task_id.clone(),execution_scope_id:"scope".into(),
        capabilities:descriptors.iter().map(|d| AuthorizedCapability {
            tool_id:d.id.clone(),effect:d.effect
        }).collect(),expires_at:None,
    },&Verified).unwrap();
    let permissions = CePermissionStore::open(&root.join("grants.db")).unwrap();
    for d in &descriptors {
        permissions.approve(&verified,&CeGrantRequest {
            profile_id:"profile".into(),scope_id:"scope".into(),tool_id:d.id.clone(),
            effect:d.effect,approved_user_turn_id:"real-human-turn".into(),expires_at:i64::MAX,
        }).unwrap();
    }
    let broker = Arc::new(CeResourceBroker::new(authority.clone(),Arc::new(Allow),
        permissions.clone(),verified,"profile".into(),"scope".into(),&workspace).unwrap());
    let runtime = SignedCeRuntime::new(staged,broker,descriptors).unwrap();

    if jail::backend() != Backend::Bubblewrap || unsafe { nix::libc::geteuid() } == 0 {
        assert!(matches!(runtime.start(&origin,&call("acme.worker.execute")),
            Err(SignedRuntimeError::NoSandbox)));
        eprintln!("signed CE: no usable unprivileged bubblewrap; fail-closed confirmed");
    } else {
        let ticket = runtime.start(&origin,&call("acme.worker.execute")).unwrap();
        let result = tokio::time::timeout(Duration::from_secs(18),ticket.result()).await
            .expect("worker deadline").expect("brokered signed worker");
        assert_eq!(result,b"safe");
        let hold = runtime.start(&origin,&call("acme.worker.hold")).unwrap();
        permissions.revoke("profile","acme.worker","scope",Some("acme.worker.read")).unwrap();
        assert!(matches!(hold.result().await,Err(SignedRuntimeError::Cancelled)));
    }
    drop(runtime);
    drop(permissions);
    std::fs::remove_dir_all(&root).unwrap();
}
