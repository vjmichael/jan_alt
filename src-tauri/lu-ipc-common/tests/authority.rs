use lu_ipc_common::authority::{HostAdmission, HostScope};
use lu_ipc_common::{write_frame, Endpoint, Listener, Stream};
use std::fs;
use lu_ipc_common::typed::proto::{ToolCall, ToolReply, tool_reply::Outcome};
use prost::Message;
use std::io;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

struct TempEndpoint(PathBuf);
impl TempEndpoint {
    fn new(label: &str) -> Self {
        let root = std::env::temp_dir().join(format!(
            "lu-a-{label}-{}-{:x}",
            std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()
        ));
        fs::create_dir(&root).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).unwrap();
        }
        Self(root)
    }
    fn endpoint(&self) -> Endpoint {
        Endpoint::new(self.0.join("lu.sock")).unwrap()
    }
}
impl Drop for TempEndpoint {
    fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); }
}
fn scope() -> HostScope {
    HostScope::new("profile1", "workspace1", "conv1", "turn1", "read_text_file", "read").unwrap()
}
fn until() -> Instant { Instant::now() + Duration::from_secs(3) }

const INPUT: &str = "type.googleapis.com/lu.v1.ReadTextFileRequest";
const OUTPUT: &str = "type.googleapis.com/lu.v1.ReadTextFileResult";
fn typed_call() -> ToolCall {
    ToolCall {
        contract_version: 1, call_id: "call1".into(),
        tool_id: "read_text_file".into(), workspace_id: Some("workspace1".into()),
        input_type_url: INPUT.into(), input: vec![0x0a, 0x01, b'a'],
    }
}
fn typed_reply() -> ToolReply {
    ToolReply {
        call_id: "call1".into(), output_type_url: OUTPUT.into(),
        outcome: Some(Outcome::Output(vec![0x0a, 0x02, b'o', b'k'])),
    }
}


#[test]
fn legitimate_one_shot_proof_and_host_checked_tool_frame() {
    let dir = TempEndpoint::new("accepted");
    let ep = dir.endpoint();
    let listener = Listener::bind(ep.clone()).unwrap();
    let host_scope = scope();
    let mut host = HostAdmission::new();
    let (proof, revoker) = host.issue(host_scope.clone(), Duration::from_secs(5)).unwrap();
    let server = thread::spawn(move || {
        let mut peer = host.admit(&listener, until()).unwrap();
        assert_eq!(peer.scope(), &host_scope);
        let call = peer.read_host_bound_tool_call(&host_scope, until(), "call1", INPUT).unwrap();
        assert_eq!(call, typed_call());
        peer.write_host_bound_tool_reply(&host_scope, &typed_reply(), "call1", OUTPUT).unwrap();
    });
    let mut client = proof.prove(Stream::connect(&ep).unwrap()).unwrap();
    write_frame(&mut client, &typed_call().encode_to_vec()).unwrap();
    let reply = ToolReply::decode(client.read_frame_until(until()).unwrap().as_slice()).unwrap();
    assert_eq!(reply, typed_reply());
    server.join().unwrap();
    assert!(!revoker.is_revoked());
}
#[test]
fn host_scope_changes_and_explicit_revoke_are_fail_closed() {
    let dir = TempEndpoint::new("revoke");
    let ep = dir.endpoint();
    let listener = Listener::bind(ep.clone()).unwrap();
    let original = scope();
    let mut host = HostAdmission::new();
    let (proof, revoke) = host.issue(original.clone(), Duration::from_secs(5)).unwrap();
    let (ready_tx, ready_rx) = std::sync::mpsc::channel();
    let server = thread::spawn(move || {
        let peer = host.admit(&listener, until()).unwrap();
        for wrong in [
            HostScope::new("other", "workspace1", "conv1", "turn1", "read_text_file", "read").unwrap(),
            HostScope::new("profile1", "other", "conv1", "turn1", "read_text_file", "read").unwrap(),
            HostScope::new("profile1", "workspace1", "other", "turn1", "read_text_file", "read").unwrap(),
            HostScope::new("profile1", "workspace1", "conv1", "other", "read_text_file", "read").unwrap(),
            HostScope::new("profile1", "workspace1", "conv1", "turn1", "other", "read").unwrap(),
            HostScope::new("profile1", "workspace1", "conv1", "turn1", "read_text_file", "write").unwrap(),
        ] {
            assert_eq!(peer.authorize(&wrong).unwrap_err().kind(), io::ErrorKind::PermissionDenied);
        }
        assert!(peer.authorize(&original).is_ok());
        ready_tx.send(()).unwrap();
        // The test must not execute a tool; only the security gate is checked.
        loop {
            if peer.authorize(&original).is_err() { break; }
            thread::yield_now();
        }
        assert_eq!(peer.authorize(&original).unwrap_err().kind(), io::ErrorKind::PermissionDenied);
    });
    let _client = proof.prove(Stream::connect(&ep).unwrap()).unwrap();
    ready_rx.recv_timeout(Duration::from_secs(2)).unwrap();
    revoke.revoke();
    server.join().unwrap();
}
#[test]
fn fake_proof_does_not_consume_a_valid_grant() {
    let dir = TempEndpoint::new("spoof");
    let ep = dir.endpoint();
    let listener = Listener::bind(ep.clone()).unwrap();
    let mut host = HostAdmission::new();
    let (proof, _) = host.issue(scope(), Duration::from_secs(5)).unwrap();
    let server = thread::spawn(move || {
        assert_eq!(host.admit(&listener, until()).err().unwrap().kind(), io::ErrorKind::PermissionDenied);
        let _authorized = host.admit(&listener, until()).unwrap();
    });
    let mut attacker = Stream::connect(&ep).unwrap();
    let mut bad = b"LUIPC1:".to_vec();
    bad.extend_from_slice(&[0u8; 32]);
    write_frame(&mut attacker, &bad).unwrap();
    drop(attacker);
    // First admit must complete before genuine proof's connection.
    thread::sleep(Duration::from_millis(40));
    let _valid = proof.prove(Stream::connect(&ep).unwrap()).unwrap();
    server.join().unwrap();
}
#[test]
fn ttl_and_invalid_scope_rejected_without_dispatch() {
    assert!(HostScope::new("", "ws", "conv", "turn", "tool", "read").is_err());
    assert!(HostScope::new("p", "ws", "conv", "../turn", "tool", "read").is_err());
    let mut host = HostAdmission::new();
    assert!(host.issue(scope(), Duration::ZERO).is_err());
    assert!(host.issue(scope(), Duration::from_secs(61)).is_err());
    let dir = TempEndpoint::new("expired");
    let ep = dir.endpoint();
    let listener = Listener::bind(ep.clone()).unwrap();
    let (proof, _) = host.issue(scope(), Duration::from_millis(10)).unwrap();
    thread::sleep(Duration::from_millis(30));
    let server = thread::spawn(move || {
        assert_eq!(host.admit(&listener, until()).err().unwrap().kind(), io::ErrorKind::PermissionDenied);
    });
    assert!(proof.prove(Stream::connect(&ep).unwrap()).is_err());
    server.join().unwrap();
}
#[test]
fn host_validator_can_reject_mismatched_tool_payload() {
    let dir = TempEndpoint::new("validator");
    let ep = dir.endpoint();
    let listener = Listener::bind(ep.clone()).unwrap();
    let mut host = HostAdmission::new();
    let granted_scope = scope();
    let (proof, _) = host.issue(granted_scope.clone(), Duration::from_secs(5)).unwrap();
    let server = thread::spawn(move || {
        let mut peer = host.admit(&listener, until()).unwrap();
        assert_eq!(
            peer.read_host_bound_tool_call(&granted_scope, until(), "call1", INPUT)
                .unwrap_err().kind(),
            io::ErrorKind::PermissionDenied
        );
    });
    let mut client = proof.prove(Stream::connect(&ep).unwrap()).unwrap();
    let mut forged = typed_call();
    forged.tool_id = "write_file".into();
    write_frame(&mut client, &forged.encode_to_vec()).unwrap();
    server.join().unwrap();
}
