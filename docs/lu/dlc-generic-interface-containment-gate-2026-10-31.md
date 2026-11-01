# Lu universal DLC host — Windows/Linux containment and add-on boundary

**Date:** 2026-10-31, America/Phoenix (GitHub records UTC 2026-11-01)  
**Source branch:** `work/lu-generic-dlc-containment-20261101`  
**Review:** [draft PR #97](https://github.com/vjmichael/jan_alt/pull/97), built on [draft PR #96](https://github.com/vjmichael/jan_alt/pull/96)  
**Status:** **integration test candidate, not installed/released**

## Corrected product decision

**Lu Core is a general-purpose modular host. Cognitum is a separate optional downloadable DLC/Core Extension.** The Cognitum-origin Linux dev build was an integration experiment / *baseline* proving what an externally packaged capability can request of Lu. It is not a second Lu app, a required runtime or a reason to embed Cognitum-specific routing in the default product.

Every DLC, including unrelated IDE, Film/NVP, Research or Writing modules, must use the same Lu-owned registration/IPC/authority/containment/effect-journal facilities. No optional DLC may supply its own privileged dispatch path or silently grant authority. A DLC being installed, signed, trusted, discovered or suggested **never means it can execute in the current conversation**.

### Source separation applied

The preceding convergence branch accidentally embedded a Cognitum rational route and C05/C10 operation suggestions in `lu-core/src/capability_router.rs`. **These have been removed.** The current Lu-owned router contains no Cognitum IDs, Protobuf names, algorithms, dispatcher or default capability registrations. `BUILTIN_DLC_ROUTES` is explicitly empty.

A separately reviewed **host-proposed** route is accepted only when all of the following agree: the same saved current USER message digest (not prior chat), an enrolled host-owned rule identity, the registered native tool and exact effect, matching input/output Protobuf codec, a matching schema advertised to this exact turn, bounded typed arguments, and absence of a user no-tools request. The candidate alone never authorizes work. Existing `ConversationAuthority`, per-tool host policy, durable effect journal and OS worker sandbox remain mandatory. Invalid or ambiguous candidate/admission fails closed without executing.

The default Windows and Linux native desktop do **not** populate this candidate or trusted route list. The new `host_reviewed_route_durable` regression uses an isolated `acme.sample` `CoreExtension` fixture instead of Cognitum code.

## What containment currently proves

| Platform | Executable under test | Positive proof | Negative proof / limitation |
| --- | --- | --- | --- |
| **Windows** | Lu-owned, fixed diagnostic worker | AppContainer worker launched, blocked direct host secret and loopback access, descendant heartbeat stopped on cancellation | Extended test substitutes a **real host task revocation** for second cancellation and asserts denied relaunch. This must pass Windows native CI on the new source. |
| **Windows** | Signed arbitrary external DLC binary | **Not supported / not claimed** | The signed external DLC wrapper intentionally returns `None` and `SignedCeRuntime::start` rejects non-Linux hosts. A new Windows test rejects even a preselected arbitrary worker pathname or dummy descriptor; AppContainer diagnostic capability is **not** treated as signed package approval. |
| **Linux** | Generic signed `acme.worker` optional extension | Under required `LU_CE_REQUIRE_SANDBOX=1`, actual unprivileged Bubblewrap worker starts from a staged verified signature into a sealed image; worker's direct host file and loopback access fail; explicit typed host resource broker grants a read | Publisher key revocation aborts a live worker and prevents relaunch; absent sandbox always denies launch. This is a disposable test fixture, not Cognitum. |

Earlier Stage 2 `lu-core-ci` native runner evidence: [Windows AppContainer diagnostic and Linux signed CE](https://github.com/vjmichael/jan_alt/actions/runs/41270144608) — both test jobs passed on the Stage 2 source. New branch's independent OS matrix must pass before this change is accepted. Host containment is not the same as demonstrating a local GGUF model, NVP DLC or real Cognitum production worker.

## Worker / model authority contract

1. Model proposes untrusted content only. Native Lu host owns conversation ID, saved USER turn, task ID, execution scope, policy grant and expiry. Discovery of tool != permission.
2. Signed DLC package identity and exact worker hash must be verified and pinned, with explicit per-profile/scope/user approval stored durably. The installer cannot grant `ExecuteCode` on its own.
3. Lu host supplies a sealed isolated worker executable, denies direct access to the user's home, secrets and network by default, and supplies exact reviewed broker reads/writes. Linux: signed staged executable + Bubblewrap; Windows today: **diagnostic only**, with signed external DLC launch still pending independent hostile-worker review.
4. Host routes and model-selected effects execute through one durable effect journal with full revalidation. Already `EXECUTING` or `UNCERTAIN` effects are not replayed; cancellation, grant revocation and missing receipts must stop continuation.
5. Both platforms must terminate worker *and descendants*, release registrations, deny subsequent calls after revocation, and avoid leaking user paths, credentials, private error messages or package-provided environment variables into workers.

## Release gates remaining

- Complete new-branch `lu-core` all-targets Rustfmt, Clippy and full test suites on Linux and Windows.
- Run Windows AppContainer diagnostic **authority revocation** test and Linux actual signed generic extension **broker + publisher revocation** test on the same source SHA.
- Only after a separate security design and implementation: implement a **signed external DLC Windows** launcher with content-addressed worker, strict AppContainer/Job Object admission, no arbitrary fallback, validated Protobuf I/O, broker-only resources and forced descendant cleanup.
- Build NSIS and Debian desktop installers from the **same canonical Lu source SHA**; run actual installed GGUF/native tool/permission/cancel/save/restart acceptance on physical Windows and Linux. The differing OS packages are not separate Lu apps.

**No core bundling of Cognitum and no merger into the Windows alpha branch is authorized by these tests.**
