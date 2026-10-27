//! A signed Core Extension worker is copied into a sealed, anonymous Linux
//! executable before entering bubblewrap. The mount source is the inherited
//! file descriptor, never the mutable staging pathname.
//!
//! Fail closed on kernels that cannot create + fully seal the executable.
//! No third-party package installation or user-facing execution is exposed.

use std::{
    ffi::CString,
    fs::File,
    io::{self, Read, Seek, SeekFrom, Write},
    os::{
        fd::{AsRawFd, FromRawFd, RawFd},
        unix::process::CommandExt,
    },
};

use lu_core::StagedCeExecutable;
use nix::libc;
use tokio::process::Command;

use super::ce_signed_runtime::SignedRuntimeError;

const EXEC_FLAG: libc::c_uint = 0x10; // Linux MFD_EXEC (6.3+)
const REQUIRED_SEALS: libc::c_int =
    libc::F_SEAL_WRITE | libc::F_SEAL_GROW | libc::F_SEAL_SHRINK | libc::F_SEAL_SEAL;

pub(crate) struct SealedCeImage {
    file: File,
}

fn sealed_error(error: io::Error) -> SignedRuntimeError {
    SignedRuntimeError::Spawn(format!("sealed Core Extension image unavailable: {error}"))
}

impl SealedCeImage {
    pub(crate) fn from_staged(staged: &StagedCeExecutable) -> Result<Self, SignedRuntimeError> {
        staged
            .verify_on_disk()
            .map_err(|_| SignedRuntimeError::InvalidPackage)?;
        // The signature-verifier keeps the verified artifact bytes owned by the
        // host. Do not reopen the staged pathname to construct the executable.
        Self::from_verified_bytes(staged.package().artifact())
    }

    fn from_verified_bytes(bytes: &[u8]) -> Result<Self, SignedRuntimeError> {
        if !bytes.starts_with(b"\x7fELF") {
            return Err(SignedRuntimeError::InvalidPackage);
        }
        let name = CString::new("lu-ce-verified-worker").expect("constant has no NUL");
        let base = (libc::MFD_CLOEXEC | libc::MFD_ALLOW_SEALING) as libc::c_uint;
        // Modern kernels require an explicit executable memfd on systems with
        // vm.memfd_noexec; older kernels reject the new flag with EINVAL.
        // The compatibility retry is still sealed and OS execution-enforced.
        let mut raw = unsafe {
            libc::syscall(libc::SYS_memfd_create, name.as_ptr(), base | EXEC_FLAG)
        };
        if raw < 0 && io::Error::last_os_error().raw_os_error() == Some(libc::EINVAL) {
            raw = unsafe { libc::syscall(libc::SYS_memfd_create, name.as_ptr(), base) };
        }
        if raw < 0 {
            return Err(sealed_error(io::Error::last_os_error()));
        }
        // SAFETY: memfd_create returned a newly owned file descriptor.
        let mut file = unsafe { File::from_raw_fd(raw as RawFd) };
        file.write_all(bytes).map_err(sealed_error)?;
        file.flush().map_err(sealed_error)?;
        let fd = file.as_raw_fd();

        // No shared writable mapping was made; F_SEAL_WRITE prevents writes and
        // future writable mappings. GROW/SHRINK prohibit size changes and SEAL
        // makes all these protections irreversible, even for our own host.
        if unsafe { libc::fcntl(fd, libc::F_ADD_SEALS, REQUIRED_SEALS) } == -1 {
            return Err(sealed_error(io::Error::last_os_error()));
        }
        let seals = unsafe { libc::fcntl(fd, libc::F_GET_SEALS) };
        if seals < 0 || seals & REQUIRED_SEALS != REQUIRED_SEALS {
            return Err(SignedRuntimeError::InvalidPackage);
        }

        // Verify that the sealed object matches the signed in-memory artifact
        // byte-for-byte. A mutable host pathname is never involved in this
        // verification or later bubblewrap bind source resolution.
        file.seek(SeekFrom::Start(0)).map_err(sealed_error)?;
        let mut chunk = [0u8; 8192];
        for expected in bytes.chunks(chunk.len()) {
            file.read_exact(&mut chunk[..expected.len()])
                .map_err(sealed_error)?;
            if &chunk[..expected.len()] != expected {
                return Err(SignedRuntimeError::InvalidPackage);
            }
        }
        if file.read(&mut chunk[..1]).map_err(sealed_error)? != 0 {
            return Err(SignedRuntimeError::InvalidPackage);
        }
        file.seek(SeekFrom::Start(0)).map_err(sealed_error)?;
        Ok(Self { file })
    }

    pub(crate) fn raw_fd(&self) -> RawFd {
        self.file.as_raw_fd()
    }

    /// Keep CLOEXEC in the parent. Only the one bubblewrap child receives this
    /// sealed code image. The pre_exec hook uses only async-signal-safe fcntl;
    /// clearing CLOEXEC globally in the host would leak the descriptor into
    /// unrelated subprocesses.
    pub(crate) fn inherit_into(&self, command: &mut Command) {
        let fd = self.raw_fd();
        // SAFETY: in the forked child, fcntl is async-signal-safe. No allocation
        // or synchronization occurs on the success path.
        unsafe {
            command.as_std_mut().pre_exec(move || {
                let flags = libc::fcntl(fd, libc::F_GETFD);
                if flags == -1 {
                    return Err(io::Error::last_os_error());
                }
                if libc::fcntl(fd, libc::F_SETFD, flags & !libc::FD_CLOEXEC) == -1 {
                    return Err(io::Error::last_os_error());
                }
                Ok(())
            });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verified_image_is_sealed_and_cannot_be_modified() {
        let image = SealedCeImage::from_verified_bytes(b"\x7fELF-test-worker").unwrap();
        let fd = image.raw_fd();
        let seals = unsafe { libc::fcntl(fd, libc::F_GET_SEALS) };
        assert_eq!(seals & REQUIRED_SEALS, REQUIRED_SEALS);
        let attempted = unsafe {
            libc::write(fd, b"X".as_ptr().cast(), 1)
        };
        assert_eq!(attempted, -1, "the signed memfd must be immutable");
        assert_eq!(io::Error::last_os_error().raw_os_error(), Some(libc::EPERM));
        assert_eq!(unsafe { libc::fcntl(fd, libc::F_GETFD) } & libc::FD_CLOEXEC,
                   libc::FD_CLOEXEC, "parent descriptor cannot leak");
    }

    #[test]
    fn sealed_image_keeps_original_signed_bytes_after_source_is_changed() {
        let mut source = b"\x7fELF-original-signed-worker".to_vec();
        let expected = source.clone();
        let image = SealedCeImage::from_verified_bytes(&source).unwrap();
        source.fill(0);
        let mut cloned_handle = image.file.try_clone().unwrap();
        cloned_handle.seek(SeekFrom::Start(0)).unwrap();
        let mut bytes = Vec::new();
        cloned_handle.read_to_end(&mut bytes).unwrap();
        assert_eq!(bytes, expected, "host mutation must not alter sealed code");
        let seals = unsafe { libc::fcntl(image.raw_fd(), libc::F_GET_SEALS) };
        assert_eq!(seals & REQUIRED_SEALS, REQUIRED_SEALS);
    }

    #[test]
    fn unsigned_or_invalid_native_worker_cannot_be_sealed_for_launch() {
        assert!(matches!(
            SealedCeImage::from_verified_bytes(b"not executable"),
            Err(SignedRuntimeError::InvalidPackage)
        ));
    }
}
