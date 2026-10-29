# Lu v1.0 — phase implementation and verification gates

Status: approved planning baseline, **not execution evidence**. Date: 2026-10-28.
Scope: Windows x86-64 vanilla Lu. Alpha has a separate acceptance gate in [alpha-acceptance.md](alpha-acceptance.md). Lu v2.0 DLC Workspaces and Cognitum integration do not block v1.0.

## Engineering execution protocol
For every phase, maintain a package of: (a) scoped design/contract references, (b) implementation diff and precise build SHA, (c) deterministic unit/contract/integration tests, (d) **desktop smoke test with recorded evidence**, (e) defects and re-test, and (f) acceptance signoff. Mark **Design → Implemented → Integrated → Smoke tested → Accepted** separately in [component-register.md](component-register.md).

Smoke tests run on disposable profiles/workspaces, capture structured JSON results and sanitized logs (phase ID, build SHA, machine/runtime info, test ID, pass/fail, duration, artifacts), and clean up their own processes. They must not silently access customer conversations, credentials, Windows AppData or install an unrelated Jan service. CI performs noninteractive smoke checks; real Windows/GPU acceptance is tracked separately. Failure blocks that phase's acceptance, not independent planning.

If a phase introduces a feature requiring sensitive operations, its permission and authority controls ship in the **same phase**. P4 audits hardening across all prior phases, not retrospective security implementation.

## P1 — persistent runtime, model management, Windows isolation
**Implement:** Lu-owned persistent GGUF engine, validated Protobuf transport, GPU/backend detection and safe fallback, model selection/start/stop/cancel/retry, conversation continuity, installer identity and Jan-inheritance inventory.
**Smoke:** fresh isolated install → start Lu → choose GGUF → load → generate → cancel before first token → Play/Retry → generate again → restart → reopen conversation; verify owned worker/process teardown, model switching, absence of a required Jan installation, and installer uninstall. Include CPU fallback and Vulkan Windows hardware check where feasible.
**Gate:** no stranded prompt or ghost worker; exact-build provenance and installer CI green; alpha native tool loop also verified.

## P2 — first-party native tools and development support
**Implement:** Protobuf-native registry/dispatcher; typed request/response/error contracts; safe filesystem read/write/search/batch/rename/trash/restore, code symbol navigation, Git and project operations, web research, format validation/repair-then-validate, export to PDF/Word/CSV as supported. Tool access is conversation scoped and policy-gated; no mandatory MCP transport.
**Smoke:** real tool-capable GGUF invokes a read/search and authorized write in disposable workspace → host approves/denies by scope → tool executes → model receives result → transcript persists; test traversal, absolute-path, denied/revoked and malformed-Protobuf failures; Git operations in disposable repo; basic export open/parse.
**Gate:** no tool bypass/fallback to unauthorized Jan/MCP path; machine-readable errors and verified effect provenance.

## P3 — ANSF + SQLite long-context experience
**Implement:** memory persistence/indexing/retrieval/ranking, searchable memory side pane, Ctrl+F/staged scroll, cross-chat links without duplication, edit lineage/timestamps, provenance, conversation belief/context revision; working Browse Memory and Sync Lu Memory controls.
**Smoke:** create two conversations; restart; search and link prior context into current conversation without copying or treating it as new instructions; correct a prior preference/assumption and verify current answer uses revision; edit a message and inspect lineage; test corrupt DB/recovery path.
**Gate:** retrieval is relevant and provenance-linked; no accidental instruction escalation or cross-profile leakage.

## P4 — authority and security hardening
**Implement:** consolidate PolicyEngine permission gates, grant expiry and durable records, user-facing consent, revocation effects, trusted publisher enrollment/rotation/revocation/recovery, audit trail and protocol/schema validation. Models cannot self-approve.
**Smoke:** deny missing/invalid conversation IDs, expired grants, forged publisher, invalid payload; approve bounded request; revoke mid-job; verify action stops and restart does not reinstate revoked authority; inspect UI consent details and audit.
**Gate:** permission bypasses fail closed; negative and restart/replay tests pass.

## P5 — desktop UX and interaction quality
**Implement:** dual chat panes and switch-primary, memory browsing UI, prompt queue/soft interrupt, themes/backgrounds, reliable model status, meaningful error explanations, edit/read indicators, accessible keyboard navigation and intuitive file outputs.
**Smoke:** queue prompts while processing, cancel/soft-interrupt one without losing next; switch pane and retrieve linked memory; choose output destination; change theme; restart and verify stable state; keyboard-only and screen-reader-oriented control checks.
**Gate:** no hidden stranded state, lost conversation or blocking terminal workflow for ordinary users.

## P6 — supervised background tasks and HTP reduction
**Implement:** persistent task IDs, progress/heartbeat, bounded worker resource budgets, checkpoints, user cancel/kill, completion notification, crash/restart recovery, provenance-linked results, automated build/test/log handoffs.
**Smoke:** run a long task → inspect progress → cancel → verify process/effects stop; simulate crash and restart checkpoint recovery; revoke permission and verify termination; collect failing build logs and present concise diagnosis without manual cut/paste.
**Gate:** durability and cancellation demonstrable; no autonomous privilege extension; routine test evidence captured automatically.

## P7 — opt-in diagnostics, benchmark mode and audit
**Implement:** reproducible benchmark manifests, baseline comparisons, traces, resource/latency measurements, sanitized exports, deterministic lifecycle checks, opt-in diagnostic UI, transparent failure categorization.
**Smoke:** diagnostics OFF by default; approve one bounded test; run against disposable test profile; show plain-English result plus machine-readable report; cancel; ensure no leaked listener/worker; compare baseline and candidate in equivalent settings; correctly classify tool-routing vs model/backend failure.
**Gate:** repeatable results with run/build/model/quantization provenance; measurement overhead stated; no claims of scientific gains from mock data.

## P8 — v1.0 integration and release hardening
**Implement:** consolidate inter-phase issues, dependency/security/documentation audits, source/license inventory, installer/updater and migration policies, upgrade/rollback/export/recovery, onboarding and user manual, final release candidate.
**Smoke:** scripted clean install / prior-profile migration / uninstall / reinstall; core model + tool + memory + job flows; failure injection; schema compatibility; recovery and rollback. Windows x86-64 packaged build must be tested as shipped, not merely dev mode.
**Gate:** all mandatory phase acceptance evidence linked; severe unresolved regressions receive explicit release-blocker adjudication. **Do not call this smoke pass the final rigorous qualification.**

## Final v1.0 qualification — separate from phase smoke tests
Run only after P1–P8 integrated into a frozen release candidate. Produce a signed/hashed test manifest and immutable result bundle referencing exact source SHA, installer SHA256, runtime, model weights/checksum, quantization, inference backend, machine/driver, OS, tool version and test data seed.

1. **Functional and regression:** complete design-book requirements mapped to automated cases; multi-session and end-to-end model→native-tool→memory→persistent replay; real desktop Windows hardware, no Jan installation prerequisite.
2. **Security and abuse:** permissions, traversal, forged/replayed Protobuf, sandbox escape, trust-store revocation, injection through tools/memory, secrets handling, concurrency, upgrades and data isolation; independent review where feasible.
3. **Reliability / soak:** repetitive loads/stops/cancels, crash/restart, worker leak, SQLite durability and corruption, file operation rollback, long tasks and load tests; record failures and recovery time.
4. **Performance:** reproducible prompt and tool benchmarks (time-to-first-token, tokens/s, tool success, tool-use accuracy, latency percentiles, CPU/GPU/VRAM/RAM, disk and measured energy where available); profile across small/medium/large GGUFs and CPU/Vulkan feasible configurations. Never conflate development-machine measurements with general guarantees.
5. **Comparative benchmarks:** baseline vanilla Lu with identical model/task settings and model-only comparison where meaningful. Cognitum WITH/WITHOUT comparisons belong to the future CE integration program, not a v1.0 blocker; preserve harness compatibility for those later controlled experiments.
6. **Usability / distribution:** non-IT user journey without CLI, installer signing/integrity, accessible UI, error recovery, offline use, export and support diagnostics.

### Qualification decision record
Publish requirement ID → case ID → environment → expected/observed behavior → result/artifact → issue reference. Categorize **pass, fail, skip with rationale, not run** (never treat a skip as pass). Document objective numerical release thresholds **before** final benchmark execution using measured alpha/v1.0 baselines; don't invent arbitrary success numbers. Release only after blocking defects resolved or an explicit documented exception is authorized by the owner.

## Parallel work and updates
Planning/contract audits for P2–P7 can run during alpha testing; changes to alpha-critical inference paths require isolation and appropriate regression gates. Update this plan and the [component register](component-register.md) whenever design, source, tests and acceptance status diverge.
