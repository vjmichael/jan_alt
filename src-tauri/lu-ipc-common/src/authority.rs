//! Experimental AF_UNIX admission. This never grants filesystem, model,
//! inference, process, or native-tool authority by itself.
//!
//! The trusted Lu host must create scopes from its authenticated, saved turn,
//! supply the one-time credential to its own worker through a protected launch
//! channel (not argv, environment, model text or a public file), and implement
//! Protobuf decoding/policy/effect journaling before any action.
use crate::{write_frame, Listener, Stream};
use std::fmt;
use std::io;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::{Duration, Instant};
use subtle::ConstantTimeEq;
use zeroize::Zeroize;

const AUTH_MAGIC: &[u8] = b"LUIPC1:";
const AUTH_OK: &[u8] = b"LUIPC1-AUTHORIZED";
const SECRET_SIZE: usize = 32;
const MAX_PENDING: usize = 64;
const MAX_TTL: Duration = Duration::from_secs(60);

fn denied() -> io::Error {
    io::Error::new(io::ErrorKind::PermissionDenied, "Lu IPC admission denied")
}
fn invalid_scope() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, "invalid host-owned Lu IPC scope")
}
fn bounded_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 128
        && id
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'-' || c == b'_')
}

/// Trusted-host data only. Never construct from a worker-supplied workspace_id,
/// conversation_id, tool_id, header, or model response.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct HostScope {
    profile_id: String,
    workspace_id: String,
    conversation_id: String,
    turn_id: String,
    tool_id: String,
    effect: String,
}
impl HostScope {
    pub fn new(
        profile_id: &str,
        workspace_id: &str,
        conversation_id: &str,
        turn_id: &str,
        tool_id: &str,
        effect: &str,
    ) -> io::Result<Self> {
        if ![profile_id, workspace_id, conversation_id, turn_id, tool_id, effect]
            .iter()
            .all(|item| bounded_id(item))
        {
            return Err(invalid_scope());
        }
        Ok(Self {
            profile_id: profile_id.into(),
            workspace_id: workspace_id.into(),
            conversation_id: conversation_id.into(),
            turn_id: turn_id.into(),
            tool_id: tool_id.into(),
            effect: effect.into(),
        })
    }
    pub fn profile_id(&self) -> &str { &self.profile_id }
    pub fn workspace_id(&self) -> &str { &self.workspace_id }
    pub fn conversation_id(&self) -> &str { &self.conversation_id }
    pub fn turn_id(&self) -> &str { &self.turn_id }
    pub fn tool_id(&self) -> &str { &self.tool_id }
    pub fn effect(&self) -> &str { &self.effect }
}

/// Secret must be delivered by the trusted host over a protected launch handle.
/// The wire proves possession only. It is not an OS peer-identity assertion.
pub struct ClientProof {
    secret: [u8; SECRET_SIZE],
}
impl fmt::Debug for ClientProof {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("ClientProof([redacted])")
    }
}
impl Drop for ClientProof {
    fn drop(&mut self) { self.secret.zeroize(); }
}
impl ClientProof {
    /// Consume a one-shot proof; reject servers that omit the authenticated ACK.
    pub fn prove(self, mut stream: Stream) -> io::Result<Stream> {
        let mut hello = Vec::with_capacity(AUTH_MAGIC.len() + SECRET_SIZE);
        hello.extend_from_slice(AUTH_MAGIC);
        hello.extend_from_slice(&self.secret);
        let send_result = write_frame(&mut stream, &hello);
        hello.zeroize();
        send_result?;
        let ack = stream.read_frame_until(Instant::now() + crate::IO_TIMEOUT)?;
        if ack != AUTH_OK { return Err(denied()); }
        Ok(stream)
    }
}

/// Retained only in the host process. Revocation is visible to an already
/// authenticated stream before the next authorized call or reply.
#[derive(Clone)]
pub struct HostRevoker {
    revoked: Arc<AtomicBool>,
}
impl HostRevoker {
    pub fn revoke(&self) { self.revoked.store(true, Ordering::SeqCst); }
    pub fn is_revoked(&self) -> bool { self.revoked.load(Ordering::SeqCst) }
}
struct PendingGrant {
    secret: [u8; SECRET_SIZE],
    scope: HostScope,
    expires: Instant,
    revoked: Arc<AtomicBool>,
}
impl Drop for PendingGrant {
    fn drop(&mut self) { self.secret.zeroize(); }
}

/// Owned by the trusted Lu host. Mutable access serializes issue/admit. A new
/// instance cannot recognize credentials from an old host process.
#[derive(Default)]
pub struct HostAdmission {
    pending: Vec<PendingGrant>,
}
impl HostAdmission {
    pub fn new() -> Self { Self::default() }
    pub fn issue(&mut self, scope: HostScope, ttl: Duration) -> io::Result<(ClientProof, HostRevoker)> {
        if ttl.is_zero() || ttl > MAX_TTL { return Err(invalid_scope()); }
        let now = Instant::now();
        self.pending.retain(|p| p.expires > now && !p.revoked.load(Ordering::SeqCst));
        if self.pending.len() >= MAX_PENDING {
            return Err(io::Error::new(io::ErrorKind::WouldBlock, "Lu IPC admission capacity exceeded"));
        }
        let expires = now.checked_add(ttl).ok_or_else(invalid_scope)?;
        // Randomness failure is fatal. Never substitute timestamps or a PRNG.
        let mut secret = [0u8; SECRET_SIZE];
        let mut unique = false;
        for _ in 0..4 {
            getrandom::fill(&mut secret).map_err(|_| io::Error::other("OS entropy unavailable"))?;
            if self.pending.iter().all(|p| p.secret.ct_eq(&secret).unwrap_u8() == 0) {
                unique = true;
                break;
            }
        }
        if !unique {
            secret.zeroize();
            return Err(io::Error::other("Lu IPC credential collision"));
        }
        let revoked = Arc::new(AtomicBool::new(false));
        self.pending.push(PendingGrant {
            secret,
            scope,
            expires,
            revoked: Arc::clone(&revoked),
        });
        Ok((ClientProof { secret }, HostRevoker { revoked }))
    }

    /// Accept exactly one connection and reject bad, expired or replayed proofs.
    /// The caller should bound total attempts; invalid peers are never promoted.
    pub fn admit(&mut self, listener: &Listener, deadline: Instant) -> io::Result<AdmittedStream> {
        let mut stream = listener.accept_until(deadline)?;
        let hello = stream.read_frame_until(deadline)?;
        if hello.len() != AUTH_MAGIC.len() + SECRET_SIZE || !hello.starts_with(AUTH_MAGIC) {
            return Err(denied());
        }
        let now = Instant::now();
        let mut found = None;
        // Fixed-length secret comparison; the proof itself is never logged.
        for (index, p) in self.pending.iter().enumerate() {
            if p.secret.as_slice().ct_eq(&hello[AUTH_MAGIC.len()..]).unwrap_u8() == 1
                && p.expires > now
                && !p.revoked.load(Ordering::SeqCst)
            {
                found = Some(index);
            }
        }
        let index = found.ok_or_else(denied)?;
        let admitted = self.pending.swap_remove(index);
        if admitted.expires <= Instant::now() || admitted.revoked.load(Ordering::SeqCst) {
            return Err(denied());
        }
        write_frame(&mut stream, AUTH_OK)?;
        Ok(AdmittedStream {
            stream,
            scope: admitted.scope.clone(),
            expires: admitted.expires,
            revoked: Arc::clone(&admitted.revoked),
        })
    }
}

/// Intentionally does not implement Read/Write or expose its raw socket.
/// Every host read must check the still-current trusted scope AND use the
/// caller's pure Lu Protobuf contract validator before dispatch.
pub struct AdmittedStream {
    stream: Stream,
    scope: HostScope,
    expires: Instant,
    revoked: Arc<AtomicBool>,
}
impl AdmittedStream {
    pub fn scope(&self) -> &HostScope { &self.scope }
    pub fn authorize(&self, current_host_scope: &HostScope) -> io::Result<()> {
        if self.expires <= Instant::now()
            || self.revoked.load(Ordering::SeqCst)
            || &self.scope != current_host_scope
        {
            return Err(denied());
        }
        Ok(())
    }
    pub fn read_checked_call<F>(
        &mut self,
        current_host_scope: &HostScope,
        deadline: Instant,
        validate_protobuf: F,
    ) -> io::Result<Vec<u8>>
    where
        F: FnOnce(&[u8], &HostScope) -> io::Result<()>,
    {
        self.authorize(current_host_scope)?;
        let bytes = self.stream.read_frame_until(deadline)?;
        // Host must decode lu.v1.ToolCall, reject mismatched tool_id and
        // workspace_id, validate version/schema and effect/turn policy here.
        validate_protobuf(&bytes, &self.scope)?;
        self.authorize(current_host_scope)?;
        Ok(bytes)
    }
    pub fn write_checked_reply(
        &mut self,
        current_host_scope: &HostScope,
        validated_reply: &[u8],
    ) -> io::Result<()> {
        self.authorize(current_host_scope)?;
        write_frame(&mut self.stream, validated_reply)
    }
}
