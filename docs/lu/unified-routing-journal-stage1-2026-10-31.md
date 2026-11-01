# Lu Windows–Linux shared routing and model journal reconciliation — Stage 1

**Recorded:** October 31, 2026 (America/Phoenix; GitHub UTC November 1).  
**Source branch:** `work/lu-unified-routing-journal-stage1-20261101`, child of `work/lu-unified-source-stage0-20261101`.  
**Status:** **reconciled source candidate, not installed alpha, CE activation, Windows-positive run, or release.** GitHub is the repository/evidence archive; local testing comes first.

## Decision and source ownership

Lu owns one canonical conversation authority, model schema catalog, native Protobuf dispatcher, policy/effect journal and model-output audit on both Linux and Windows. Cognitum remains an optional CE and can propose relevance, but never register, authorize, mint consent, choose a worker executable/protection tier, or execute a route. The source baseline remains the Windows six-gate core, preserving its bounded unknown-tool retry, provenance and UI/cold-restore behavior. No second Linux desktop, Jan/Cowork dispatcher, mandatory Python, MCP, Docker or auto-enabled debug listener is added.

## Source changes

1. **Durable audit kind and compatibility upgrade:** `lu-core/src/model_turn_journal.rs` adds `HOST_ROUTE_SELECTED` as a separate event, explicitly **not** an effect or success. A SQLite `BEGIN IMMEDIATE` transactional table migration upgrades the original Windows `CHECK(kind IN (...))` definition, preserving existing sequences, rows, timestamp columns and the `sqlite_sequence` high-water mark even if a previously highest record was deleted. An unknown legacy table fails closed. Tests check legacy Windows upgrade, reopening, sequence monotonicity and incompatible-schema non-destructive failure.
2. **Reviewed route selection:** `lu-core/src/capability_router.rs` admits only an immutable first-party, bounded exact-fraction route when the native tool descriptor, effect `ExecuteCode`, input/output Protobuf type URLs, matching JSON schema and currently advertised model-facing tool all agree. It extracts numeric arguments, not paths/code. Unknown or ambiguous routes, forged schemas, mismatched tools/effects, user tool refusal and routing when no tool was admitted fail closed. Positive fixture is inert and does not execute a worker.
3. **Cognitum Dev Convo 9 feature:** Four C05/C10 discovery-only operation suggestions are mirrored as **inert** Lu metadata: `cognitum.math.linear` / `c05.determinant`, `cognitum.math.symbolic` / `c05.expand`, `cognitum.math.precision` / `c05.decimal`, `cognitum.formal.finite` / `c10.boolean`. See [Cognitum P25 research checkpoint](https://github.com/vjmichael/cognitum/blob/cognitum/p25-multicapability-c14-g16-20261031/docs/research/P25-Multicapability-Reviewed-Routes-C14-G16-2026-10-31.md). Those descriptors are not installed in Lu, automatically model-advertised, or executable, and their upstream schema digests have not been registered with the production Lu host.
4. **One host-authorized dispatcher:** `supervised_tool_generation.rs` optionally journals reviewed host selection **before** passing a host-constructed tool request to the existing `NativeToolTurn::handle_model_reply_observed`, so the bound authority, allowed tool, Protobuf codec and host policy remain mandatory. A failed journal append stops before dispatch. The immutable routing rule neither creates approval nor bypasses the effect journal. Successful tool feedback is durably audited before model continuation; cancellation/revocation after possible effect never re-runs or asserts rollback. Host-routed calls block the Windows unknown-tool retry; default Windows ordinary caller wrappers do not opt in to automatic routing.
5. **Persisted current USER turn only:** Windows had correctly assembled a model prompt from verified current USER plus earlier saved history. The route selector now receives `routing_user_text` parsed from **the same verified JSONL read** as the model prompt; historical user/assistant content cannot trigger the current turn's native routing. An adversarial saved-prompt regression covers prior-chat fraction content.
6. **Desktop truthful provenance:** Lu inference response and frontend state/UI separately expose `hostRoutedCalls` and `toolCalls`. Model-originated counts exclude the host-selected route, preventing inflated autonomous model-tool benchmarks.

## Why existing Windows alpha behavior remains protected

The shipping/native-only Windows desktop still constructs a **read-only, scratch-scoped** tool registry and grants only `ReadWorkspace`. It has **no registered Cognitum rational CE** and does not have `ExecuteCode` consent or a pinned Cognitum worker. Therefore the optional host-route matcher correctly returns no executable route in vanilla Windows Lu. Introducing C05/C10 as available, or allowing a model to grant their invocation, would violate the authority contract and is not part of this stage.

Default `run_supervised_native_turn` and `..._journaled_observed` entrypoints preserve old behavior. The dedicated trusted-desktop entrypoint accepts a separate authenticated current-user input; no public WebView command takes this routing argument from the client.

## Local validation and honest limits

On the isolated, previously reconstructed Linux D04F source candidate, after porting the Windows unknown-tool retry and current-user routing provenance protections:

| Local verification | Result |
| --- | --- |
| Linux `lu-core` Cognitum-enabled library | **96/96 passed** |
| Linux `lu-core` default library | **77/77 passed** |
| Synthetic legacy Windows-profile audit migration and deleted-ID high-water regression | **1/1 passed** |
| Linux strict Clippy on Cognitum-enabled library | **PASS after explicit function-boundary lint annotations** |
| Source-level host-router negative and positive fixture | Included among the above; no real model or worker |
| Actual stage-1 GitHub Windows Rust/Tauri compile and installed NSIS test | **NOT claimed** |
| Identical-Git-SHA Linux vs Windows native installed desktop | **NOT claimed** |
| Real Cognitum C05/C10 activation, real Windows Job containment, delegated Linux cgroup | **NOT claimed** |

The source-backed Python Cognitum worker tests early-return without their private worker root and Python path; Rust test counters alone are **not** evidence of live worker subprocess execution. Historical D04F tests on a separate Linux developer build are not a fresh same-source verification.

### Current hard gate / next integration

1. Run independent native Windows and Linux Rust compile/test/Clippy on **this exact integration commit**. The source branch contains a disposable two-platform verification workflow, but a workflow definition is not passing evidence.
2. Test synthetic and real negative sequences: `HOST_ROUTE_SELECTED` journal write failure before dispatch, revoked/expired grant, mismatched route/schema/effect, current-turn no-tool preference, first model unknown tool after an executed host route, duplicate effects, cancellation before and after native call, crash/restart and old-profile database migration.
3. Recover and transplant complete optional Cognitum CE execution against the shared host with real operator-owned `ExecuteCode` consent, pinned worker hash, cross-platform supervision and cancellation, then validate actual GGUF/tool loop. Keep C05/C10 discovery metadata inert until their independent schema/effect/codec/authority reviews are complete.
4. Produce NSIS and Debian .deb from one exact reviewed source SHA, complete installed real-GGUF and native-tool/save/restore acceptance on each OS, then request explicit promotion. Source-only regression green does not certify physical Windows 10/11 alpha.

**No stable or release promotion has occurred. The verified Windows alpha branch remains untouched.**
