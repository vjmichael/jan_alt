# Lu-Linux / Cognitum D04D — Reviewed Capability Route Bindings

**Date:** October 31, 2026  
**Project:** Lu-Linux experimental development, `vjmichael/jan_alt`  
**Local baseline:** D04C reconstructed Lu source, with pinned Lu source `68eab79e2799c02cec8949993cebd64215f00559` and archived L16/P0/D01–D04C overlays.  
**Disposition:** Core and desktop type-check **passed**; fresh D04D linked desktop executable and full model-driven test **not accepted**. Not a production DLC plugin or release.

## What D04D changes

The D04C host-selected rational router validated that a single small GGUF model can benefit from a host-selected specialist, but its internal rule was attached to a public tool name. D04D introduces a small **host-reviewed route descriptor catalog** to make that coupling explicit and extensible without granting authority from DLC manifests.

- `lu-core/src/model.rs`: `ModelToolCatalog::matches_reviewed_route` checks the exact public name → native tool ID binding, requested `ToolEffect`, Protobuf input/output type agreement with the native registry, strict argument schema, and **the complete actual schema published to this turn**. A caller that merely claims `lu_cognitum_rational` is insufficient.
- `lu-core/src/capability_router.rs`: defines `ReviewedHostRouteRule`, bounded `ReviewedMatcher`, fixed `TRUSTED_HOST_ROUTES`, and a `ReviewedRouteCandidate`. The selector rejects incompatible native descriptors, absent/forged schema, explicit no-tool requests, and **multiple overlapping matches** instead of taking the first. A candidate contains a verified public name, typed JSON arguments, and a host-owned rule ID, **not permission to run anything**.
- `lu-core/src/supervised_tool_generation.rs`: consumes the checked candidate through **the existing** `NativeToolTurn::handle_model_reply_observed` path with conversation authority, independent host policy and the registered Protobuf codec. The audit marks `HOST_ROUTE_REVIEWED_D04D:<host-rule-id>`, never a model-originated tool request. Removes an old name-only “call the tool” hint to avoid encouraging duplicate model calls after a host route already ran; turn-authorized tool schema remains available to the model.

D04D has **one reviewed, installed route**: exact rational arithmetic via the pinned Cognitum Python worker, classified as `ExecuteCode`. Adding another matcher or DLC is not automatically permitted; each new rule, native binding and codec must be reviewed by the Lu host. No untrusted manifest can author the route list, select an executable, or self-authorize.

## Local verification

| Gate | Result | Qualification |
|---|---|---|
| Lu Core with `cognitum-dev-native` feature | **90/90 passed** | Includes real SHA-pinned Cognitum worker integration (test root configured) |
| Lu Core default feature | **76/76 passed** | No regression for standard core |
| Tauri desktop library `cargo check --offline --features lu-cognitum-dev-native --lib` | **Passed** | Rust compiler/type-check only, using archived Debian GUI sysroot |
| D04C → D04D source patch | **Passed** | `git apply --check -p1`, SHA-256 recorded separately |
| Forged advertised schema or description | **Denied (unit tests)** | Full schema checked against catalog, not just name |
| Wrong native tool ID, Protobuf input URL or effect | **Denied (unit tests)** | Verified against native registry |
| Duplicate matching host route rules | **Denied (unit tests)** | Ambiguity does not cause an arbitrary first match |
| User explicitly refuses tool use | **Denied (unit tests)** | No host-selected candidate |
| Existing model-tool execution with denied host policy | **Passed (regression)** | Actual worker is not run without Lu host policy |
| Fresh debug Lu desktop binary | **Not accepted** | Full link exceeded local execution window, no source compilation error observed |
| Fresh D04D GGUF / matched 6-prompt benchmark | **Not run** | Historical D04C 6/6 result must NOT be attributed to D04D |
| Writable cgroup2 with independent escaped-descendant recovery | **Not accepted** | Test environment still lacks writable delegated cgroup containment |

The test-only schema fixture registers a **non-executing native tool** so schema binding probes cannot launch arbitrary processes. A separate pre-existing test runs the real pinned Cognitum worker through the bound `NativeToolTurn` path.

## Current trust boundary

Discovery ≠ authorization. A verified routing descriptor is **still only a suggestion**: dispatch requires the separately attested saved USER turn, the scoped native tool registration, host-approved effects, and an uncompromised worker/Protobuf boundary. The model cannot install or grant a route by emitting JSON or claiming a DLC is installed.

This is a narrow core-level bridge toward general DLC routing, **not** a safe parser for arbitrary DLC-supplied route manifests. Production work must add signed/pinned extension identity, owner-namespace binding, trusted installation review and an explicit consent experience before third-party contributions are eligible for automatic host routing. Candidate selectors must never automatically escalate a capability effect.

Existing D04B/D04C Linux worker protection remains: parent-death guard, process-group cleanup, RLIMIT budgets and `no_new_privs` for the fixed trusted worker. This is defense in depth, **not** a filesystem/network sandbox, writable-cgroup proof, or independent crash-watchkeeper guarantee.

## Next work

1. Link the complete D04D developer binary and repeat matched real GGUF turns with the same prompts and model settings used in D04C. Confirm no duplicate model-originated tool calls after the host route.
2. Create an auditable `HOST_ROUTE_SELECTED` event type with schema-compatible SQLite migration, separating model-originated and host-originated actions without ambiguous `PARSED_CANDIDATE` terminology.
3. Add installer/owner-signed third-party DLC manifest review and safe typed routing recipes only after native codecs and protected effect classes are independently vetted. No generic executable routing.
4. Continue actual writable cgroup2 + independent watchkeeper recovery on a suitable Linux test host, without making it a prerequisite for trusted-supervised DLCs.
5. Preserve Windows alpha branch independence; GitHub is source ledger, not the development host.

**Artifacts:** `Lu_Linux_Cognitum_D04D_Source.patch`, `D04D_Gate_Evidence_2026-10-31.json`, Core test logs and desktop check/build logs. No Windows or Lu main changes.
