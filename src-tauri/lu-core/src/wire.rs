//! Protobuf serialization at Lu-internal boundaries.
//!
//! Typed Protobuf frames are encoded and decoded here. Incoming message type
//! names are checked before tool dispatch; full per-tool payload verification
//! happens in each generated-schema tool adapter. This is deliberately not a
//! converter from arbitrary JSON into arbitrary Protobuf bytes.

use prost::Message;

use crate::contracts::{ProtoPayload, ToolInvocation, ToolOutput, CORE_CONTRACT_VERSION};
use crate::registry::{DispatchError, ToolResponse};

pub mod proto {
    include!(concat!(env!("OUT_DIR"), "/lu.v1.rs"));
}

pub const MAX_CALL_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_REPLY_BYTES: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WireError {
    Oversized,
    Decode(String),
    MissingField(&'static str),
    UnsupportedContractVersion(u32),
    InvalidTypeUrl,
}

fn check_type(s: &str) -> Result<(), WireError> {
    if !s.starts_with("type.googleapis.com/") || s.len() > 512 {
        return Err(WireError::InvalidTypeUrl);
    }
    Ok(())
}

pub fn encode_invocation(inv: &ToolInvocation) -> Result<Vec<u8>, WireError> {
    check_type(&inv.input.type_url)?;
    if inv.call_id.trim().is_empty() {
        return Err(WireError::MissingField("call_id"));
    }
    if inv.tool_id.trim().is_empty() {
        return Err(WireError::MissingField("tool_id"));
    }
    let call = proto::ToolCall {
        contract_version: u32::from(CORE_CONTRACT_VERSION),
        call_id: inv.call_id.clone(),
        tool_id: inv.tool_id.clone(),
        workspace_id: inv.workspace_id.clone(),
        input_type_url: inv.input.type_url.clone(),
        input: inv.input.bytes.clone(),
    };
    if call.encoded_len() > MAX_CALL_BYTES {
        return Err(WireError::Oversized);
    }
    Ok(call.encode_to_vec())
}

pub fn decode_invocation(frame: &[u8]) -> Result<ToolInvocation, WireError> {
    if frame.len() > MAX_CALL_BYTES {
        return Err(WireError::Oversized);
    }
    let call = proto::ToolCall::decode(frame).map_err(|e| WireError::Decode(e.to_string()))?;
    if call.contract_version != u32::from(CORE_CONTRACT_VERSION) {
        return Err(WireError::UnsupportedContractVersion(call.contract_version));
    }
    if call.call_id.trim().is_empty() {
        return Err(WireError::MissingField("call_id"));
    }
    if call.tool_id.trim().is_empty() {
        return Err(WireError::MissingField("tool_id"));
    }
    check_type(&call.input_type_url)?;
    Ok(ToolInvocation {
        call_id: call.call_id,
        tool_id: call.tool_id,
        workspace_id: call.workspace_id,
        input: ProtoPayload {
            type_url: call.input_type_url,
            bytes: call.input,
        },
    })
}

fn dispatch_error(error: &DispatchError) -> proto::ToolError {
    let (code, retryable) = match error {
        DispatchError::UnknownTool(_) => ("UNKNOWN_TOOL", false),
        DispatchError::ModuleDraining(_) => ("EXTENSION_DRAINING", true),
        DispatchError::InvalidCallId => ("INVALID_CALL", false),
        DispatchError::WorkspaceRequired(_) => ("WORKSPACE_REQUIRED", false),
        DispatchError::InputTypeMismatch { .. } => ("INPUT_TYPE_MISMATCH", false),
        DispatchError::Denied(_) => ("DENIED", false),
        DispatchError::ProtectedEffect(_) => ("PRIVILEGE_BLOCKED", false),
        DispatchError::Execution(e) => (&*e.code, e.retryable),
        DispatchError::Poisoned => ("REGISTRY_UNAVAILABLE", true),
    };
    proto::ToolError {
        code: code.to_string(),
        message: format!("{error:?}"),
        retryable,
    }
}

pub fn encode_reply(call_id: &str, result: &ToolResponse) -> Result<Vec<u8>, WireError> {
    if call_id.trim().is_empty() {
        return Err(WireError::MissingField("call_id"));
    }
    let (output_type_url, outcome) = match result {
        Ok(output) => {
            check_type(&output.payload.type_url)?;
            (
                output.payload.type_url.clone(),
                Some(proto::tool_reply::Outcome::Output(
                    output.payload.bytes.clone(),
                )),
            )
        }
        Err(error) => (
            String::new(),
            Some(proto::tool_reply::Outcome::Failure(dispatch_error(error))),
        ),
    };
    let reply = proto::ToolReply {
        call_id: call_id.to_string(),
        output_type_url,
        outcome,
    };
    if reply.encoded_len() > MAX_REPLY_BYTES {
        return Err(WireError::Oversized);
    }
    Ok(reply.encode_to_vec())
}

pub fn decode_reply(frame: &[u8]) -> Result<proto::ToolReply, WireError> {
    if frame.len() > MAX_REPLY_BYTES {
        return Err(WireError::Oversized);
    }
    let reply = proto::ToolReply::decode(frame).map_err(|e| WireError::Decode(e.to_string()))?;
    if reply.call_id.trim().is_empty() {
        return Err(WireError::MissingField("call_id"));
    }
    match &reply.outcome {
        Some(proto::tool_reply::Outcome::Output(_)) => check_type(&reply.output_type_url)?,
        Some(proto::tool_reply::Outcome::Failure(err)) if !err.code.is_empty() => {}
        _ => return Err(WireError::MissingField("outcome")),
    }
    Ok(reply)
}

pub fn typed_result<T: Message>(output_type_url: impl Into<String>, value: &T) -> ToolOutput {
    ToolOutput {
        payload: ProtoPayload {
            type_url: output_type_url.into(),
            bytes: value.encode_to_vec(),
        },
    }
}
