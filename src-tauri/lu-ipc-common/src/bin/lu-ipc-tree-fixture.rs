//! Test-only descendant tree. Deliberately outside Lu's shipping binary set.
//! Parent receives a one-time host proof on its inherited pipe, authenticates
//! over native AF_UNIX, then starts a child from this exact test executable.
use lu_ipc_common::{authority::ClientProof, Stream};
use std::{fs, io, path::PathBuf, process::{Command, Stdio}, thread, time::Duration};

fn main() {
    let args: Vec<_> = std::env::args_os().collect();
    if args.len() == 3 && args[1] == "--descendant" {
        let marker = PathBuf::from(&args[2]);
        if marker.file_name().is_some_and(|p| p == "heartbeat") {
            loop {
                let _ = fs::write(&marker, b"alive");
                thread::sleep(Duration::from_millis(25));
            }
        }
        std::process::exit(41);
    }
    if args.len() != 1 || run().is_err() {
        std::process::exit(42);
    }
}
fn run() -> io::Result<()> {
    let (proof, endpoint) = ClientProof::receive_bootstrap(io::stdin().lock())?;
    let _socket = proof.prove(Stream::connect(&endpoint)?)?;
    let root = endpoint.path().parent().ok_or_else(|| io::Error::other("no test directory"))?;
    let path = std::env::current_exe()?;
    let grandchild = Command::new(path)
        .arg("--descendant")
        .arg(root.join("heartbeat"))
        .env_clear()
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()?;
    fs::write(root.join("descendant.pid"), grandchild.id().to_string())?;
    loop { thread::sleep(Duration::from_millis(20)); }
}
