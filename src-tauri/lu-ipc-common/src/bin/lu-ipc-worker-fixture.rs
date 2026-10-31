//! Restricted test fixture only. Not a production Cognitum or native tool
//! worker. It deliberately executes NO filesystem operation.
use lu_ipc_common::{
    authority::ClientProof, typed::proto::{ToolCall, ToolReply, ReadTextFileRequest},
    write_frame, Stream,
};
use prost::Message;
use std::{io, time::{Duration, Instant}};

fn main() {
    // Never print credentials, paths or caller data to logs or stdout.
    if run().is_err() {
        std::process::exit(2);
    }
}

fn run() -> io::Result<()> {
    // No argv-based credentials or caller-selected command arguments.
    if std::env::args_os().count() != 1 {
        return Err(io::Error::new(io::ErrorKind::PermissionDenied, "unexpected worker arguments"));
    }
    let (proof, endpoint) = ClientProof::receive_bootstrap(io::stdin().lock())?;
    let mut socket = proof.prove(Stream::connect(&endpoint)?)?;
    let request = ReadTextFileRequest { path: "sample.txt".into(), max_bytes: Some(128) };
    let call = ToolCall {
        contract_version: 1,
        call_id: "call1".into(),
        tool_id: "read_text_file".into(),
        workspace_id: Some("workspace1".into()),
        input_type_url: "type.googleapis.com/lu.v1.ReadTextFileRequest".into(),
        input: request.encode_to_vec(),
    };
    write_frame(&mut socket, &call.encode_to_vec())?;
    let wire = socket.read_frame_until(Instant::now() + Duration::from_secs(20))?;
    let reply = ToolReply::decode(wire.as_slice()).map_err(|_| {
        io::Error::new(io::ErrorKind::InvalidData, "invalid host reply")
    })?;
    if reply.call_id != "call1" {
        return Err(io::Error::new(io::ErrorKind::InvalidData, "wrong host call"));
    }
    Ok(())
}
