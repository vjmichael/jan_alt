# Lu-Linux / Cognitum D04C — Automatic Host Capability Routing and Bounded Worker Hardening

**Date:** October 31, 2026  
**Repo:** `vjmichael/jan_alt`  
**Branch:** `lu/linux-cognitum-d04c-host-router-20261031` (isolated documentation / source patch; based on D04B evidence branch)  
**Local source baseline:** Pinned Lu source `68eab79e2799c02cec8949993cebd64215f00559` with accumulated L16/P0/D01/D02/D03/D04A/D04B test overlays.  
**Status:** D04C developer-local partial acceptance; **not** kernel-contained third-party DLC execution, signed installer, or Windows alpha.

## Executive result

D04C proves two independently useful changes:

1. **Linux worker budgets:** Cognitum's fixed, source-pinned Python worker now runs with real Linux CPU, output-file-size, open-descriptor, core-dump, and `no_new_privs` restrictions, in addition to D04A process-group cleanup and D04B immediate-child parent-death protection. This does not provide kernel cgroup2 containment, escaped-descendant host-crash recovery, filesystem or network isolation.
2. **Real host-chosen capability routing:** A restrictive, compiled-in numerical predicate recognizes **one exact fractional operation** in the host-attested saved USER prompt, only when that turn has been separately approved for Cognitum's `ExecuteCode` capability and the schema was admitted through Lu's existing authority and policy. Lu constructs the bounded JSON request, goes through the exact existing Protobuf codec and `NativeToolTurn` bound dispatch, durably logs it as `HOST_ROUTE_FIXED_RATIONAL_D04C`, and returns verified tool feedback to the local Qwen model. This is **not** a model-originated tool call and does not create execution authority.

With this new route, six neutral prompts generated **6/6 exact correct answers and 6/6 actual host-routed Cognitum calls**. The identical unapproved controls yielded **0/6 exact answers and zero tool calls**. In a preceding hint-only experiment on the fresh D04C host, **0/6 approved neutral prompts** called Cognitum, validating that prompt advice alone did not solve this model's routing reliability.

## Schema as capability memory, correctly scoped

Lu's `ModelToolCatalog` is persistent *host knowledge of installed/registered capabilities*, not learned weights in the LLM. For each admitted turn, the host projects the catalog through the current `ConversationAuthority`, policy and chosen workspace, then injects only authorized JSON tool schemas into the prompt used for that generation sequence. In a stateless model API, these schemas and conversation context must be supplied again, or their tokenized context retained in a valid KV-cache/session; neither implies permanent neural memory. The model cannot grant a capability merely by describing it, and an installed DLC cannot unilaterally nominate its executable or trusted kernel tier.

D04C still uses a **compiled-in first-party rational rule**, not a production dynamic DLC metadata parser. For future DLCs, allow signed/validated declarations of capability semantics, effects, input/output Protobuf types and trusted host routing descriptors, but never translate a third-party description directly into authority or an arbitrary executable.

## Source delta

- `lu-core/src/capability_router.rs` (**new**): conservative fraction recognition and extraction, no-tool preference, grant-filtered model-schema presence, host-selected hint, regression and injection tests.
- `lu-core/src/supervised_tool_generation.rs`: when approved and strictly matched, issue *one host-selected call* via the **same bound dispatch**, before model generation; capture typed feedback; record source provenance separately as `host_routed_calls`. Model then generates a final answer from verified feedback. Without a reliable match, retain original LLM route or ordinary chat. No direct Python call is exposed to user/model.
- `lu-core/src/cognitum_model_tool.rs`: integration fixture proving policy denial, real pinned Python `37/42` acceptance and cancellation without a worker launch.
- `lu-core/src/cognitum_dev_native.rs`: use the narrow bounded Linux helper for the *trusted first-party* worker.
- `lu-model-linux-sys/src/lib.rs`: `PR_SET_NO_NEW_PRIVS`, checked `setrlimit` (`RLIMIT_CORE=0`, `RLIMIT_FSIZE=16 MiB`, `RLIMIT_NOFILE=256`, `RLIMIT_CPU=15s`) in safe pre-exec syscall facade; tests confirm actual process limits and oversized-file denial.
- `src/core/lu_inference.rs`: add `hostRoutedCalls` to live result; honor saved USER explicit no-tool request before admitting Cognitum's model-facing schema, even if operator already approved.
- `lu-core/src/lib.rs`: register router module.

These limits apply **only** to this fixed Cognitum developer worker, not to Lu's model engine, film rendering DLC, or all future Python tools. Tier-appropriate budgets must be explicit for other workers.

## Actual checks

| Gate | D04C result |
|---|---|
| Lu Core with Cognitum feature | **88/88 passed** |
| Lu Core default feature | **74/74 passed** |
| Linux syscall facade | **7/7 passed** (including direct parent-death and resource-budget tests) |
| Tauri desktop developer feature type-check | **Passed** |
| Fresh desktop debug binary linking and actual launch | **Passed** |
| Qwen2.5 0.5B GGUF CPU-model load | **Ready** |
| D04C host-selected exact arithmetic, same neutral prompts | **6/6 exact; 6/6 real host-routed worker calls** |
| Identical unapproved controls | **0/6 exact; no tool calls** |
| Hint-only (before host dispatch) neutral approved trials | **0/6 tool calls** |
| Explicit no-tools request after operator approval | **0 tool calls** |
| Real private SQLite audit `HOST_ROUTE_FIXED_RATIONAL_D04C` | **6 entries** |
| `kernel-required` direct worker on D04C executable | **Denied** |
| Trusted-supervised direct fixed worker | **1/2 for 1/3 + 1/6** |
| Forged tier / Python path / argv from socket | **Denied** |
| Writable delegated cgroup2 + `cgroup.kill` escaped descendant witness | **Not accepted: read-only cgroup2 mount** |
| Independent durable watchkeeper after host crash | **Not accepted** |

### Paired measurement (descriptive, not controlled science)

- **Control:** 0/6 exact, 0 host routes, median full turn **1396.3 ms**.
- **Approved host route:** 6/6 exact, 6 host routes, median full turn **2561.65 ms**.
- Same user prompts and model file, alternating condition order, separate Lu persisted turns. No controlled model seed; one trial per condition per question; timing includes worker and model. These data cannot establish statistical significance or generalized performance.
- **Critical attribution:** `toolCalls` includes host selected calls, but `hostRoutedCalls` distinguishes them. Here the model selected **zero** native calls independently in the six approved turns; Lu selected them and Qwen formulated final replies.

## Security decisions / boundaries

- DLC discovery and schema provision **are not** authorization; no worker starts without a host-minted, bound user-turn grant **and** a separate valid policy ExecuteCode effect.
- User/model cannot supply execution path, root, tier, worker hash, task ID, or privileged command arguments. Codec requires canonical Protobuf and a bounded numeric expression.
- No-tool user opt-out prevents Cognitum registration for that turn; an old approval cannot override this preference. Ambiguous math/multi-request/code/path/date prompts are not routed automatically.
- A host-routed request is auditable as an explicitly host-selected event (currently using a legacy `PARSED_CANDIDATE` journal kind with fixed `HOST_ROUTE_*` payload for SQLite compatibility; a distinct event kind should follow with a migration). It is never labeled a model-originated call.
- Kernel resource restrictions supplement but do not supplant cgroups and sandboxing. `kernel-required` remains unavailable until pre-exec host-owned cgroup admission and independent host-surviving cleanup evidence pass on a writable delegated cgroup v2 environment.
- Existing D04B process-group and `PR_SET_PDEATHSIG` protections are defense-in-depth for trusted workers, **not** escaped-descendant guarantees after abrupt host death.
- No cloud model-hosting changes, third-party DLC admission, Windows alpha changes, or Lu main/release changes included.

## Artifacts and next gates

- `Lu_Linux_Cognitum_D04C_Source.patch` — delta **against locally reconstructed D04B**, not directly against GitHub main; passes `git apply --check -p1`.
- `D04C_Gate_Evidence_2026-10-31.json` — summary + distinctions.
- `neutral_router_benchmark.json` — live paired 12 results + no-tool result, including `hostRoutedCalls` field.
- `hint_only_results.json` — 12 neutral hint-only results + no-tool result preceding deterministic routing.
- `tier_matrix.json`, `core-tests4.log`, `core-default-tests2.log`, `syscall-tests.log`, `tauri-check2.log`, `binary-build2.log`, `patch_verification.log`.

**Recommended D04D/D05 next:** Capability routing should become declarative and DLC-agnostic (host reviewed signatures, effects, payload codecs, bounded applicability tests and policy gating); distinguish model-selected and host-selected calls in diagnostic schema and benchmark harness. Continue cgroup2/watchkeeper integration on a suitable Linux host, and add adversarial interruption/resource-policy tests. Preserve Windows alpha in a separate integration track. **Hugging Face cloud Lu is deferred.**
