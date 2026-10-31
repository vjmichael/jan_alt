//! Minimal audited Windows FFI for Job Object containment.
//! Unsafe code is confined to this single Win32 wrapper.
#![allow(unsafe_code)]
use std::{ffi::c_void, io, mem, os::windows::io::AsRawHandle, process::Child, ptr};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
        JOBOBJECT_EXTENDED_LIMIT_INFORMATION, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        SetInformationJobObject, TerminateJobObject,
    },
};

pub(super) struct WindowsJob { handle: HANDLE }

impl WindowsJob {
    pub(super) fn new() -> io::Result<Self> {
        // SAFETY: Null attributes/name request a private unnamed job with a
        // default security descriptor and a non-inheritable handle.
        let handle = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
        if handle.is_null() { return Err(io::Error::last_os_error()); }
        let job = Self { handle };
        let mut limits = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        // Do not set BREAKAWAY_OK or SILENT_BREAKAWAY_OK. Descendants
        // created via ordinary CreateProcess remain inside the job.
        // SAFETY: limits has the documented type, size and alignment and
        // remains live until this synchronous call returns.
        let ok = unsafe {
            SetInformationJobObject(
                job.handle,
                JobObjectExtendedLimitInformation,
                (&raw const limits).cast::<c_void>(),
                mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if ok == 0 { return Err(io::Error::last_os_error()); }
        Ok(job)
    }
    pub(super) fn attach(&self, child: &Child) -> io::Result<()> {
        let process = child.as_raw_handle() as HANDLE;
        // SAFETY: Child owns a valid live PROCESS handle; this job remains
        // open for the worker's lifetime. No bootstrap is sent until success.
        if unsafe { AssignProcessToJobObject(self.handle, process) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
    pub(super) fn terminate(&self) -> io::Result<()> {
        // SAFETY: self owns a valid job handle; 1 is the stable termination
        // code. Any child and descendants still associated are terminated.
        if unsafe { TerminateJobObject(self.handle, 1) } == 0 {
            return Err(io::Error::last_os_error());
        }
        Ok(())
    }
}
impl Drop for WindowsJob {
    fn drop(&mut self) {
        // SAFETY: The handle is exclusively owned here; it was not inherited.
        // KILL_ON_JOB_CLOSE ensures host-exit cleanup when last handle closes.
        unsafe { CloseHandle(self.handle) };
    }
}
