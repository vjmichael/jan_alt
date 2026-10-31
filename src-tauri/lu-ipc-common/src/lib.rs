//! Headless AF_UNIX carrier for Lu's existing lu.v1 Protobuf contracts.
//! This is transport ONLY, NOT host authorization, worker cleanup or release IPC.
#![forbid(unsafe_code)]
use std::fs;
use std::io::{self, Read, Write};
use std::net::Shutdown;
use std::path::{Path, PathBuf};
use std::thread;
use std::time::{Duration, Instant};

pub const MAX_FRAME: usize = 4 * 1024 * 1024;
pub const IO_TIMEOUT: Duration = Duration::from_secs(3);

fn invalid(message: &'static str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message)
}

/// Existing Lu ToolCall/ToolReply Protobuf bytes with a big-endian u32 length.
/// Decoding, version checks, turn ownership, effect journal and native-tool
/// policy remain the exclusive responsibility of the trusted Lu host.
pub fn write_frame(mut io: impl Write, bytes: &[u8]) -> io::Result<()> {
    if bytes.is_empty() || bytes.len() > MAX_FRAME {
        return Err(invalid("Lu frame must be 1..=4 MiB"));
    }
    io.write_all(&(bytes.len() as u32).to_be_bytes())?;
    io.write_all(bytes)?;
    io.flush()
}
pub fn read_frame(mut io: impl Read) -> io::Result<Vec<u8>> {
    let mut header = [0u8; 4];
    io.read_exact(&mut header)?;
    let size = u32::from_be_bytes(header) as usize;
    if size == 0 || size > MAX_FRAME {
        return Err(invalid("Lu frame must be 1..=4 MiB"));
    }
    let mut output = vec![0u8; size];
    io.read_exact(&mut output)?;
    Ok(output)
}

#[derive(Clone, Debug)]
pub struct Endpoint {
    path: PathBuf,
}
impl Endpoint {
    pub fn new(path: impl AsRef<Path>) -> io::Result<Self> {
        let path = path.as_ref();
        if !path.is_absolute() || path.file_name().is_none()
            || path.to_string_lossy().len() >= 100
            || path.to_string_lossy().contains('\0')
        {
            return Err(invalid("Lu AF_UNIX endpoint must be an absolute, short path"));
        }
        let parent = path.parent().ok_or_else(|| invalid("endpoint parent missing"))?;
        let meta = fs::symlink_metadata(parent)?;
        if meta.file_type().is_symlink() || !meta.is_dir() {
            return Err(io::Error::new(io::ErrorKind::PermissionDenied, "endpoint parent is not a physical directory"));
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            if meta.permissions().mode() & 0o077 != 0 {
                return Err(io::Error::new(io::ErrorKind::PermissionDenied, "endpoint parent must be 0700"));
            }
        }
        Ok(Self { path: path.to_owned() })
    }
    pub fn path(&self) -> &Path { &self.path }
    fn not_present(&self) -> io::Result<()> {
        match fs::symlink_metadata(&self.path) {
            Ok(_) => Err(io::Error::new(io::ErrorKind::AlreadyExists, "socket path occupied; no blind unlink")),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e),
        }
    }
}
#[cfg(unix)]
type NativeStream = std::os::unix::net::UnixStream;
#[cfg(unix)]
type NativeListener = std::os::unix::net::UnixListener;
#[cfg(windows)]
type NativeStream = socket2::Socket;
#[cfg(windows)]
type NativeListener = socket2::Socket;

pub struct Stream { inner: NativeStream }
impl Stream {
    pub fn connect(endpoint: &Endpoint) -> io::Result<Self> {
        #[cfg(unix)]
        let s = NativeStream::connect(endpoint.path())?;
        #[cfg(windows)]
        let s = {
            use socket2::{Domain, SockAddr, Socket, Type};
            let s = Socket::new(Domain::UNIX, Type::STREAM, None)?;
            s.connect_timeout(&SockAddr::unix(endpoint.path())?, IO_TIMEOUT)?;
            s
        };
        s.set_read_timeout(Some(IO_TIMEOUT))?;
        s.set_write_timeout(Some(IO_TIMEOUT))?;
        Ok(Self { inner: s })
    }
    pub fn shutdown(&self) -> io::Result<()> {
        // Never interpret shutdown as worker or descendant termination.
        self.inner.shutdown(Shutdown::Both)
    }
    pub fn set_timeout(&self, duration: Duration) -> io::Result<()> {
        if duration.is_zero() { return Err(invalid("zero deadline")); }
        self.inner.set_read_timeout(Some(duration))?;
        self.inner.set_write_timeout(Some(duration))
    }
}
impl Read for Stream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> { self.inner.read(buf) }
}
impl Write for Stream {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> { self.inner.write(buf) }
    fn flush(&mut self) -> io::Result<()> { self.inner.flush() }
}

pub struct Listener {
    inner: NativeListener,
    endpoint: Endpoint,
    #[cfg(unix)]
    identity: (u64, u64),
}
impl Listener {
    pub fn bind(endpoint: Endpoint) -> io::Result<Self> {
        endpoint.not_present()?;
        #[cfg(unix)]
        let s = NativeListener::bind(endpoint.path())?;
        #[cfg(windows)]
        let s = {
            use socket2::{Domain, SockAddr, Socket, Type};
            let s = Socket::new(Domain::UNIX, Type::STREAM, None)?;
            s.bind(&SockAddr::unix(endpoint.path())?)?;
            s.listen(16)?;
            s
        };
        s.set_nonblocking(true)?;
        #[cfg(unix)]
        let identity = {
            use std::os::unix::fs::MetadataExt;
            let m = fs::symlink_metadata(endpoint.path())?;
            (m.dev(), m.ino())
        };
        Ok(Self {
            inner: s, endpoint,
            #[cfg(unix)]
            identity,
        })
    }
    pub fn accept_until(&self, deadline: Instant) -> io::Result<Stream> {
        loop {
            match self.inner.accept() {
                Ok((s, _)) => {
                    s.set_nonblocking(false)?;
                    s.set_read_timeout(Some(IO_TIMEOUT))?;
                    s.set_write_timeout(Some(IO_TIMEOUT))?;
                    return Ok(Stream { inner: s });
                }
                Err(ref e) if e.kind() == io::ErrorKind::WouldBlock => {
                    if Instant::now() >= deadline {
                        return Err(io::Error::new(io::ErrorKind::TimedOut, "AF_UNIX admission deadline"));
                    }
                    thread::sleep(Duration::from_millis(5));
                }
                Err(e) => return Err(e),
            }
        }
    }
    pub fn endpoint(&self) -> &Endpoint { &self.endpoint }
}
impl Drop for Listener {
    fn drop(&mut self) {
        // On Unix, unlink only our original inode; never delete a replacement.
        // Windows ACL/reparse-safe cleanup remains unimplemented, IPC-04 OPEN.
        #[cfg(unix)]
        {
            use std::os::unix::fs::{FileTypeExt, MetadataExt};
            if let Ok(m) = fs::symlink_metadata(self.endpoint.path()) {
                if m.file_type().is_socket() && (m.dev(), m.ino()) == self.identity {
                    let _ = fs::remove_file(self.endpoint.path());
                }
            }
        }
    }
}
#[cfg(not(any(unix, windows)))]
compile_error!("Lu common AF_UNIX supports Linux/Unix and native Windows only");
