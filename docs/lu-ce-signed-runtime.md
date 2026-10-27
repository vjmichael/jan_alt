# Lu signed Core Extension worker — experimental host integration

**Status:** experimental Rust/desktop integration, stacked on Draft PRs #4–#11; signed CE worker launch remains Linux-only and is NOT enabled for arbitrary third-party extensions. **Not a release-ready third-party plugin system.** No new model-facing CE loader, installer, or launch command is enabled; native desktop consent exists but remains host-only and not connected to a production CE loader.

## Implemented sequence

1. **Trust enrollment:** the trusted Rust host enrolls a publisher's Ed25519 **public** verification key and immutable key ID in the protected profile SQLite trust store (`CePermissionStore::enroll_publisher_key`). The key has a validity window and cannot be reused after retirement/revocation. Package-supplied publisher names do not establish trust. `verify_signed_package` reloads the authoritative database every time and matches the actual Ed25519 signer to the stored bytes. No private signing key is persisted in Lu.
2. **Signed intake:** the CE package manager accepts a strict JSON envelope containing `format_version=1`, `key_id`, `manifest_json` (an exact JSON string), and `signature_hex`. The Ed25519 message is the UTF-8 bytes of `Lu-CE-Signed-Manifest-v1\0`, a big-endian u32 key-ID length, key-ID bytes, a big-endian u32 manifest length, and the exact manifest bytes. The manifest includes the artifact SHA-256 digest. Verification checks the pinned publisher, key status, expiry, signature, manifest schema and exact artifact bytes. **Only one native executable file is supported**, not zip/tar, DLLs, scripts, or arbitrary archive entrypoints.
3. **Quarantine and staging:** unsigned archives stay quarantined. A signed external CE receives the separate `Verified` metadata state, not `Enabled`. The host stages its verified bytes under a content-addressed private directory using create-new temporary files, sync, rename, and read-only executable permissions on Unix. The file is rehashed before each launch. The ordinary bundled-native registration path explicitly rejects signed external packages.
4. **User permission:** a trusted host's `CeApprovalGate::approve_confirmed` requires BOTH a persisted USER-turn verification and consumption of an exact, one-use confirmation from a trusted `TrustedCeApprovalSource` before calling the durable grant store. The prompt binds profile, conversation, user turn, package, actual digest/key/publisher, scope, tool, effect, and expiry. A different signer, tool, scope or revoked/retired key fails closed. **The native desktop UI adapter exists but is not yet connected to a production signed-package loader**, and Rust `CePermissionStore::approve` must remain a host-only API; no model or webview is trusted to claim consent.
5. **Process and broker:** on Linux only, the host-owned `SignedCeRuntime` launches the staged ELF through strict bubblewrap with a fresh user/PID/network namespace, empty root, read-only system runtime libraries, and the single executable. **The host workspace is not mounted.** A framed, bounded stdin/stdout protocol carries tool invocations and optional broker file reads/writes. The host checks conversation authority, host policy, signed manifest tool membership and durable grants on every broker request; paths are cap-std-confined, output is bounded, and replayed request IDs are denied. Network/device requests have no broker implementation and are denied.
6. **Revocation:** task/conversation revocation and durable CE permission revocation synchronously notify the supervisor. It aborts affected workers; cancellation drops the child guard and kills the process group, while the bubblewrap PID namespace prevents descendants surviving the namespace init. A timeout and frame-count limit also apply. Broker requests recheck permission after revocation.

## Wire contract (internal, untrusted worker)

Each signed worker frame is a **4-byte big-endian unsigned length** followed by a generated Protobuf `lu.v1.CeWorkerFrame` (max 128 KiB). Version 1 uses a tagged `oneof`: `invoke`, `read`, `write`, `broker_result` and `result`. Protobuf `bytes` replace JSON/base64; the decoder rejects invalid versions, missing required semantic fields, oversized payloads (64 KiB), unknown tags, duplicate tags, and noncanonical serialization. The Linux signed-worker integration fixture speaks this native wire format. Worker-selected tool IDs are resolved only against **host-owned** descriptors and durable approvals. No worker-supplied frame grants authority or chooses a host resource root.

The **inner tool-specific payloads** are now checked against a strict host-owned catalog of generated Protobuf contracts. Only `CeReadRequest/Result`, `CeWriteRequest/Result`, and `CeExecuteRequest/Result` may be advertised for the corresponding effect. Unknown types or mismatched effects fail closed. The host validates request paths, byte limits, execute tool identity, argument names/limits, result byte counts/status, and canonical Protobuf encoding at worker admission, broker access, and result handling. Extensions requiring any other message type must wait for a separately vetted, generated-schema adapter. A dynamic plugin-provided type registry is NOT permitted. Full argument-specific policy (such as resource quotas, semantic meaning of execute arguments, and real file identity pinning) remains future security work. External model APIs may continue to use JSON at their own boundaries.

## Non-negotiable release blockers

- **Windows:** the strict AppContainer **built-in diagnostic** now passes real file/network denial and descendant cancellation tests after restoring only essential Windows environment keys into the private scope. **Signed external worker launch remains disabled** on Windows until its distinct executable loader, ACL and handle-inheritance review and hostile-worker tests pass; never fall back to an unrestricted process or legacy shell sandbox.
- **macOS:** signed external launch is disabled until a hardened independent sandboxed helper and real hostile-worker tests exist.
- **Linux:** the signed worker/broker/revocation integration test passes on an ephemeral Ubuntu CI runner **after enabling unprivileged user namespaces** (Ubuntu's default AppArmor policy blocks them). The stricter hostile-worker test additionally attempts to read an existing host secret and connect to a live host loopback listener. Enforceable user/PID/network namespaces, descendant cleanup, resource quotas/cgroups, file identity pinning and broader hostile-worker tests must still pass on supported distributions. The current executable staging directory is host-owned but not protected against all same-user TOCTOU attacks. The runner's broker IPC is bounded but not yet an independently audited Protobuf protocol.
- **Host integration:** The desktop now has `LuCeConsentDialog` and a Rust host-owned `LuCeConsentState` queue. The webview may only list/deny/request review of a host-issued pending request ID; a native operating-system Yes/No dialog is the only source of positive confirmation. The Rust `CeApprovalGate` then re-verifies the persisted Jan USER turn and consumes an exact one-use OS-confirmation record before persisting a scoped grant. No user-facing CE package-install/launch action has been added: the trusted signed-package host must explicitly call `enqueue_host_signed_package` when the full CE desktop lifecycle is later wired. That host-only entry point verifies the exact signed bytes against the durable trust database, stages a single executable, and rehashes it before prompt creation and again before consuming the native Yes/No decision. A model/webview cannot create pending entries or choose executable paths. Profile-private directory ACL hardening, package disable/drain lifecycle, full signing/release workflow, and hostile UI event tests are still required.
- **Durable trust lifecycle:** publisher enrollment, exact public-key identity, unified key revocation and rotation now share the same transactionally updated, profile-private SQLite permission database. Rotation retires the old key, revokes its grants and emits synchronous supervisor notifications; approvals do **not** migrate to a new signing key. `CePermissionStore::open` reconciles orphaned, expired and retired grants on restart. The legacy `CePublisherTrust` in-memory verifier remains for tests/low-level use only; execution hosts must use `CePermissionStore::verify_signed_package` and the same store as the broker. Cross-process DB mutation is still unsupported; same-user DB tampering, secure desktop UI integration and trust enrollment UX require security audit. No private keys are stored.
- **Resource policy:** filesystem broker requests are limited to 64 KiB; no general network broker, GPU, device, or privileged API is available. No broad direct host filesystem access is permitted.

The implementation is intentionally opt-in through the Rust `lu-bridge` feature. **Do not ship external executable CEs until these conditions are verified.**

## Revocation/effect serialization (PR #10)

The CE broker's scoped `read_file` and `write_file` now acquire a short
`CePermissionStore::with_authorized_grant` lease after task/tool admission.
The lease rechecks exact signer identity, digest, scope, effect, user grant,
expiry and revocation state inside an SQLite `BEGIN IMMEDIATE` transaction
**held across the filesystem effect**. This is important beyond a Rust mutex:
another SQLite connection (or separate host process using the same trust DB)
cannot commit grant or publisher-key revocation until an already-authorized
operation completes. All trust/grant mutation transactions also use SQLite
`BEGIN IMMEDIATE`, so they wait on the effect lease instead of attempting a
deferred read-to-write upgrade that could fail with `SQLITE_BUSY`. A new operation after revocation commits fails closed.

The write's temporary file creation, data sync and final atomic rename are all
inside the lease. The read's bounded file read is inside the same fence.
Revocation listeners continue to cancel running workers after the durable
transaction commits; the lock is never held while notifying them. Host
operations under this fence are limited to small bounded file reads/writes,
**never** unbounded model execution, remote calls or user interaction. The
`require` check by itself is for admission, not authorization to commit a
later filesystem effect.

This closes a same-database permission-revocation TOCTOU window. It is not a
complete stop-the-world capability fence for worker execution, host-policy changes,
same-user arbitrary database tampering, host filesystem rename races, package
file-identity pinning, or resources administered by a different backend. Also,
revocation listener fanout currently belongs to the store handle that commits
the change: a separate process writing the SQLite file cannot automatically
cancel workers owned by another process. Multi-process CE hosts therefore
remain disabled until an authenticated cross-process invalidation protocol is
implemented. Those remain explicit release hardening work.

## Task-authority and signed-consent admission (PR #11)

The broker now wraps its bounded scoped reads and atomic writes in **two**
nested leases, in a fixed order: a `ConversationAuthority` read lock for the
exact task/user-turn/scope/tool/effect, followed by the durable SQLite grant
lease from PR #10. Task or whole-conversation revocation must acquire the
authority write lock and therefore cannot complete in the middle of the
authorized filesystem effect. Once it returns, a new effect fails closed.
Host policy and typed input are checked before the lease, and task identity
is checked again while the read lock is held. The lease is never held for
worker execution, network requests, desktop consent, or model inference.
This does not serialize external host-policy revocation or expiry that occurs
during a bounded effect.

The **host-only** `LuCeConsentState::enqueue_host_signed_package` entry point
takes the signed manifest envelope and executable bytes from trusted Rust
host code, verifies publisher trust and exact artifact digest using the same
durable `CePermissionStore`, stages the signed executable into a private
content-addressed directory, and queues the immutable consent prompt. The
pending record retains the staged artifact and rehashes it before a native
Yes can be consumed by `CeApprovalGate`. The previous direct
`enqueue_host_verified` entry point is no longer public. No webview or
model can supply an approval or initiate this flow. **No production host
caller has been connected yet**; this is a secure admission API, not a
user-visible CE installation or launch feature.

Adversarial regression coverage includes task and conversation revocation
races, forged task origins, wrong scopes/effects/types, hostile host policy,
noncanonical generated-Protobuf wire encodings, invalid relative paths,
inconsistent read/write receipts and malformed execute arguments. Remaining
release gates include authenticated desktop account/session ownership,
native OS consent end-to-end tests, staged file-identity pinning, external
policy revocation, multi-process invalidation and platform sandbox review.

## Native consent deadline fence (stacked draft)

A pending desktop CE consent request has a **120-second host-queue TTL**.
The deadline starts when the trusted Rust host enqueues the immutable prompt,
not when the user opens or dismisses the operating-system dialog. Both the
initial request consumption and the post-dialog Yes path reject an expired
request. The one-use native confirmation source also rechecks that same
original deadline when `CeApprovalGate` consumes the exact confirmation,
following persisted USER-turn verification. A late Yes is consumed and denied;
reopening the dialog or replaying the request ID cannot revive it. The
ordinary durable grant expiry is independent of this short consent TTL.

This is a bounded desktop-consent race hardening, **not** an authenticated
session-binding implementation or a guarantee of atomic deadline checking
inside SQLite grant commit. Full native OS consent integration tests remain
blocked by the GUI-linked test harness on standard Windows CI; the desktop
host compiles there, and these negative Rust tests are retained for a
future runnable native test environment. No signed-package loader caller,
third-party execution gate, installer, or model/webview admission API was
added.


## Desktop consent active data-folder fence (stacked draft)

The desktop captures the host-selected Jan/Lu data folder when
`LuCeConsentState` is constructed. A later `change_app_data_folder`
configuration switch must not silently reuse pending consent from the old
profile: host-only signed-package enqueue, pending-list, deny, and native
review all compare the current host-selected folder to that immutable
snapshot. The host checks again after the OS Yes/No dialog and immediately
before invoking the durable approval gate. A mismatch fails closed and
requires Lu to restart/reinitialize its consent state. This intentionally
does not migrate approvals or prompts between profiles.

This is **not** a complete authenticated profile/session ownership solution:
the current grant's `profile_id` and SQLite store still need binding to a
host-authenticated profile identity; a concurrent configuration change
between the last check and SQLite commit is not serialized; and a changed
on-disk configuration can be read independently of the in-memory state.
No external CE execution, installer, or new model-facing admission API is
enabled. The desktop unit test is compile-checked by Windows CI but still
needs execution in a working native GUI test environment.


## Desktop profile-switch / SQLite admission serialization (stacked draft)

The desktop now shares a host-owned read/write profile-configuration fence
between native CE consent and `update_app_configuration`. The latter also
covers the final configuration write in `change_app_data_folder`. Native
consent acquires a read lease after the OS modal returns and retains it through
`CeApprovalGate` and the SQLite grant commit. A profile configuration write
must wait until that bounded admission finishes; once the write completes, an
incremented host epoch permanently invalidates all consent queued before the
change, including an A-to-B-to-A switch. A failed or partial configuration
write also advances the epoch. An unavailable/poisoned fence fails closed.

This serializes **in-process, host-command configuration commits** with native
consent. It does not lock the entire potentially long data-folder copy, bind
`grant.profile_id` or the permission database to an authenticated host profile,
or protect against out-of-process edits to the configuration file. The latter
still needs a host-owned profile identity and hardened configuration storage.
No CE execution, installer, AppData mutation, or model-facing admission path is
introduced. Desktop regression tests remain compile-only in stock Windows CI.

## Host-authenticated profile/store binding (stacked draft)

The **trusted Rust desktop host** opens the CE trust/permission database through
`CePermissionStore::open_for_host_profile(active_lu_folder)`, not by passing
a caller-selected SQLite filename. The constructor derives a stable profile
namespace ID from the **canonical Lu directory's native path bytes**, creates
the private `lu-ce/permissions.sqlite` store, and records a **one-row immutable
host-profile identity** inside SQLite. No model, extension manifest or webview
may select that database or identity. It is a namespace integrity marker,
**not a bearer credential or a cryptographic authentication secret**.

The constructor rejects databases already bound to another profile, unbound
legacy databases that contain publisher trust or permission history, and
symlinked or insecure profile/store directories. Copies of a database from
one Lu profile to another retain their original recorded identity and fail
closed. Grant admission and broker checks independently reject profile IDs
that disagree with the bound database identity. The desktop signed-package
consent adapter additionally requires the exact fixed database path and
active host-derived profile ID when enqueuing a verified artifact and again
after the native Yes/No dialog, before SQLite approval, while the existing
profile-configuration read lease is held.

Existing low-level `CePermissionStore::open` remains for explicitly managed
host/test workflows and **must not be used as the desktop admission store**.
There is no automatic migration of old unbound grants: a future audited
migration UX must require new authenticated consent or deliberately reset
legacy permissions.

**Remaining limits:** A same-user attacker with the ability to mutate Lu's
trusted files can also edit SQLite and configuration; the path-derived ID
does not protect against that threat. Windows ACL ownership and file-identity
pinning still need separate OS hardening. Existing prompt-driven CE
installation/execution remains disabled; only the host-only admission
building block is implemented.

## Staged executable inode identity and no-overwrite publication (new draft)

The content-addressed CE stager now **holds an open handle** to each verified
worker artifact for the lifetime of its `StagedCeExecutable` and all clones.
Before an executable can be used, `verify_on_disk` compares the staged path
with the held file identity **before and after** bounded SHA-256 hashing.
On Unix, an otherwise identical file substituted at the pathname is rejected
if its device/inode differs, as are symlinks, unexpected directory changes,
modified bytes and incorrect file lengths. Reopening the stage preserves the
active runtime's original identity; it does not silently transfer authority.

Publication uses an atomic **no-replace hard-link** from a `create_new`,
synced temporary file, rather than a `rename` that can replace an already
published executable. Concurrent staging can only converge on one published
path; temporary files are unlinked. Private per-digest directories are created
with mode 0700 on Unix and are never automatically chmod-corrected if they
preexist with unsafe permissions. The Linux signed worker runtime rechecks
the pinned identity again *after generating the sandbox bind command and
before spawning bubblewrap*.

**Important remaining launch gate:** Linux bubblewrap still consumes a path
when performing the executable bind mount. A same-user attacker able to rename
trusted directories or swap the artifact *after the final identity check* can
still race that mount. Directly mounting/executing from the held immutable
file handle (or equivalently protected identity-attested launcher), plus
Windows ACL/file-ID hardening, is required before asserting full path-race
elimination. Signed external execution on non-Linux hosts remains disabled.
Adversarial staging tests exercise parallel publication, changed bytes,
same-content inode replacement, symlinked directories and workers.

## Staging-directory identity and executable mode (follow-on draft)

A verified CE worker can be hardlinked into a replacement staging directory
without changing its signed bytes or inode. To prevent a runtime from silently
adopting a substituted directory, the Unix stager now retains open handles to
both the trusted staging root and per-digest directory. It compares device,
inode, type and owner for those directory paths at staging and before/after
each worker hash verification. The staged worker must also be owned by its
private digest directory's owner and retain private, non-writable executable
mode `0500`. An existing file with matching signed bytes but writable or
public permissions fails closed.

Regression tests use **hardlinks to the original worker inode** after replacing
the digest directory and the root directory; both substitutions are rejected.
A writable-worker mode test rejects a valid signed artifact until its original
mode is restored. The prior parallel staging, symlink, digest and worker-inode
tests remain in the suite.

This does not close the final host-path race: the Linux bubblewrap process
still opens a pathname for its bind mount. Same-user filesystem mutation
between the last check and that mount remains possible. OS-backed immutable
handle-based launch is required for a complete solution; Windows/macOS
external signed-worker execution is still disabled.
