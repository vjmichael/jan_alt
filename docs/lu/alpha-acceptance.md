# Lu Windows x86-64 alpha acceptance — revised 2026-10-31

**Status: NOT DECLARED.** Windows x86-64 is the first target. Windows 11 CI verification does not establish Windows 10 x86-64 acceptance. This document supersedes the October 28 allowance for bundled, nonessential Jan/Cowork runtime components.

## Mandatory installed-product acceptance

1. **Standalone Lu installer:** A complete Lu-branded Windows x86-64 NSIS package installs, launches, survives profile/process restart, cleanly uninstalls, and requires no separately installed Jan executable, Jan data/profile or upstream update server. Preserve required Apache-2.0 and Jan-origin attribution notices.
2. **Real Lu-owned model:** Load a checksum-verified GGUF in the installed, Lu-supervised engine, generate a real answer through the Lu desktop, save it, and recover the identical assistant answer from a fresh host process without regeneration. Normal exit must terminate Lu-owned children.
3. **Real model-directed native tools:** An actual tool-capable GGUF must generate the tool request, whose conversation-bound host authority is checked; the Lu native Protobuf dispatcher must execute a permitted tool, reject unauthorized attempts, and return a real result which the model uses in its continuation and which is durably recorded. Mocked, deterministic or direct-IPC-only probes do not satisfy this gate.
4. **Cowork-independent distribution:** The *installed* Lu package must not require or bundle a legacy `jan-llama-worker.exe`, Cowork session runtime, inherited Jan/MCP agent-execution fallback, or nonessential Bun/UV runtime bootstrap. Legacy Cowork commands must not remain exposed from Lu's WebView capability/IPC surface. Native tools do not require MCP; the optional MCP adapter is not an alpha dependency.
5. **Fault localization and safe recovery:** Correlated diagnostics must distinguish source, build, engine, WebView, native tool, authorization, saved-state and installer failures. Contradictory or missing evidence is not PASS. Check cancellation, descendant termination and startup recovery without leaving unwanted workers or corrupting conversations.
6. **Binary/platform provenance:** A gate identifies exact source commit, installed executable and engine hashes, package manifest, architecture, model digest, OS build, test evidence, and whether checks used a development host or the real installed NSIS application.

## Current evidence and specific blockers

| Requirement | Evidence | Outcome |
|---|---|---|
| Actual native GGUF chat, assistant persistence and cold-process restart | [DX-15E run 41224161266](https://github.com/vjmichael/jan_alt/actions/runs/41224161266), source `d0593a2728a61c949f3ae64dcd630a53748e2025` | **PASS for test-only Windows WebView2 host**, not NSIS |
| Windows desktop integration/cancellation regression | Runs 41224161364 and 41224161264, same pinned source | **PASS for tested source** |
| Windows runtime path/junction guard | [Run 41225920359](https://github.com/vjmichael/jan_alt/actions/runs/41225920359), commit `4b912e7b47503a861fc5cde743c6887f05ca3960` | **PASS independently**; integrated release not yet tested |
| Latest full Windows x86-64 NSIS package, cross-commit replacement and installed lifecycle | Original build [41227420821](https://github.com/vjmichael/jan_alt/actions/runs/41227420821), source `513969a77e1205cedb3b6ae7bb5d389acda94b60`; artifact `13053778288` SHA-256 `3c33c4959b43ac892bd9469c2667db05898049d797e9353384bd741be0842fb0`; independent installed [41232017298](https://github.com/vjmichael/jan_alt/actions/runs/41232017298) | **NSIS build, integrity, upgrade and installed lifecycle PASS**; original combined workflow failed obsolete eager-Jan-worker assertion; isolated corrected startup A/B/A/uninstall passed |
| Real GGUF → installed engine → Lu-native Protobuf tool → model continuation | [Run 41232017298](https://github.com/vjmichael/jan_alt/actions/runs/41232017298), job `real-model-protobuf-tool`, installed artifact `13053778288`, source `513969a77e1205cedb3b6ae7bb5d389acda94b60` | **PASS for independently invoked Lu-core integration against installed engine**; not yet shipping GUI model→tool routing |
| Legacy runtime removal and Cowork-free package | [Native-only status and evidence](./windows-native-only-legacy-runtime-extraction-status-2026-10-31.md); Windows [run 41235830176](https://github.com/vjmichael/jan_alt/actions/runs/41235830176) | **PARTIAL / NOT ACCEPTED**: real NSIS compiled, installed inventory zero Jan/Bun/UV, Lu startup and A/B/A profile isolation passed; real GGUF tool-run journal assertion failed (6 vs 7) and smoke verifier was missing |
| Windows 10 x86-64 actual installation | Requires distinct target host/VM compatible with that OS | **NOT RUN**; Windows 11 CI result is not equivalent |
| Normal Lu-Win alpha certification | All mandatory package, native-tool, isolation and recovery gates | **NOT DECLARED** |

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
