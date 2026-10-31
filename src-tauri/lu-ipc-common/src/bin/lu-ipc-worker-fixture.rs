//! Restricted test fixture only. Not a production Cognitum or native tool
//! worker. It deliberately executes NO filesystem operation.
use lu_ipc_common::{
    authority::ClientProof, typed::proto::{ToolCall, ToolReply, ReadTextFileRequest},
    write_frame, Stream,
};
use prost::Message;
use std::{io, time::{Duration, Instant}};

fn main() {
    // Exit categories only. Do not print credentials, paths, or payloads.
    if let Err(code) = run() { std::process::exit(code); }
}

fn run() -> Result<(), i32> {
    // No argv-based credentials or caller-selected command arguments.
    if std::env::args_os().count() != 1 {
        return Err(21);
    }
    let (proof, endpoint) = ClientProof::receive_bootstrap(io::stdin().lock()).map_err(|_| 22)?;
    let connected = Stream::connect(&endpoint).map_err(|error| {
        // Fixed operating-system error category only; no addresses, paths,
        // credentials, input text, or error chains leave this test fixture.
        #[cfg(windows)]
        { error.raw_os_error().unwrap_or(23) }
        #[cfg(not(windows))]
        { let _ = error; 23 }
    })?;
    let mut socket = proof.prove(connected).map_err(|_| 24)?;
    let request = ReadTextFileRequest { path: "sample.txt".into(), max_bytes: Some(128) };
    let call = ToolCall {
        contract_version: 1,
        call_id: "call1".into(),
        tool_id: "read_text_file".into(),
        workspace_id: Some("workspace1".into()),
        input_type_url: "type.googleapis.com/lu.v1.ReadTextFileRequest".into(),
        input: request.encode_to_vec(),
    };
    write_frame(&mut socket, &call.encode_to_vec()).map_err(|_| 25)?;
    let wire = socket.read_frame_until(Instant::now() + Duration::from_secs(20)).map_err(|_| 26)?;
    let reply = ToolReply::decode(wire.as_slice()).map_err(|_| 27)?;
    if reply.call_id != "call1" {
        return Err(28);
    }
    Ok(())
}
