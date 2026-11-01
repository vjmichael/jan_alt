# LU-WIN-6G: integrated Windows native-only candidate

Date: 2026-10-31. Branch `lu/windows-alpha-six-gates-20261031`; based on the Windows alpha staging branch after ULID/UUID correction.

This is one isolated Windows integration candidate; not a second Lu product or stable release. It imports only the audited native-only Jan bootstrap/IPC exclusion, NSIS resource/capability changes, Windows target overlay fix, profile smoke scripts, and six/seven-entry model audit test from the prior Windows native-only branches, preserving the more recent Lu Core identity and workspace-path repairs. The Cognitum Linux dev and IPC experimental branches are untouched.

## Six gates to close, with independent verdicts

1. **Build** a new Lu-only x86-64 NSIS package from the current commit; verify immutable SHA-256 and zero bundled Jan worker, Bun and UV.
2. **Install/model** the actual NSIS binary in a disposable Windows runner; use the bundled Lu-owned engine and checksum-verified real Qwen GGUF.
3. **Installed GUI tool**: the model must generate a legitimate Lu read-only tool request via the installed application GUI, with Protobuf dispatch and model continuation.
4. **Cold restart**: a second genuine Lu desktop process must restore the identical assistant content, message identity and audit after normal exit, without regenerating.
5. **Safety/cleanup**: reject inherited app/tool authority and unsafe payloads, preserve profile boundaries, terminate owned processes and uninstall cleanly.
6. **Provenance**: record source revision, real executable/installer/engine/model digests, exact Windows version, and tool GUI vs headless scope.

## Build composition and verification

The validation harness `scripts/lu/run-installed-lu-gui-tool.ps1` accepts explicit `-ExpectedCommit` and `-ExpectedInstallerSha256` parameters; the new NSIS workflow must pass the *freshly built* values. Historical test defaults remain immutable for older preflight runs. It never accepts an unpinned or repacked test binary. The on-disk directory layout remains unchanged. `src-tauri/tauri.windows.conf.json` is rewritten **only in a disposable build checkout** using the validated Lu overlay to suppress automatic Jan worker/Bun/UV reintroduction.

This branch's source commitments are NOT evidence that an installer, model, GUI, tool or persistence actually passed. Record each result from the exact Windows run. A successful installer build is only gate 1, not the other five gates. GitHub is an optional source and independent verification archive, not the Lu development hub.


## October 31 — first integrated run result, blocker and correction

**Latest evaluated run:** [41252909244](https://github.com/vjmichael/jan_alt/actions/runs/41252909244), source commit `5964a015b4e716ea4dd6898536339de1316d64df`: **FAIL before NSIS compilation**. The preceding checks completed, including Windows host/identity, canonical chat-ID and GUI evidence unit tests, installer script parsing, JavaScript/Tauri dependency build, icons/licenses, sealed Lu-owned CPU inference engine and resource-manifest checks. One disposable native-only Windows target-config override ran successfully. **The following duplicate override step then failed:** it reran the pre-mutation regression fixture against the already-rewritten Windows config (expected original upstream targets `['nsis','msi']`; found rewritten `['nsis']`). No new NSIS installer exists from this run. The upload step's success means only that the artifact uploader executed, not that an installer was uploaded; the artifact list was empty.

**Correction:** Remove the redundant second overlay/mutation step from the NSIS workflow; retain the original guarded disposable override. Add `check-single-native-only-overlay.mjs` with regression tests requiring exactly one application before packaging, a disposable-build flag and a freshly SHA-pinned GUI test. Six local prototype regression tests passed; the committed seven-case regression suite must pass on the corrected Windows candidate. A new Windows NSIS run on this corrected revision is required before Gate 1 can move to PASS.

### Six-gate state and next evidence

| Gate | Status | Remaining work / acceptance witness |
| --- | --- | --- |
| G1 — Corrected native-only NSIS executable | **OPEN / first attempt failed before compilation** | Build from corrected commit; record a real NSIS executable, exact SHA-256, Lu identity, zero Jan worker/Bun/UV in installed inventory |
| G2 — Installed GGUF in Lu GUI | **OPEN** | Install that exact NSIS on disposable Windows; load SHA-pinned real Qwen GGUF through the Lu model selector, confirm Lu-supervised worker and generated assistant response |
| G3 — Model-selected native Protobuf tool in installed GUI | **OPEN** | Persist a real USER turn, model originates `lu_files_read_text`, host conversation-authorizes and dispatches it, tool-only marker appears in model continuation; verify no Jan/MCP fallback |
| G4 — Cold process/chat/audit recovery | **OPEN** | Exit normally, prove worker cleanup, launch a second installed Lu process, compare exact saved assistant ID/text and SQLite audit; additionally verify **GUI rendering of restored transcript**, since the existing UIA harness only rechecks disk after restart |
| G5 — Host authority/cleanup/uninstall/negative cases | **OPEN** | Refuse cross-conversation and foreign/cancelled requests, path traversal/reparse and legacy IPC, prove owned process-tree cleanup, profile isolation, no unwanted executables and clean uninstall. Source guards and historical headless tests do not replace installed evidence |
| G6 — Provenance/platform record | **OPEN** | Tie source SHA, installer/main executable/engine digests, real GGUF digest, Windows edition/build, test route, negative cases and verdicts to **the same installed artifact**. Windows 10 x64 remains a distinct untested host gate |

### After the six gates

Before calling Windows alpha broadly ready, independently resolve **LCX core execution independence** (remaining critical Jan-derived routes/plugin dependencies), full Windows 11 physical-machine installed testing, Windows 10 x86-64 support where claimed, clean old-to-native upgrade/migration including removal of old Jan worker files, Windows Job Object descendant cleanup, fault localization and a trustworthy report of remaining restrictions. The future release Guardian/self-development promotion requirements are **not** proof of alpha readiness and remain a separate later milestone. No Cognitum Linux or experimental IPC source is merged by this Windows candidate.

**Repository role:** GitHub is the source history, documentation and optional independent runner/evidence archive. Lu development should remain local-first.

### Additional independent source-quality failure

The earlier Lu Core workflow [41252821917](https://github.com/vjmichael/jan_alt/actions/runs/41252821917) failed its **`cargo fmt --check` formatting gate**, not tool execution. The Rust formatter reported differences in four files: `src-tauri/lu-core/src/lib.rs`, `src-tauri/lu-core/src/native_chat_ids.rs`, `src-tauri/lu-core/src/native_workspace_paths.rs`, and `src-tauri/lu-core/tests/real_gguf_tool_json.rs`. Correct formatting locally using the pinned toolchain and recheck the exact candidate; do not change source while a different commit is under active installer verification. This is an independent outstanding gate, not proof of a failed model or Windows binary.

**Corrected six-gate run:** [41255104860](https://github.com/vjmichael/jan_alt/actions/runs/41255104860), source `8ab711865f47c79e3f2e02ac92bed1b6cd331a33`, was initiated following the duplicate-step fix. Treat as **not yet accepted** until actual job conclusion and artifacts have been reviewed. A newly started workflow is not a completed installed-product test.

## Gate 4: independent visible GUI readback contract (source only)

The previously used installed Windows UIA harness only revalidated on-disk SQLite/JSONL after launching desktop process B. Commit containing `scripts/lu/run-installed-lu-uia-full.ps1` now adds `Open-SavedThreadLink` and `Has-VisibleRestoredProof`: it opens the saved Lu chat through a real accessible sidebar hyperlink in process B, checks an onscreen UIA Text element for the secret tool-only marker, then rechecks the durable journal. It fails if the answer is merely saved but not actually rendered. A separate Windows syntax/source contract and local mutation suite verify that the new readback is not silently removed. **Neither source tests nor a successful cold-storage probe close Gate 4; an actual newly installed Lu GUI run must show the `LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS` witness from the correct pinned installer.**

## Independent source verification — Windows/UIA and Rustfmt

- **Gate 4 test hardened:** commit [e8d3df4](https://github.com/vjmichael/jan_alt/commit/e8d3df448959485fc25794450d1aab58423158a2) makes the installed UI Automation driver click the saved thread in desktop process B, require the tool-only marker in visible UIA Text, and independently recheck SQLite/JSONL. It explicitly refuses disk-only as a GUI success. The real installed UIA round-trip is **NOT YET PASSED**.
- **Windows syntax and source witness PASS:** [run 41256280010](https://github.com/vjmichael/jan_alt/actions/runs/41256280010) passed the mutation suite, live checked-in source contract, and Windows PowerShell parser. **Test-only, no model or installer acceptance.**
- **Rust formatting source witness PASS on both OSes:** [run 41256428557](https://github.com/vjmichael/jan_alt/actions/runs/41256428557) checked Rust 1.98 `cargo fmt --all --check` on Windows 2025 and Ubuntu 24.04 using the exact 13-hunk formatting-only repair at [commit 8d25635](https://github.com/vjmichael/jan_alt/commit/8d256353d2bdf49b249f87d9ddb7cec861378515) on `work/lu-win-sixgate-rustfmt-repair-20261031`. The formatting repair is **not merged into the currently building NSIS source commit**; keep binary provenance unambiguous, then reconcile that source change after installer verdict.
- **Corrected NSIS build** [run 41255104860](https://github.com/vjmichael/jan_alt/actions/runs/41255104860), pinned to `8ab711865f47c79e3f2e02ac92bed1b6cd331a33`, reached `Build independent Lu NSIS installer for Windows x86-64` after source/native-engine checks. Its outcome is **pending/not accepted as of this entry**. Check actual job conclusion and artifact manifest before changing G1.

GitHub is used for source and independent verification records; not as the Lu development hub. The Cognitum Linux/IPC branches have not been changed.
