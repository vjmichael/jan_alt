# Lu Windows x64 — full process restart persistence gate

Status: **first two-process writer/reader implementation committed; CI not yet observed passing**.
Base: `lu/windows-x64-preview-build` at `f373f4672a72791e694bd95bdf251ac84cdb5b8f`.
Target: Windows x86-64 only. No changes to main, production installer, user's AppData, or Jan registration.

## Why this gate exists

The 10/10 WebView2 + real GGUF tests establish functional streaming and persisted
thread reload. `e2e/specs/lu-real-gguf.e2e.ts` calls `browser.refresh()`; this
restarts the webview, **not** the Lu native process. The WDIO runner explicitly
shares one live Tauri process across specs (`e2e/wdio.conf.ts`).
Launching another spec in that run is therefore insufficient evidence.

## Two-process acceptance experiment

1. Use a disposable Windows GitHub Actions runner with a unique, runner-owned
   profile. Pin the known GGUF checksum and verify bundled worker provenance.
2. **Phase A — first process:** launch the *test-only* Lu E2E binary. Configure
   a local provider for its bundled inference worker. Use the actual GUI to
   select the model and produce a non-empty streamed assistant response.
3. Wait for native thread persistence, then store the thread ID, exact text of
   each turn, model ID, and durable thread-file path in an external test
   checkpoint inside runner temporary storage. Assert files exist, content is
   structurally valid, and no incomplete in-flight generation remains.
4. Terminate the desktop process, await OS-confirmed process exit, and record
   its PID and exit status. Shut down its worker and WebDriver listener.
5. **Phase B — second process:** launch a *new* Lu desktop with the *same*
   disposable profile. Assert PID differs from Phase A and the prior PID is no
   longer alive. Attach a fresh WebDriver session.
6. Navigate from `/` to `/threads/<id>` using SPA navigation; do **not**
   refresh a deep-path URL (the asset protocol does not provide SPA fallback).
   Compare exact restored user text, assistant text, message order, and model
   selection to the external checkpoint. Assert no duplicated turns.
7. Send another prompt and verify a complete response. This confirms the
   restored conversation is usable rather than merely rendered.
8. Shut down the second desktop, then compare known Jan AppData and
   `jan://` registration sentinels with their pre-test values.
9. Repeat the persistence acceptance path for an installed **release-profile**
   Lu build using a suitable external UI driver, rather than inferring release
   behavior from the E2E-feature debug build.

## Test isolation and failure policy

- No real user profile directories. Never install or run on the user's PC.
- No automatic resets/cleanup against unknown paths; recursively delete only
  paths created under the runner's own temporary root.
- A missing, corrupt, or incompatible persisted thread must cause a visible,
  attributable test failure and must not silently overwrite the original.
- Capture both process identities, exact commit, model digest, installer digest,
  native storage assertions, and CI run URL in the readiness document.
- Keep model-initiated native tools and built-in GGUF model-library import as
  separate acceptance gates. Their absence must not be represented as a pass.

## Current verdict

**Open / not yet run.** Existing webview reload tests are valuable but do not
satisfy the full restart gate. No production-readiness claim is authorized.


## Implementation checkpoint — October 27, 2026

- `e2e/specs/lu-process-restart.e2e.ts`: opt-in `write` and `read` phases, real GGUF chat, external exclusive-create checkpoint, exact transcript restoration assertions.
- `e2e/wdio.conf.ts`: `LU_E2E_RESTART_PHASE` isolates the spec from the baseline GUI suite.
- `.github/workflows/lu-windows-process-restart-e2e.yml`: launches independent WDIO processes with a shared disposable runner profile and checks the first app is no longer alive before phase B.
- **Not yet verified:** No green Windows CI run. Phase-A-to-phase-B process identity and release-installer path need stronger assertions. The reader presently validates transcript restoration only; resumed chat following model-worker rebind, corrupt-store negative testing, and real installer E2E remain outstanding.
- Security reminder: never infer production acceptance from this debug WebDriver harness; inspect CI evidence before checking any item off.
