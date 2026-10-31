# DRC-00–DRC-12 — Lu Development & Release Control acceptance matrix

**Status:** Proposed implementation gates from accepted architecture ADR-LU-DRC-001 (2026-10-31). **Not yet passed.** Evidence cannot be borrowed from an unrelated deterministic/mock suite or a different source commit.

| Gate | Acceptance criterion | Required independent proof |
|---|---|---|
| **DRC-00** | Windows alpha is accepted first, with known-good install and real GGUF/native tool path | Exact Windows x86-64 NSIS build, installed WebView host, real model→authorized Protobuf native tool→response, persistence, restart, cleanup; Windows 10 separately |
| **DRC-01** | Protected *local* Git history and branching from an arbitrary retained verified stable commit | Reproducible branch clone/checkout; stable tag cannot be rewritten by DDR; local/offline pass; no GitHub dependency |
| **DRC-02** | Disposable headless DDR isolated from stable install, Guardian, release ledger and user profile | Deliberate malicious filesystem writes, Git ref mutation and process escape denied; safe destroy/recreate; no production data leakage |
| **DRC-03** | Lu Main directs native code edits/build/test/repair while DDR is headless by default | Real Rust/Protobuf/SQLite component changes, unit tests, bounded diagnostics, cancellation/descendant cleanup; no extra Lu GUI or model |
| **DRC-04** | Independent inference broker; single model residency, isolated multi-client sessions | Two authenticated clients, one GGUF weight allocation, independent contexts, cancellation, priority/VRAM budget/revocation and stale-lease tests |
| **DRC-05** | Trustworthy evidence from independent verifier | Source/build hashes, test process exit, command and source attestation, missing/replayed/contradictory receipt rejection, regression trace |
| **DRC-06** | Local Git merge and integrated regression, separate from installed deployment | Conflicting branches, merge into staging, complete *post-merge* tests, clear failure gating, stable install unchanged |
| **DRC-07** | Immutable release candidate and explicit approval before stable promotion | Exact digest bound to human consent, package manifest/signature, install audit, unauthorized promotion attempt fails |
| **DRC-08** | Guardian dual-slot staged activation with autonomous failure rollback | Crash/timeout/failed startup/locked DLL/cancel/power-loss injection; previous verified binary launches without AI or network |
| **DRC-09** | Data-compatible rollback to any *retained, compatible* verified stable version | Old version + matching database snapshot; test forward-only migration refusal and preservation/export of newer conversations |
| **DRC-10** | Windows 10 x86-64 and Windows 11 independent acceptance | Separate real installation/GUI/IPC/model/resource/release/rollback results; neither implied by the other |
| **DRC-11** | Conversation-bound authorization, scoped cancellation and human release governance | Request ≠ grant, revoked tasks die, development cannot escalate privileges, no automated self-signoff |
| **DRC-12** | Recovery, retention and disaster-safe operational UX | Stable catalog corrupted/missing, snapshot disk-full, Guardian unavailable, rollback/repair without Lu or model, archived stable integrity |

## Policy

- A gate passes only with evidence identifying the **tested source revision, OS, build artifact digest, test/tool versions, independent verifier, time, and outcome**.
- \`PASS\`, \`FAIL\`, \`BLOCKED\`, \`INCONCLUSIVE\` and \`NOT_RUN\` are separate states. Missing results do not count as passing.
- A proposed source-level or unit test is **not** a Windows installed-product pass.
- The Guardian is independent of Lu Main and DDR; a model-produced test report cannot establish a passed gate by assertion.
- A candidate with tests individually green but untested after a merge is **not** releasable.
- A rollback target can be requested from any retained verified stable source; execution requires its **runnable verified artifact and compatible state plan**, not just a Git commit.
- The stable release entry remains protected until the new version has survived post-promotion health checks and retention rules preserve a known-good alternative.
- GitHub is optional. Every DRC-01 through DRC-09 gate must be testable without network access other than explicitly authorized downloads and OS-specific CI verification where necessary.

## Definition of done

A user may safely tell Lu Main: *"Branch from stable version X, try this change, test it, and show me the result."* Lu Main can do so without disturbing the installed Lu. A failing DDR can be deleted. Passing DDR functionality **does not trigger promotion**. A user-approved candidate can be installed by the Guardian; if it fails, an independent recovery path restores a compatible stable version and preserves conversations.

Until the gates pass, all components are **design or development preview**, not trusted autonomous self-update.
