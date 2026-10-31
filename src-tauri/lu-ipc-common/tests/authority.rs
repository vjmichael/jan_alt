use lu_ipc_common::authority::{HostAdmission, HostScope};
use lu_ipc_common::{write_frame, Endpoint, Listener, Stream};
use std::fs;
use std::io;
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

struct TempEndpoint(PathBuf);
impl TempEndpoint {
    fn new(label: &str) -> Self {
        let root = std::env::temp_dir().join(format!(
            "lu-ipc-authority-{label}-{}-{}",
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
        let bytes = peer.read_checked_call(&host_scope, until(), |data, bound| {
            assert_eq!(data, b"protobuf-tool-call");
            assert_eq!(bound.tool_id(), "read_text_file");
            Ok(())
        }).unwrap();
        assert_eq!(bytes, b"protobuf-tool-call");
        peer.write_checked_reply(&host_scope, b"protobuf-tool-reply").unwrap();
    });
    let mut client = proof.prove(Stream::connect(&ep).unwrap()).unwrap();
    write_frame(&mut client, b"protobuf-tool-call").unwrap();
    assert_eq!(client.read_frame_until(until()).unwrap(), b"protobuf-tool-reply");
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
        // The test must not execute a tool; only the security gate is checked.
        loop {
            if peer.authorize(&original).is_err() { break; }
            thread::yield_now();
        }
        assert_eq!(peer.authorize(&original).unwrap_err().kind(), io::ErrorKind::PermissionDenied);
    });
    let _client = proof.prove(Stream::connect(&ep).unwrap()).unwrap();
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
            peer.read_checked_call(&granted_scope, until(), |_bytes, _| Err(io::Error::new(
                io::ErrorKind::PermissionDenied, "Lu Protobuf contract rejected"
            ))).unwrap_err().kind(),
            io::ErrorKind::PermissionDenied
        );
    });
    let mut client = proof.prove(Stream::connect(&ep).unwrap()).unwrap();
    write_frame(&mut client, b"forged protobuf").unwrap();
    server.join().unwrap();
}
