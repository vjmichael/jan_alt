use lu_ipc_common::{read_frame, write_frame, Endpoint, Listener, Stream, MAX_FRAME};
use std::fs;
use std::io::{self, Cursor, Write};
use std::path::PathBuf;
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

struct Profile(PathBuf);
impl Profile {
    fn new(label: &str) -> Self {
        let root=std::env::temp_dir().join(format!("lu-t-{label}-{}-{:x}",std::process::id(),SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos()));
        fs::create_dir(&root).unwrap();
        #[cfg(unix)] {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&root,fs::Permissions::from_mode(0o700)).unwrap();
        }
        Self(root)
    }
    fn endpoint(&self) -> Endpoint {Endpoint::new(self.0.join("lu.sock")).unwrap()}
}
impl Drop for Profile {fn drop(&mut self){let _=fs::remove_dir_all(&self.0);}}
// Protobuf lu.v1.ToolCall fields 1,2,3,5,6 defined in lu-core/proto/lu/v1/core.proto.
fn field(b:&mut Vec<u8>,tag:u8,s:&[u8]){b.push(tag);b.push(s.len() as u8);b.extend_from_slice(s);}
fn call()->Vec<u8>{
    let mut v=vec![0x08,0x01];
    field(&mut v,0x12,b"call-01");
    field(&mut v,0x1a,b"read_text_file");
    field(&mut v,0x2a,b"type.googleapis.com/lu.v1.ReadTextFileRequest");
    field(&mut v,0x32,b"\x0a\x04a.md");
    v
}
fn reply()->Vec<u8>{
    let mut v=vec![];
    field(&mut v,0x0a,b"call-01");
    field(&mut v,0x12,b"type.googleapis.com/lu.v1.ReadTextFileResult");
    field(&mut v,0x1a,b"\x0a\x02ok");
    v
}
#[test]
fn real_socket_roundtrip_lu_protobuf_call_reply(){
    let p=Profile::new("wire");let ep=p.endpoint();
    let listener=Listener::bind(ep.clone()).unwrap();
    let h=thread::spawn(move||{
        let mut s=listener.accept_until(Instant::now()+Duration::from_secs(3)).unwrap();
        assert_eq!(read_frame(&mut s).unwrap(),call());
        write_frame(&mut s,&reply()).unwrap();
    });
    let mut c=Stream::connect(&ep).unwrap();
    write_frame(&mut c,&call()).unwrap();
    assert_eq!(read_frame(&mut c).unwrap(),reply());
    c.shutdown().unwrap();h.join().unwrap();
}
#[test]
fn four_concurrent_clients_binary_integrity(){
    let p=Profile::new("concurrent");let ep=p.endpoint();let listener=Listener::bind(ep.clone()).unwrap();
    let h=thread::spawn(move||{
        for _ in 0..4{
            let mut s=listener.accept_until(Instant::now()+Duration::from_secs(4)).unwrap();
            let b=read_frame(&mut s).unwrap();
            write_frame(&mut s,&b).unwrap();
        }
    });
    let cs=(0..4).map(|i|{
        let ep=ep.clone();thread::spawn(move||{
            let mut s=Stream::connect(&ep).unwrap();let bytes=vec![i as u8;110+i];
            write_frame(&mut s,&bytes).unwrap();assert_eq!(read_frame(&mut s).unwrap(),bytes);
        })
    }).collect::<Vec<_>>();
    for c in cs{c.join().unwrap();}h.join().unwrap();
}
#[test]
fn truncated_and_oversized_frames_rejected_before_buffer_allocation(){
    assert!(read_frame(Cursor::new(0u32.to_be_bytes())).is_err());
    assert!(read_frame(Cursor::new(((MAX_FRAME+1) as u32).to_be_bytes())).is_err());
    assert_eq!(read_frame(Cursor::new([0,0,0,2,b'a'])).unwrap_err().kind(),io::ErrorKind::UnexpectedEof);
    assert_eq!(read_frame(Cursor::new([0,0])).unwrap_err().kind(),io::ErrorKind::UnexpectedEof);
    assert!(write_frame(Vec::<u8>::new(),&[]).is_err());
    assert!(write_frame(Vec::<u8>::new(),&vec![0;MAX_FRAME+1]).is_err());
}
#[test]
fn partial_write_and_network_byte_order(){
    struct Partial(Vec<u8>);
    impl Write for Partial{
        fn write(&mut self,buf:&[u8])->io::Result<usize>{
            let n=buf.len().min(2);self.0.extend_from_slice(&buf[..n]);Ok(n)
        }
        fn flush(&mut self)->io::Result<()>{Ok(())}
    }
    let mut p=Partial(vec![]);let b=(0..515).map(|v|(v%256) as u8).collect::<Vec<_>>();
    write_frame(&mut p,&b).unwrap();
    assert_eq!(&p.0[..4],&515u32.to_be_bytes());
    assert_eq!(read_frame(Cursor::new(p.0)).unwrap(),b);
}
#[test]
fn missing_and_occupied_endpoint_and_accept_timeout(){
    let p=Profile::new("deadline");let ep=p.endpoint();
    assert!(Stream::connect(&ep).is_err());
    let l=Listener::bind(ep.clone()).unwrap();
    assert!(Listener::bind(ep).is_err());
    assert_eq!(l.accept_until(Instant::now()+Duration::from_millis(30)).err().unwrap().kind(),io::ErrorKind::TimedOut);
}
#[cfg(unix)]
#[test]
fn linux_private_directory_symlink_and_replacement_denied(){
    use std::os::unix::fs::{symlink,PermissionsExt};
    let p=Profile::new("permissions");let bad=p.0.join("bad");
    fs::create_dir(&bad).unwrap();fs::set_permissions(&bad,fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(Endpoint::new(bad.join("sock")).unwrap_err().kind(),io::ErrorKind::PermissionDenied);
    let link=p.0.join("link");symlink(&bad,&link).unwrap();
    assert_eq!(Endpoint::new(link.join("sock")).unwrap_err().kind(),io::ErrorKind::PermissionDenied);
    let ep=p.endpoint();fs::write(ep.path(),b"occupant").unwrap();
    assert_eq!(Listener::bind(ep).err().unwrap().kind(),io::ErrorKind::AlreadyExists);
}
#[cfg(unix)]
#[test]
fn linux_does_not_unlink_replaced_inode(){
    let p=Profile::new("inode");let ep=p.endpoint();let l=Listener::bind(ep.clone()).unwrap();
    fs::remove_file(ep.path()).unwrap();fs::write(ep.path(),b"replacement").unwrap();drop(l);
    assert_eq!(fs::read(ep.path()).unwrap(),b"replacement");
}
