# Lu-Linux / Cognitum P46 startup race and P25-next controlled holdout

**Local date:** October 31, 2026 (America/Phoenix); container UTC November 1, 2026.  
**Scope:** isolated Lu-Linux D04F experimental host and locally reconstructed P46R8 source. No changes to Lu main or Windows alpha. No cloud model access or downloadable-package requirement.

## Decision

- Trusted, first-party supervised workers **do not require cgroup v2** to execute. They are subject to Lu's normal per-turn authorization, pinned worker/source checks, supervision, cancellation, and restricted resource access.
- **Kernel-required** operations remain unavailable unless genuine OS-provided containment has been verified; a recovery receipt cannot authorize a tool by itself. This container's cgroup2 mount is **read-only**. No `cgroup.kill` or escaped-descendant recovery certification occurred.
- Untrusted code cannot opt itself into a weaker tier.

## P46R8 / P45 timeout-race correction

The prior `test_timeout_kills_grandchild` combined two logically different expectations under a 400 ms deadline: that the Python fixture would **finish startup and spawn a grandchild**, and that the worker would then **time out and terminate** that descendant. The former is not guaranteed on a loaded developer/CI host. Raising the timeout to 2,000 ms tested cleanup but did not address that mistaken precondition.

**Test-only solution** (the worker implementation and production budgets were not altered):

1. `test_short_400ms_timeout_without_startup_assumption`: keeps the real **400 ms** timeout; verifies a `TIMED_OUT` outcome and responsive host; if a grandchild was observed, asserts it stopped. If none was ever created, it **does not count** that case as descendant cleanup.
2. `test_400ms_timeout_prevents_late_grandchild_start`: deliberately delays fixture child creation until **750 ms**, verifies the 400 ms expiration, waits another 450 ms, and confirms no late PID file/child was created.
3. `test_timeout_kills_ready_grandchild`: uses a distinct 2,000 ms fixture timeout and requires independently observed *live* grandchild readiness before checking `TIMED_OUT` and process cleanup. This is a separate **test-specific** timeout, not a production change.

Source delta: `P46_P45_400ms_Start_Precondition_Test_Fix.patch` against the preserved P46R8 full-source archive. Verified with `git apply --check` and `patch --dry-run` against clean local source.

### Independent process/test evidence

- **Eight repetitions of the initial corrected P45 suite: 34/34 tests passed each time** (272 successful test executions; not 272 unique tests).
- Added deterministic late-spawn negative control: **12/12 P45 process tests passed**.
- Combined final P46R8 recovery/fault plus expanded P45 suites: **158/158 passed**, ~48.8 seconds in this local run. Breakdown: **123 scoped P46R8** and **35 expanded P45** (12 process + 23 compatibility).
- Fail-closed kernel-required behavior unchanged. An escaped grandchild that abandons its process group remains outside the trusted-supervised cleanup assurance. Inspection-only recovery lock/restart tests are **not** OS cleanup attestation.

This closes the **P45 test startup-assumption defect**, not the full P46 kernel-containment acceptance gate.

## New model benchmark: real Qwen2.5 0.5B, fresh seeded holdout

The actual newly compiled D04F Lu-Linux binary (`sha256:d302a8eac85616b9cca27e8148241bffdf5868bb8ee09ed54bc99a063898cbb5`) loaded a real 415 MB Qwen2.5 0.5B Instruct Q2_K GGUF on CPU (`sha256:9ee36184e616dfc76df4f5dd66f908dbde6979524ae36e6cefb67f532f798cb8`). Its owner-private test socket ran a **seeded 9-case holdout**, two repetitions per case, alternating the order of matched *tool-unavailable* (OFF) and *one-turn-host-approved* (ON) arms. Prompts were identical within each pair. No hidden test results, skipped failures or synthetic model outputs.

| Observed local result | Cognitum OFF | Cognitum ON (host routing approved) |
|---|---:|---:|
| Completed real GGUF turns | 18/18 | 18/18 |
| Exact simplified fraction | **6/18** | **18/18** |
| Lu-native tool calls | 0 | 18 |
| Durable `HOST_ROUTE_SELECTED` | 0 | 18 |
| Median end-to-end turn latency | **1,411.3 ms** | **2,666.45 ms** |

- Independent offline verifier: **7/7 tests passed**, including forged ground truth, reordered trials, missing arm, duplicate call, unauthorized call, and mismatched audit negatives.
- Real SQLite audit: exactly **18 `HOST_ROUTE_SELECTED`** events and **18 `TOOL_FEEDBACK`** events, with 36 user requests, 36 model outputs and 36 final answers. No duplicate/unauthorized tool executions.
- 18 matched pairs: **12 gains**, **0 losses**, 6 ties (both correct). Case-clustered paired accuracy difference **+66.7 percentage points**. A descriptive 10,000-draw bootstrap over **nine unique cases** gives a broad **[+33.3, +100.0] percentage-point** interval. Repetitions of the same cases are *correlated*, not 18 independent mathematical problems.
- After all trials, model unload was successful and host model state returned **Idle**. The host was terminated afterward.

**Interpretation:** The result demonstrates the effectiveness of Lu's **host-selected, conversation-authorized** exact-fraction route on these new small-model cases. It **does not** demonstrate spontaneous tool selection by Qwen, general Cognitum competence, improvement across all task families or broad scientific efficacy. Its ON condition uses additional trusted computation and higher latency. Benchmarks using other models, quantizations, tasks and equalized prompting are still necessary.

## P25 earlier Qwen 27B evidence remains separate

The already completed independent P25 audit of P23 FULL (12 scheduling cases, 24 model arms) remains **10/12 vs 10/12** under mathematically tolerant scoring; strict bare-JSON-and-correct grading **0/12 OFF vs 5/12 ON** largely reflects formatting. No new 27B inference was performed here and the two experiments are **not pooled**.

## What's still open

1. **Kernel-required P46R8:** a genuinely writable delegated cgroup2 mount; fenced worker admission; true escaped-descendant cleanup and externally supervised, host-crash recovery, with independent observable `cgroup.kill`/cgroup event evidence. This tier does not prevent trusted Cognitum development.
2. **Cognitum broader scientific efficacy:** randomized model/arm order, multiple distinct models and quantizations, diverse exact + non-exact capabilities, isolated tool accuracy/selection/finalization, cost and latency distributions, repeated cases and independence checks. Original 27B receipt provenance remains operator-reported, not attested.
3. **Production:** Linux installer and Windows Job Object acceptance remain distinct from this Linux developer smoke run.

## Evidence and reproducibility

- `P46_P45_400ms_Start_Precondition_Test_Fix.patch`: **test-only** source change, no worker production code.
- `integrated_p46_final_158.log` and `p45_repeats.out`: real OS test logs.
- `P46_P25_Next_Live_Holdout.json`: raw synthetic prompt, per-turn output, operational telemetry and audit totals; **no socket token**.
- `P46_P25_Next_Independent_Analysis.json`: independently recomputed fractions, paired statistics, descriptive cluster bootstrap, evidence hash.
- `P46_P25_Next_Runtime_Identity.json`: actual running Linux binary and GGUF hashes, Idle state after unload.
- `analyze_holdout.py`, `test_holdout_audit.py` and `paired_bench.py`: executed verifier/tests and local developer benchmark launcher.

GitHub is the **source/evidence repository**, not a development host. All development/testing described here ran locally.
