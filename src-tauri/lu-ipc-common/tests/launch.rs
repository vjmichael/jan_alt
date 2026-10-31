use lu_ipc_common::{
    authority::{HostAdmission, HostScope},
    launch::TrustedWorker,
    typed::proto::{tool_reply::Outcome, ReadTextFileRequest, ReadTextFileResult, ToolReply},
    Endpoint, Listener,
};
use prost::Message;
use sha2::{Digest, Sha256};
use std::{fs, io, path::{Path, PathBuf}, time::{Duration, Instant, SystemTime, UNIX_EPOCH}};

const INPUT: &str = "type.googleapis.com/lu.v1.ReadTextFileRequest";
const OUTPUT: &str = "type.googleapis.com/lu.v1.ReadTextFileResult";
const FIXTURE: &str = env!("CARGO_BIN_EXE_lu-ipc-worker-fixture");

struct Profile(PathBuf);
impl Profile {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "lu-b-{}-{:x}", std::process::id(),
            SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos(),
        ));
        fs::create_dir(&path).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o700)).unwrap();
        }
        Self(path)
    }
    fn endpoint(&self) -> Endpoint { Endpoint::new(self.0.join("s")).unwrap() }
}
impl Drop for Profile { fn drop(&mut self) { let _ = fs::remove_dir_all(&self.0); } }
fn scope() -> HostScope {
    HostScope::new("profile1", "workspace1", "conv1", "turn1", "read_text_file", "read").unwrap()
}
fn deadline() -> Instant { Instant::now() + Duration::from_secs(15) }
fn expected_digest(path: &Path) -> [u8; 32] {
    let bytes = fs::read(path).unwrap();
    Sha256::digest(bytes).into()
}
fn fixture_worker() -> TrustedWorker {
    TrustedWorker::attest(FIXTURE, expected_digest(Path::new(FIXTURE))).unwrap()
}
fn valid_reply() -> ToolReply {
    let result = ReadTextFileResult {
        content: "fixture-ok".into(), bytes_read: 10, truncated: false,
    };
    ToolReply {
        call_id: "call1".into(),
        output_type_url: OUTPUT.into(),
        outcome: Some(Outcome::Output(result.encode_to_vec())),
    }
}

#[test]
fn actual_child_receives_pipe_proof_and_completes_typed_host_exchange() {
    let private = Profile::new();
    let endpoint = private.endpoint();
    let listener = Listener::bind(endpoint.clone()).unwrap();
    let mut host = HostAdmission::new();
    let current = scope();
    let mut child = fixture_worker().launch(
        &mut host, current.clone(), &endpoint, Duration::from_secs(20),
    ).unwrap();
    assert_ne!(child.id(), 0);
    let mut admitted = host.admit(&listener, deadline()).unwrap();
    let call = admitted.read_host_bound_tool_call(&current, deadline(), "call1", INPUT).unwrap();
    let request = ReadTextFileRequest::decode(call.input.as_slice()).unwrap();
    assert_eq!(request.path, "sample.txt");
    assert_eq!(request.max_bytes, Some(128));
    admitted.write_host_bound_tool_reply(&current, &valid_reply(), "call1", OUTPUT).unwrap();
    assert!(child.wait_until(deadline()).unwrap().success());
}

#[test]
fn revocation_precedes_direct_child_termination() {
    let private = Profile::new();
    let endpoint = private.endpoint();
    let listener = Listener::bind(endpoint.clone()).unwrap();
    let mut host = HostAdmission::new();
    let current = scope();
    let mut child = fixture_worker().launch(
        &mut host, current.clone(), &endpoint, Duration::from_secs(20),
    ).unwrap();
    let mut admitted = host.admit(&listener, deadline()).unwrap();
    admitted.read_host_bound_tool_call(&current, deadline(), "call1", INPUT).unwrap();
    child.stop(deadline()).unwrap();
    assert_eq!(
        admitted.authorize(&current).unwrap_err().kind(),
        io::ErrorKind::PermissionDenied
    );
    assert!(child.try_wait().unwrap().is_some());
}

#[test]
fn digest_mismatch_and_relative_executable_are_denied_before_spawn() {
    let path = Path::new(FIXTURE);
    assert_eq!(
        TrustedWorker::attest(path, [0u8; 32]).err().unwrap().kind(),
        io::ErrorKind::PermissionDenied
    );
    assert_eq!(
        TrustedWorker::attest(Path::new("fake-worker"), [0u8; 32]).err().unwrap().kind(),
        io::ErrorKind::PermissionDenied
    );
}

#[test]
fn incomplete_or_forged_bootstrap_is_denied() {
    use lu_ipc_common::authority::ClientProof;
    assert!(ClientProof::receive_bootstrap(&b""[..]).is_err());
    assert!(ClientProof::receive_bootstrap(&b"LU-FAKE0\x00\x00"[..]).is_err());
    assert!(ClientProof::receive_bootstrap(&b"LU-BOOT1\xff\xff"[..]).is_err());
}
