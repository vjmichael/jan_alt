//! Typed Lu Protobuf envelope gate. Generated from the *canonical* lu-core
//! proto schema, not a manually copied or JSON-compatible shadow schema.
//! A trusted host must still validate per-tool input payload and journal each
//! authorized effect before invoking a native registry entry.
use crate::{authority::HostScope, MAX_FRAME};
use prost::Message;
use std::io;

pub mod proto {
    include!(concat!(env!("OUT_DIR"), "/lu.v1.rs"));
}

fn rejected() -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, "Lu host-bound Protobuf denied")
}
fn valid_type_url(value: &str) -> bool {
    value.starts_with("type.googleapis.com/") && value.len() <= 512
}

/// Decode and enforce the host's immutable call identity, catalog-selected
/// input schema, exact workspace, contract version, and canonical encoding.
/// The socket peer cannot select another tool, turn, profile or workspace.
pub fn decode_host_bound_call(
    bytes: &[u8],
    scope: &HostScope,
    expected_call_id: &str,
    expected_type_url: &str,
) -> io::Result<proto::ToolCall> {
    if bytes.is_empty()
        || bytes.len() > MAX_FRAME
        || expected_call_id.is_empty()
        || expected_call_id.len() > 128
        || !valid_type_url(expected_type_url)
    {
        return Err(rejected());
    }
    let call = proto::ToolCall::decode(bytes).map_err(|_| rejected())?;
    if call.encode_to_vec() != bytes
        || call.contract_version != 1
        || call.call_id != expected_call_id
        || call.tool_id != scope.tool_id()
        || call.workspace_id.as_deref() != Some(scope.workspace_id())
        || call.input_type_url != expected_type_url
    {
        return Err(rejected());
    }
    Ok(call)
}

/// Encode a host-checked reply. Failure details must be reduced to a stable
/// code and cannot carry arbitrary worker error messages (paths or secrets).
/// Output schema is selected by the trusted host registry, not by the worker.
pub fn encode_host_bound_reply(
    reply: &proto::ToolReply,
    expected_call_id: &str,
    expected_output_type_url: &str,
) -> io::Result<Vec<u8>> {
    if reply.call_id != expected_call_id || !valid_type_url(expected_output_type_url) {
        return Err(rejected());
    }
    match reply.outcome.as_ref() {
        Some(proto::tool_reply::Outcome::Output(_))
            if reply.output_type_url == expected_output_type_url => {}
        Some(proto::tool_reply::Outcome::Failure(error))
            if reply.output_type_url.is_empty()
                && !error.code.is_empty()
                && error.code.len() <= 64
                && error.code.bytes().all(|byte| byte.is_ascii_uppercase()
                    || byte.is_ascii_digit() || byte == b'_')
                && error.message.is_empty() => {}
        _ => return Err(rejected()),
    }
    let bytes = reply.encode_to_vec();
    if bytes.is_empty() || bytes.len() > MAX_FRAME { return Err(rejected()); }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scope() -> HostScope {
        HostScope::new("p", "w", "conversation", "turn", "read_text_file", "read").unwrap()
    }
    fn call() -> proto::ToolCall {
        proto::ToolCall {
            contract_version: 1,
            call_id: "call".into(),
            tool_id: "read_text_file".into(),
            workspace_id: Some("w".into()),
            input_type_url: "type.googleapis.com/lu.v1.ReadTextFileRequest".into(),
            input: vec![0x0a, 0x01, b'a'],
        }
    }
    fn decode(bytes: &[u8]) -> io::Result<proto::ToolCall> {
        decode_host_bound_call(
            bytes, &scope(), "call",
            "type.googleapis.com/lu.v1.ReadTextFileRequest"
        )
    }
    #[test]
    fn legitimate_generated_schema_roundtrip() {
        let original = call();
        assert_eq!(decode(&original.encode_to_vec()).unwrap(), original);
    }
    #[test]
    fn rejects_wrong_version_tool_workspace_call_id_and_type() {
        let mut c = call();
        c.contract_version = 2; assert!(decode(&c.encode_to_vec()).is_err());
        c = call(); c.tool_id = "write_file".into(); assert!(decode(&c.encode_to_vec()).is_err());
        c = call(); c.workspace_id = None; assert!(decode(&c.encode_to_vec()).is_err());
        c = call(); c.workspace_id = Some("other".into()); assert!(decode(&c.encode_to_vec()).is_err());
        c = call(); c.call_id = "other".into(); assert!(decode(&c.encode_to_vec()).is_err());
        c = call(); c.input_type_url = "type.googleapis.com/lu.v1.CeExecuteRequest".into();
        assert!(decode(&c.encode_to_vec()).is_err());
    }
    #[test]
    fn rejects_unknown_duplicate_noncanonical_and_oversized_frames() {
        let mut unknown = call().encode_to_vec();
        unknown.extend_from_slice(&[0x78, 0x01]);
        assert!(decode(&unknown).is_err());
        let mut duplicate = call().encode_to_vec();
        duplicate.extend_from_slice(&[0x08, 0x01]);
        assert!(decode(&duplicate).is_err());
        assert!(decode(&vec![0; MAX_FRAME + 1]).is_err());
        assert!(decode(&[0xff, 0xff]).is_err());
    }
    #[test]
    fn reply_rejects_worker_chosen_type_or_sensitive_failure_text() {
        let mut reply = proto::ToolReply {
            call_id: "call".into(),
            output_type_url: "type.googleapis.com/lu.v1.ReadTextFileResult".into(),
            outcome: Some(proto::tool_reply::Outcome::Output(vec![0x0a, 0x02, b'o', b'k'])),
        };
        let expected = "type.googleapis.com/lu.v1.ReadTextFileResult";
        assert!(encode_host_bound_reply(&reply, "call", expected).is_ok());
        reply.output_type_url = "type.googleapis.com/lu.v1.CeWriteResult".into();
        assert!(encode_host_bound_reply(&reply, "call", expected).is_err());
        reply.output_type_url.clear();
        reply.outcome = Some(proto::tool_reply::Outcome::Failure(proto::ToolError {
            code: "DENIED".into(), message: "C:\\private\\secret".into(), retryable: false
        }));
        assert!(encode_host_bound_reply(&reply, "call", expected).is_err());
        if let Some(proto::tool_reply::Outcome::Failure(error)) = reply.outcome.as_mut() {
            error.message.clear();
        }
        assert!(encode_host_bound_reply(&reply, "call", expected).is_ok());
    }
}
