# Lu AF_UNIX IPC-04A — host-scoped one-shot admission (experimental)

Date: 2026-10-31. Branch: lu/ipc-common-af-unix-20261031.

## Implemented as a source-only experimental gate

This change introduces `lu_ipc_common::authority` *inside the isolated crate*, still not added to desktop Cargo or a shipping installer. It does not launch any worker or authorize any native operation.

- Host mints a cryptographically random 256-bit proof with the OS entropy source; no timestamp-derived credentials, model-controlled credentials, or fallback entropy.
- One credential is valid for at most 60 seconds and at most one successful socket admission; capacity is bounded to 64 pending grants.
- The connection is only admitted against a host-held, exact profile/workspace/conversation/turn/tool/effect scope, using constant-time proof comparison.
- Host can revoke a pending grant or an already admitted stream. Scope is rechecked before and after reads and before reply writes.
- The authenticated wrapper does not expose an unchecked `Read`/`Write` trait. Every call requires an explicit trusted host scope and a pure Protobuf-validation callback.
- The carrier now offers an absolute read deadline, preventing a client from sustaining an incomplete frame indefinitely by trickling bytes below the ordinary per-read timeout.
- Admission does **not** equate model-provided `tool_id` / `workspace_id`, socket path ownership, or a claimed conversation ID with authorization.

Tests were added for: valid one-shot admission, wrong-profile/workspace/conversation/turn/tool/effect refusals, explicit revocation, counterfeit credentials, expiry, invalid IDs, and host validation rejection. The GitHub matrix workflow automatically includes these tests. **Native Windows CI, Windows ACL/reparse defenses, integrated Lu Protobuf decoding, process identity, protected credential transfer, host death and descendant cleanup, actual worker launch, Cognitum C05 execution, and Windows desktop regression remain OPEN.** In particular, the new unit tests use in-process handoff of the proof, not a production-grade worker launch channel.

## Threat boundary / required integration gates

1. **Launch channel:** trusted host must pass the proof via a protected inherited one-shot OS handle; never put it in argv, environment, model messages, or a globally readable file. Confirm Windows security descriptors and peer process ownership, and Linux directory ownership/permissions across every ancestor. Credential possession is not OS peer identification.
2. **Typed policy:** trusted host must decode `lu.v1.ToolCall` with its actual versioned Protobuf schema, derive turn and active conversation from saved host state, match tool/effect against the granted scope, enforce cancellation and per-turn privileges, then journal the effect. A validation callback supplied by a test is not a security implementation.
3. **Revocation and cleanup:** stop admitting new work on conversation switch/cancel/host death, terminate *the entire* native worker process tree with bounded wait, and verify no surviving process or half-committed effect.
4. **Release:** keep this experimental crate out of shipping builds and mark IPC-04 only PARTIAL until all host, OS and Windows gates are passed. The current prototype cannot make Lu stable.

Cross-platform authority is a *host property*, not an AF_UNIX or Protobuf property. Keep the LCX (Lu Chat Runtime Independence) release gates separate from this isolated transport experiment. GitHub archives source and evidence; developer testing should run locally when a toolchain is available.

## Validation note

The replay test re-sends the identical binary proof and requires rejection on its second connection. Scope/revocation integration tests use a ready channel so cancellation cannot race ahead of the pre-revocation assertion. Test socket paths are shortened to fit the conservative Windows native AF_UNIX path budget. Absolute frame-read timeouts adjust only the read timeout, so a near-expired read cannot accidentally shorten the subsequent reply's write timeout.

## IPC-03B — canonical typed envelope gate

The standalone crate now runs a build script against the *existing* `../lu-core/proto/lu/v1/core.proto` using vendored protoc and Prost, so no shadow ToolCall schema can drift. Host-bound admission exposes no unchecked Read/Write methods. Its typed read rejects any mismatched contract version, call ID, tool ID, explicitly absent or different workspace ID, schema URL, unknown fields, duplicate wire fields or noncanonical serialization. Typed replies use the host-selected call ID and result type, and failure messages carrying arbitrary worker text are rejected.

These checks do **not** decode individual request messages (for example `ReadTextFileRequest`), authorize actual effects, mint saved user turns or launch workers. Those are mandatory host work and remain OPEN. Follow-up matrix results are required for this new build-script change.
