# Lu Windows x86-64 alpha acceptance — revised 2026-10-31

**Status: NOT DECLARED.** Windows x86-64 is the first target. Windows 11 CI verification does not establish Windows 10 x86-64 acceptance. This document supersedes the October 28 allowance for bundled, nonessential Jan/Cowork runtime components.

## Mandatory installed-product acceptance

1. **Standalone Lu installer:** A complete Lu-branded Windows x86-64 NSIS package installs, launches, survives profile/process restart, cleanly uninstalls, and requires no separately installed Jan executable, Jan data/profile or upstream update server. Preserve required Apache-2.0 and Jan-origin attribution notices.
2. **Real Lu-owned model:** Load a checksum-verified GGUF in the installed, Lu-supervised engine, generate a real answer through the Lu desktop, save it, and recover the identical assistant answer from a fresh host process without regeneration. Normal exit must terminate Lu-owned children.
3. **Real model-directed native tools:** An actual tool-capable GGUF must generate the tool request, whose conversation-bound host authority is checked; the Lu native Protobuf dispatcher must execute a permitted tool, reject unauthorized attempts, and return a real result which the model uses in its continuation and which is durably recorded. Mocked, deterministic or direct-IPC-only probes do not satisfy this gate.
4. **Cowork-independent distribution:** The *installed* Lu package must not require or bundle a legacy `jan-llama-worker.exe`, Cowork session runtime, inherited Jan/MCP agent-execution fallback, or nonessential Bun/UV runtime bootstrap. Legacy Cowork commands must not remain exposed from Lu's WebView capability/IPC surface. Native tools do not require MCP; the optional MCP adapter is not an alpha dependency.
5. **Fault localization and safe recovery:** Correlated diagnostics must distinguish source, build, engine, WebView, native tool, authorization, saved-state and installer failures. Contradictory or missing evidence is not PASS. Check cancellation, descendant termination and startup recovery without leaving unwanted workers or corrupting conversations.
6. **Binary/platform provenance:** A gate identifies exact source commit, installed executable and engine hashes, package manifest, architecture, model digest, OS build, test evidence, and whether checks used a development host or the real installed NSIS application.

## Six-gate integrated Windows candidate — 2026-10-31

Candidate branch `lu/windows-alpha-six-gates-20261031` is a non-release descendant of the canonical ULID/UUID authorization fix, combining the native-only NSIS packaging exclusions with the installed-GUI harness. The first attempt, [run 41252909244](https://github.com/vjmichael/jan_alt/actions/runs/41252909244) at `5964a015`, **FAILED BEFORE NSIS BUILD**: the workflow applied the disposable Jan→Lu Windows target overlay twice, and the second invocation's regression test correctly rejected a previously modified configuration. Host/source tests, bundled engine preparation, and licensing checks had passed up to that point; no new installer artifact was published and **none of the six installed product gates is claimed closed**.

The follow-up source fix removes the duplicate step and adds a one-shot overlay regression guard. The next proof must build the exact new NSIS and run genuine installed GUI→real GGUF→model-chosen native Protobuf tool→model continuation→cold restart; a disk-only second-process check is not sufficient by itself to certify restored GUI rendering. Preserve Windows 10, model/path authorization negatives, legacy IPC denial, Jan bootstrap removal, upgrade migration, worker descendant cleanup and independent provenance as explicit acceptance work. See [six-gate candidate ledger](./windows-six-gate-candidate-2026-10-31.md).

### Additional source preflight outstanding

[Lu Core contracts workflow 41252821917](https://github.com/vjmichael/jan_alt/actions/runs/41252821917) failed Rust formatting checks in `lu-core/src/lib.rs`, `native_chat_ids.rs`, `native_workspace_paths.rs` and `tests/real_gguf_tool_json.rs`. Source formatting must be repaired and independently checked before clean alpha promotion; this is a preflight failure, not evidence of model/tool malfunction. The corrected NSIS pipeline [41255104860](https://github.com/vjmichael/jan_alt/actions/runs/41255104860) was started at `8ab711865f47c79e3f2e02ac92bed1b6cd331a33` but is not credited as a successful installed Windows build until its verified result is known.

## Current evidence and specific blockers

| Requirement | Evidence | Outcome |
|---|---|---|
| Actual native GGUF chat, assistant persistence and cold-process restart | [DX-15E run 41224161266](https://github.com/vjmichael/jan_alt/actions/runs/41224161266), source `d0593a2728a61c949f3ae64dcd630a53748e2025` | **PASS for test-only Windows WebView2 host**, not NSIS |
| Windows desktop integration/cancellation regression | Runs 41224161364 and 41224161264, same pinned source | **PASS for tested source** |
| Windows runtime path/junction guard | [Run 41225920359](https://github.com/vjmichael/jan_alt/actions/runs/41225920359), commit `4b912e7b47503a861fc5cde743c6887f05ca3960` | **PASS independently**; integrated release not yet tested |
| Latest full Windows x86-64 NSIS package, cross-commit replacement and installed lifecycle | Original build [41227420821](https://github.com/vjmichael/jan_alt/actions/runs/41227420821), source `513969a77e1205cedb3b6ae7bb5d389acda94b60`; artifact `13053778288` SHA-256 `3c33c4959b43ac892bd9469c2667db05898049d797e9353384bd741be0842fb0`; independent installed [41232017298](https://github.com/vjmichael/jan_alt/actions/runs/41232017298) | **NSIS build, integrity, upgrade and installed lifecycle PASS**; original combined workflow failed obsolete eager-Jan-worker assertion; isolated corrected startup A/B/A/uninstall passed |
| Real GGUF → installed engine → Lu-native Protobuf tool → model continuation | [Run 41232017298](https://github.com/vjmichael/jan_alt/actions/runs/41232017298), job `real-model-protobuf-tool`, installed artifact `13053778288`, source `513969a77e1205cedb3b6ae7bb5d389acda94b60` | **PASS for independently invoked Lu-core integration against installed engine**; not yet shipping GUI model→tool routing |
| Legacy runtime removal and Cowork-free package | [NSIS build 41235830176](https://github.com/vjmichael/jan_alt/actions/runs/41235830176) and [installed re-test 41240948894](https://github.com/vjmichael/jan_alt/actions/runs/41240948894) | **PASS for installed native-only binaries, GGUF→native Protobuf tool→continuation, A/B/A profile restart and uninstall** after test-only journal/receipt fixes; **not full GUI/LCX independence or alpha certification** |
| Windows 10 x86-64 actual installation | Requires distinct target host/VM compatible with that OS | **NOT RUN**; Windows 11 CI result is not equivalent |
| Normal Lu-Win alpha certification | All mandatory package, native-tool, isolation and recovery gates | **NOT DECLARED** |
| Lu-owned native chat workspace path addressing | [Run 41245738491](https://github.com/vjmichael/jan_alt/actions/runs/41245738491), code [0946f645](https://github.com/vjmichael/jan_alt/commit/0946f64594824d2b81e98eeeaae4d6cc99fca579) | **PASS for Lu Core module tests and Rust lint on Windows/Linux**; no installed GUI proof or complete Jan dependency removal |


## Acceptance integrity rules

- Installer artifact exists only when the full NSIS build produces an actual executable; a green source compilation or previous installer is not today's package acceptance.
- If real-model tool JSON fails, record its own `FAIL` verdict. Still attempt clean uninstall and report whether packaging passed; never upgrade the failed model gate to PASS.
- A legacy startup smoke requiring `jan-llama-worker.exe` or an empty MCP config proves compatibility only; it **fails the independence requirement**, regardless of green CI.
- Native-only source edits that remove plugin initialization or sidecars are **candidates** until the exact built Windows artifact has installed/GUI/native-tool evidence.
- Do not claim that user-owned Qwen 3.8 27B Q4 behavior was reproduced by the CI's small Qwen2.5 0.5B GGUF; they are distinct models/test budgets.
- The installed package's actual local paths, Windows permissions and runtime configuration need independent test; a source-only JSON capability verifier does not prove live denial.
- User consent, independent Guardian and automatic rollback for Lu's later self-development are documented in [ADR-LU-DRC-001](./lu-development-release-control-adr-2026-10-31.md). **They are future Core gates and are not a substitute for first Windows alpha.**

## Release decision

No alpha designation until the new **installed NSIS** and **real model-directed native Protobuf tool** gates pass, the **Cowork/Jan bootstrap extraction** is validated, and cancellation/recovery/security issues are resolved or explicitly dispositioned without hiding blockers. Record artifact digests, test operating system, source commit, runtime dependencies, observed failures and user-visible limitations before any approval.

GitHub remains an optional repository and verification archive, never Lu's primary development hub.

## Next-stable core independence and common IPC milestone — October 31, 2026

The user selected **Lu-owned critical and core execution** as the next stable-release *target*, not an immediate release grant. The candidate branch is `work/lu-core-owned-next-stable-20261031`; [milestone engineering document](https://github.com/vjmichael/jan_alt/blob/work/lu-core-owned-next-stable-20261031/docs/lu/lu-core-owned-next-stable-milestone-2026-10-31.md). LCX-01 adds a separate LuChatTransport that rejects Jan provider/tool runtime control; the real chat route/session store still needs migration and installed GUI evidence. Do not tag or install this candidate until all acceptance gates pass.

The cross-platform DLC transport is independently implemented on `lu/ipc-common-af-unix-20261031`, [source commit 81dfa358](https://github.com/vjmichael/jan_alt/commit/81dfa358b3f79922c59516745c8f8175fe1ce5bd) and [implementation/status](https://github.com/vjmichael/jan_alt/blob/lu/ipc-common-af-unix-20261031/docs/lu/ipc/native-af-unix-implementation-2026-10-31.md). Native Linux and Windows AF_UNIX headless tests **both passed** [workflow 41239862112](https://github.com/vjmichael/jan_alt/actions/runs/41239862112), with no TCP, WSL or Named Pipe fallback. These are transport tests only, not application host security, Cognitum C05 or production worker-lifecycle authorization.

**Release blockers:** true LCX Lu chat runtime replacement, end-to-end GGUF/native tool durable journal correction, provisional smoke-verdict verifier integration, authenticated Lu host/AF_UNIX profile and replay controls, Windows ACL/reparse safety and Job Object worker cleanup, Cognitum integration, and rollback/Guardian acceptance. D01 experimental Cognitum bridge source reconciliation is OPEN because its exact archive is not accessible in this development workspace. Keep Windows installer, Lu chat and IPC code on separate audited branches; GitHub is source/evidence storage, not the development hub.

### Independent Lu chat execution — verified staged implementation

- **LCX-01 source/Windows frontend PASS**: [workflow 41240348767](https://github.com/vjmichael/jan_alt/actions/runs/41240348767). LuChatTransport replaces the Jan transport at the contract layer and rejects cross-thread reuse and missing native selection. **Still not mounted into actual Lu chat route**.
- **LCX-02 source/Windows frontend PASS**: [workflow 41240708754](https://github.com/vjmichael/jan_alt/actions/runs/41240708754), [candidate commit 6ced925](https://github.com/vjmichael/jan_alt/commit/6ced9252e14d147c4c57ebd6080363c64e7e65e9). New Lu-only per-conversation session store and useLuChat hook passed status, identity, isolation and cleanup tests, alongside the existing native inference tests and Lu-branded UI build. Not yet a shipping conversation-screen integration.
- **Native-only Windows journal retest**: [workflow 41240948894](https://github.com/vjmichael/jan_alt/actions/runs/41240948894), source [9d030f6](https://github.com/vjmichael/jan_alt/commit/9d030f61b80594fc3c1d6d2e42c193d627692949). Reuses the immutable NSIS package from the failed prior run. Validates the full actual model/tool/journal sequence with optional second ParsedCandidate and restores the missing provisional smoke-verdict validator. **No success claimed while executing**.
- **AF_UNIX Linux/Windows headless transport** remains [PASS on both native runners](https://github.com/vjmichael/jan_alt/actions/runs/41239862112); authorization, profile/Windows ACL, replay, cleanup, Cognitum C05, and D01 ancestry reconciliation still **OPEN**.

**Next stable promotion remains BLOCKED** until LCX-03/04 actual Lu main-window route isolation, installed native GGUF tool and durable journal, compatibility migration/uninstall, security/cancellation/rollback, and explicit user approval. A compiled standalone hook or socket transport does not confer release authority.

### Corrected installed native-only verification — October 31, 2026

The earlier NSIS job failed its tool gate because the test required seven journal records even though an accepted final response can legitimately omit the optional second ParsedCandidate record (six required durable records still preserved). A separate [test-only repair commit](https://github.com/vjmichael/jan_alt/commit/a63815304277e7bf65cfed160015a2613a3ddd34) updated the verifier to require exact six- or seven-event order with both model outputs, tool feedback and final response matched against the returned evidence, and restored the missing provisional receipt validator. It did **not** modify the previously built NSIS binary.

A new independent Windows 2025 [actual installed retest 41240948894](https://github.com/vjmichael/jan_alt/actions/runs/41240948894) reused the exact NSIS checksum `35acb87b602ed2a5313c70e8cadf79b77965dc6b91993c6820bcbfc64b6f9be3` and produced `LU_REAL_GGUF_NATIVE_TOOL_JSON_PASS generations=2 tools=1 worker_recovered=true`, `LU_INSTALLED_NATIVE_GGUF_TOOL_TURN_PASS`, `LU_W05_INSTALLED_PROFILE_RESTART_PASS`, `LU_NATIVE_ONLY_INSTALLED_PAYLOAD_PASS legacy_executables=0`, `LU_NATIVE_ONLY_UNINSTALL_PASS`, and provisional receipt `alphaAccepted=false`. Audit artifact ID `13057965231`. [Exact outcome documentation](https://github.com/vjmichael/jan_alt/blob/work/lu-win-native-only-journal-evidence-repair-20261031/docs/lu/windows-native-only-journal-evidence-retest-2026-10-31.md).

This is a **passed headless native model/tool test against the actual installed engine**, not a UI click-through acceptance of the main conversation route, Windows 10 proof, or independent Guardian promotion attestation. The next stable Lu-owned execution milestone still awaits LCX-03/04, full Windows GUI tool/display/persistence, legacy in-place upgrade, and host-authorized AF_UNIX DLC lifecycle.

## Installed UIA native-chat identity reconciliation — 2026-10-31

An **independent exact native-only NSIS GUI** accessibility preflight passed on [Windows 2025 run 41248206286](https://github.com/vjmichael/jan_alt/actions/runs/41248206286): real installed `Lu-Desktop.exe` exposed its actual desktop window, GGUF picker and message input through Windows UI Automation. This requires no CDP, injected JS or special debug binary. It did **not** load a model or execute a tool.

A subsequent full unchanged-installed-GUI test [run 41248511003](https://github.com/vjmichael/jan_alt/actions/runs/41248511003) loaded a real pinned Qwen GGUF and selected Lu native chat, but failed during first UI input; the tester was repaired. [Run 41249002699](https://github.com/vjmichael/jan_alt/actions/runs/41249002699) reached GUI Send but did **not** establish a persisted assistant after 200 seconds, and failed correctly. Do not treat the real GGUF load or the click alone as proof of a model-generated native tool or conversation recovery.

**Source incompatibility found:** frontend `useThreads.createThread()` uses canonical 26-character ULIDs, while the host's `read_only_turn_context` previously accepted only canonical UUIDs. This also affected the first version of the GUI test fixture, which inspected UUID-only thread names. Lu Core now checks canonical ULIDs and UUIDs, with exact saved USER role and conversation-bound authorization **unchanged**. Implementation [1d869d4](https://github.com/vjmichael/jan_alt/commit/1d869d4d6b35d7f01d27c080e96b0b6c7f14e3d4) and [native Windows/Linux tests 41249455181](https://github.com/vjmichael/jan_alt/actions/runs/41249455181) both passed. The GUI test suite now uses canonical ULID/UUID identity checks and locally passed 8/8 evidence-boundary tests.

**Not a GUI-gate pass:** the pinned native-only NSIS originated from source `7fae3e19c42bf58d2223a4ea675690438a821e74`, before this correction. The old binary cannot validate the new host behavior. A new native-only installed binary **containing the ULID correction**, compiled from one reconciled Lu Windows source, must complete real GUI model → native Protobuf tool → journal → saved assistant → GUI cold restart. The original full gate and release alpha remain **OPEN**. Historical NSIS-only GUI workflow is manual-only until repinned, so source edits cannot accidentally trigger repeated, uninformative runs against an obsolete binary.

Independent scope: Cognitum Linux test branch and common IPC prototype are unchanged. GitHub is source storage / independent evidence, not the Lu development hub.
