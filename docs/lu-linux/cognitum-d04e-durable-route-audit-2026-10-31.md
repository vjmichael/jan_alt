# Lu-Linux Cognitum D04E — Durable Host Route Audit and Live GGUF Verification

**Date:** October 31, 2026 (America/Phoenix).  
**Scope:** isolated Lu-Linux developer checkout, derived from the D04D reconstructed baseline.  
**Disposition:** **D04E developer gate passed** for durable route-selection audit, migration, regression tests, freshly linked Lu desktop, model/worker operation and restart persistence. **Production DLC, cgroup confinement and installer: not accepted.**

## Main change

D04D wrote a host-selected route decision as a `PARSED_CANDIDATE` record with a `HOST_ROUTE_REVIEWED_D04D:<rule-id>` payload. That blurred the provenance boundary between Lu host selection and model-output parsing.

D04E adds a distinct `ModelAuditKind::HostRouteSelected`, represented as SQLite kind `HOST_ROUTE_SELECTED`. It contains only host-owned metadata (`source=trusted_host`, reviewed `rule_id`, fixed `public_name`, `stage=selected_before_dispatch`) and omits the expression, user text and executable paths. Its durable SQLite write occurs **before** `NativeToolTurn::handle_model_reply_observed` dispatch. It does not confer execution authority: the normal saved-user-turn verification, conversation-scoped grants, host policy and native Protobuf contract remain mandatory.

Pre-D04E databases have a `CHECK(kind IN (...))` restriction that does not include this new name. `ModelTurnJournal::open` therefore migrates the old audit table **transactionally**, retaining existing `sequence`, `conversation_id`, `task_id`, `kind`, `payload`, `repair` and `created_at`, rebuilding the index and rolling back if a migration step fails. An already migrated database opens without repeating the rebuild. The newer journal keeps the legacy event kind available for historical records but never mislabels a new host route as `PARSED_CANDIDATE`.

When a durability trigger forces `HOST_ROUTE_SELECTED` insertion to fail, the host returns `JournalFailure`, with zero native dispatch steps. The registration and authorization systems were not modified to permit general third-party DLC routes.

## Local test results

| Gate | Observed result |
|---|---|
| `lu-core` with `cognitum-dev-native` | **90/90 pass** |
| `lu-core` default build | **76/76 pass** |
| Standalone model-turn journal tests | **3/3 pass** (including old-schema migration, preservation and rollback) |
| Supervised-turn, native-worker lifecycle and journal integration suites | **11/11 pass** |
| Real SHA-pinned Cognitum Python worker in Lu Core | **Pass** |
| Source patch against pristine D04D baseline | **`git apply --check` pass** |
| Fresh D04E Tauri desktop debug binary link | **Pass** (dev profile; **not** installer) |
| Fresh desktop launched under Xvfb and loaded Qwen2.5 0.5B Q2_K GGUF | **Ready** |
| Six matched neutral prompts without approval | **0/6 exact, 0 tool calls** |
| The same six prompts with single-turn approval | **6/6 exact, 6 native calls; each `hostRoutedCalls=1`** |
| Explicit user `without tools` despite approval | **0 tool calls** |
| SQLite D04E route evidence | **6 host-selected events / 6 feedback events across 13 turns** |
| Event ordering for each authorized task | **Selection before feedback before model output** |
| Duplicate native execution in approved turns | **None observed (exactly one selection and feedback each)** |
| Model unload and host restart | **Pass**; model PID null after unload; all 13 audit turns still readable after restart |

Actual development desktop SHA-256: `4fefdbafba8951fa16a41c598d96d1e6c7fe5fd04f960a3cb7fd432836c51de5`.  
D04D-to-D04E patch SHA-256: `a7310e31298c141c36265c3b3044e7978bde355ac45c560fd0ddb8fb264a12d4`. The machine-readable report lists file hashes.

The six paired arithmetic results are **exploratory**, from a single CPU Qwen2.5 0.5B Q2_K run without known fixed seeds or repeated trials. The model did not itself choose Cognitum in host-routed cases; Lu did. Neither correctness nor routing generalizes beyond these bounded fractions without further tests.

## Security distinction

- **Discovery is not permission.** The catalog's reviewed schema and router selection do not authorize worker execution; only Lu's separately approved one-use persisted USER turn and host policy do.
- **Host route is not model route.** Audit event `HOST_ROUTE_SELECTED` can be distinguished directly from `MODEL_OUTPUT` and `PARSED_CANDIDATE`.
- **Durability is not effect journaling.** An audit event indicates selected-before-dispatch, not successful execution. Real `TOOL_FEEDBACK` follows separately; cancellation and crash recovery remain additional concerns.
- **No OS sandbox claim.** D04B process-group cleanup, Linux parent-death guard and D04C RLIMIT/no_new_privs hardening persist, but a worker that escapes its process group and full host-crash recovery still need independent OS enforcement.
- **No release claim.** The developer feature and optional test socket are isolated; no changes to Lu main or Windows alpha. The test-only Xvfb/WebKit settings are not production defaults.

## Pending gates and the P-series return

1. Integrate general reviewed DLC manifests with trusted publisher identity, typed routing recipes and explicit permission without allowing a DLC to self-grant executable authority.
2. Validate worker resource controls and writeable/delegated cgroup2 containment on a suitable Linux host; establish **independent** escaped-descendant cleanup and recovery after host death. D04E does not close that gate.
3. Return to the Cognitum P46/R series test backlog: complete the host-crash, escaped-descendant and cgroup/watchkeeper negative controls where the host permits; preserve blocked cases honestly. Prior P47–P51 evidence remains distinct from these D04E tests.
4. Extend paired WITH/WITHOUT Cognitum benchmarking beyond six fractions, across more local models and Cognitum components, while separating router failures from worker/backend failures.
5. Complete release/installer integration and Windows Job Object/worker-life acceptance in the Windows build separately.

## Files

- `Lu_Linux_Cognitum_D04E_Source.patch` — D04D-to-D04E source delta
- `D04E_Gate_Evidence_2026-10-31.json` — structured tests and source checksums
- `D04E_Live_Acceptance_2026-10-31.json` — verified summarized live results and journal event counts
- `neutral_router_benchmark.json` — per-turn raw controls, prompts and latencies
- `core-dev.log`, `core-default.log`, `journal-migration-tests.log`, `integration-tests.log`, `build_binary.log` — local test logs
- `patch_validation.json`, `restart-verification.json` — source verification and live restart check

Do not include the disposable profile's socket token, saved user data, active workers, GGUF weights or runtime credentials in the transfer archive.
