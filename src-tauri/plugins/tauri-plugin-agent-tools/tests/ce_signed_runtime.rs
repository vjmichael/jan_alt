#![cfg(target_os = "linux")]

use std::{process::Command, sync::Arc, time::Duration};

use ed25519_dalek::{Signer, SigningKey};
use lu_core::{
    AuthorizationError, AuthorizedCapability, BoundCallOrigin, CeExecutableStager, CeGrantRequest,
    CePermissionStore, CePublisherKeyEnrollment, CePublisherTrust, CeResourceBroker,
    ConversationAuthority, ProtoPayload, TaskAuthority, ToolAuthorizer, ToolDescriptor, ToolEffect,
    ToolInvocation, TrustedUserTurnVerifier,
};
use sha2::{Digest, Sha256};
use tauri_plugin_agent_tools::tools::{
    ce_signed_runtime::{SignedCeRuntime, SignedRuntimeError},
    jail::{self, Backend},
};

struct Verified;
impl TrustedUserTurnVerifier for Verified {
    fn verify_user_turn(&self, _: &str, turn: &str) -> bool {
        turn == "real-human-turn"
    }
}
struct Allow;
impl ToolAuthorizer for Allow {
    fn authorize(&self, _: &ToolInvocation, _: &ToolDescriptor) -> Result<(), AuthorizationError> {
        Ok(())
    }
}

const WORKER: &str = r###"
use std::io::{self, Read, Write};
fn read_frame() -> Vec<u8> {
    let mut stdin = io::stdin();
    let mut size = [0u8; 4];
    stdin.read_exact(&mut size).unwrap();
    let len = u32::from_be_bytes(size) as usize;
    assert!(len < 65536);
    let mut bytes = vec![0u8;len];
    stdin.read_exact(&mut bytes).unwrap();
    bytes
}
fn var(mut value:u64) -> Vec<u8> {
    let mut out = Vec::new();
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 { byte |= 0x80; }
        out.push(byte);
        if value == 0 { break; }
    }
    out
}
fn uint(tag:u8,value:u64) -> Vec<u8> {
    let mut bytes = vec![tag << 3];
    bytes.extend(var(value));
    bytes
}
fn field(tag:u8,bytes:&[u8]) -> Vec<u8> {
    let mut out = vec![(tag << 3) | 2];
    out.extend(var(bytes.len() as u64));
    out.extend(bytes);
    out
}
fn send(kind:u8,body:Vec<u8>) {
    // Canonical prost-compatible CeWorkerFrame: version then oneof message.
    let mut bytes = uint(1,1);
    bytes.extend(field(kind,&body));
    let mut stdout = io::stdout();
    stdout.write_all(&(bytes.len() as u32).to_be_bytes()).unwrap();
    stdout.write_all(&bytes).unwrap();
    stdout.flush().unwrap();
}
fn main() {
    let invoke = read_frame();
    if invoke.windows(b"acme.worker.hold".len())
        .any(|s| s==b"acme.worker.hold") {
        loop { std::thread::sleep(std::time::Duration::from_millis(100)); }
    }
    // The real host targets must remain unreachable from a signed worker.
    let secret: &str = __SECRET__;
    let target: std::net::SocketAddr = __TARGET__.parse().unwrap();
    assert!(std::fs::read(secret).is_err(), "worker reached host secret");
    assert!(std::net::TcpStream::connect_timeout(
        &target, std::time::Duration::from_millis(150)).is_err(),
        "worker reached host loopback");
    let mut request = uint(1,1);
    request.extend(field(2,b"acme.worker.read"));
    request.extend(field(3,b"input.txt"));
    send(3,request);
    let reply = read_frame();
    assert!(reply.windows(4).any(|bytes|bytes==b"safe"));
    let mut result = field(1,b"type.googleapis.com/lu.v1.CeOutput");
    result.extend(field(2,b"safe"));
    send(6,result);
}
"###;

fn descriptor(id: &str, effect: ToolEffect) -> ToolDescriptor {
    ToolDescriptor {
        id: id.into(),
        display_name: id.into(),
        effect,
        input_type_url: "type.googleapis.com/lu.v1.CeInput".into(),
        output_type_url: "type.googleapis.com/lu.v1.CeOutput".into(),
    }
}
fn call(id: &str) -> ToolInvocation {
    ToolInvocation {
        call_id: "call".into(),
        tool_id: id.into(),
        workspace_id: Some("scope".into()),
        input: ProtoPayload {
            type_url: "type.googleapis.com/lu.v1.CeInput".into(),
            bytes: vec![],
        },
    }
}

#[tokio::test]
async fn signed_worker_reads_only_through_host_broker_and_revoke_cancels() {
    let root = std::env::temp_dir().join(format!("lu_signed_worker_{}", std::process::id()));
    let workspace = root.join("workspace");
    let stage_root = root.join("staged");
    std::fs::create_dir_all(&workspace).unwrap();
    std::fs::create_dir_all(&stage_root).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        for dir in [&root, &workspace, &stage_root] {
            std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
    }
    std::fs::write(workspace.join("input.txt"), b"safe").unwrap();
    let secret = root.join("outside-secret");
    std::fs::write(&secret, b"never read").unwrap();
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let target = listener.local_addr().unwrap();

    let source = root.join("worker.rs");
    let exe = root.join("worker-unsigned");
    let fixture = WORKER
        .replace("__SECRET__", &format!("{:?}", secret.to_string_lossy()))
        .replace("__TARGET__", &format!("{:?}", target.to_string()));
    std::fs::write(&source, fixture).unwrap();
    let status = Command::new("rustc")
        .args(["--edition=2021", "-C", "opt-level=0"])
        .arg("-o")
        .arg(&exe)
        .arg(&source)
        .status()
        .unwrap();
    assert!(status.success(), "compile native worker fixture");
    let bytes = std::fs::read(&exe).unwrap();
    let signing = SigningKey::from_bytes(&[77u8; 32]);
    let mut trust = CePublisherTrust::new();
    trust
        .pin_key(
            "test-key",
            "Publisher",
            signing.verifying_key().to_bytes(),
            0,
            u64::MAX,
        )
        .unwrap();
    let manifest = serde_json::json!({
        "format_version":1,"id":"acme.worker","version":"1.0.0",
        "contract_version":1,"publisher":"Publisher",
        "artifact_sha256":format!("{:x}",Sha256::digest(&bytes)),
        "dependencies":[],"tools":["acme.worker.execute","acme.worker.read","acme.worker.hold"]
    })
    .to_string();
    let mut message = b"Lu-CE-Signed-Manifest-v1\0".to_vec();
    message.extend_from_slice(&(8u32).to_be_bytes());
    message.extend_from_slice(b"test-key");
    message.extend_from_slice(&(manifest.len() as u32).to_be_bytes());
    message.extend_from_slice(manifest.as_bytes());
    let sig = signing.sign(&message);
    let envelope = serde_json::json!({
        "format_version":1,"key_id":"test-key","manifest_json":manifest,
        "signature_hex":sig.to_bytes().iter().map(|b|format!("{b:02x}")).collect::<String>()
    })
    .to_string();
    let verified = trust.verify_at(&envelope, &bytes, 200).unwrap();
    let staged = CeExecutableStager::new(&stage_root)
        .unwrap()
        .stage(verified.clone())
        .unwrap();
    assert!(staged.verify_on_disk().is_ok());

    let authority = ConversationAuthority::new();
    let origin = BoundCallOrigin {
        conversation_id: "conversation".into(),
        user_turn_id: "real-human-turn".into(),
        task_id: "task".into(),
    };
    let descriptors = vec![
        descriptor("acme.worker.execute", ToolEffect::ExecuteCode),
        descriptor("acme.worker.read", ToolEffect::ReadWorkspace),
        descriptor("acme.worker.hold", ToolEffect::ExecuteCode),
    ];
    authority
        .open_user_task(
            TaskAuthority {
                conversation_id: origin.conversation_id.clone(),
                user_turn_id: origin.user_turn_id.clone(),
                task_id: origin.task_id.clone(),
                execution_scope_id: "scope".into(),
                capabilities: descriptors
                    .iter()
                    .map(|d| AuthorizedCapability {
                        tool_id: d.id.clone(),
                        effect: d.effect,
                    })
                    .collect(),
                expires_at: None,
            },
            &Verified,
        )
        .unwrap();
    let permissions = CePermissionStore::open(&root.join("grants.db")).unwrap();
    permissions
        .enroll_publisher_key(&CePublisherKeyEnrollment {
            key_id: "test-key".into(),
            publisher: "Publisher".into(),
            public_key: signing.verifying_key().to_bytes(),
            not_before: 0,
            expires_at: i64::MAX,
        })
        .unwrap();
    for d in &descriptors {
        permissions
            .approve(
                &verified,
                &CeGrantRequest {
                    profile_id: "profile".into(),
                    scope_id: "scope".into(),
                    tool_id: d.id.clone(),
                    effect: d.effect,
                    approved_user_turn_id: "real-human-turn".into(),
                    expires_at: i64::MAX,
                },
            )
            .unwrap();
    }
    let broker = Arc::new(
        CeResourceBroker::new(
            authority.clone(),
            Arc::new(Allow),
            permissions.clone(),
            verified,
            "profile".into(),
            "scope".into(),
            &workspace,
        )
        .unwrap(),
    );
    let runtime = SignedCeRuntime::new(staged, broker, descriptors).unwrap();

    if jail::backend() != Backend::Bubblewrap || unsafe { nix::libc::geteuid() } == 0 {
        assert!(matches!(
            runtime.start(&origin, &call("acme.worker.execute")),
            Err(SignedRuntimeError::NoSandbox)
        ));
        eprintln!("signed CE: no usable unprivileged bubblewrap; fail-closed confirmed");
        assert!(
            std::env::var_os("LU_CE_REQUIRE_SANDBOX").is_none(),
            "required Linux CE OS sandbox unavailable: real execution not verified"
        );
    } else {
        let ticket = runtime
            .start(&origin, &call("acme.worker.execute"))
            .unwrap();
        let result = tokio::time::timeout(Duration::from_secs(18), ticket.result())
            .await
            .expect("worker deadline")
            .expect("brokered signed worker");
        assert_eq!(result, b"safe");
        let hold = runtime.start(&origin, &call("acme.worker.hold")).unwrap();
        // A publisher-wide key revocation closes the same broker grant and
        // synchronously cancels this already-running, isolated process.
        assert_eq!(permissions.revoke_publisher_key("test-key").unwrap(), 1);
        assert!(matches!(
            hold.result().await,
            Err(SignedRuntimeError::Cancelled)
        ));
        assert!(matches!(
            runtime.start(&origin, &call("acme.worker.execute")),
            Err(SignedRuntimeError::PermissionDenied)
        ));
    }
    drop(runtime);
    drop(permissions);
    std::fs::remove_dir_all(&root).unwrap();
}
