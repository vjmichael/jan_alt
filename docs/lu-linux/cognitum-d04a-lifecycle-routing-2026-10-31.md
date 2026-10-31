# Lu Linux / Cognitum D04A — Lifecycle hardening and model-routing evaluation

**Recorded:** October 31, 2026  
**Repository:** `vjmichael/jan_alt`  
**Baseline:** D03 reconstructed Lu Linux developer tree, pinned Lu source `68eab79e2799c02cec8949993cebd64215f00559`, L16, P0 native-test-host and Cognitum D01–D03 overlays.  
**Disposition:** D04A *partial developer gate passed* for process-group cleanup, cancellation testing, and exploratory evaluation. **D04 kernel isolation and durable host-crash recovery remain OPEN.**

## Implementation

One modified file: `src-tauri/lu-core/src/cognitum_dev_native.rs` (D04 source patch in this evidence bundle). The fixed Cognitum Python worker launches as a dedicated Linux process-group leader using `CommandExt::process_group(0)`. On every worker return path, including success, Lu attempts `SIGKILL` on the process group and waits on the direct child. `ESRCH` is accepted if the group no longer exists; other signal failures invalidate apparent success. The worker remains bound to the host-defined Python/root/source hash and a fixed Protobuf operation; it cannot accept model-provided executable paths or argv.

This is **not** a kernel confinement boundary: a descendant can escape with `setsid` or another process-group transition, a host death can interrupt cleanup, and signalling descendants is not equivalent to independently observing all descendants reaped. The worker continues to report `kernelConfined=false`, and production ExecuteCode admission is not granted.

## Verified local source tests

| Test | Outcome | Qualification |
|---|---|---|
| Lu Core feature-on tests | **80/80 PASS** | Includes the real SHA-pinned Cognitum Python call and D04 lifecycle cases |
| Lu Core feature-off tests | **69/69 PASS** | Existing Lu behavior preserved |
| Desktop developer-feature `cargo check --offline --lib` | **PASS** | Actual D04 source, GUI sysroot, type-check-only Tauri config |
| Fresh linked D04 `Lu-Desktop` executable | **NOT COMPLETE** | Link/build timed out; no D04 GUI runtime claim |
| Synthetic mid-call Python cancellation | **PASS** | Worker reports active PID, Lu cancellation interrupts and reaps it promptly |
| Same-group grandchild after parent exits | **PASS** | Group termination reaches inherited-PGID descendant |
| Descendant deliberately calls `setsid()` | **ESCAPE REPRODUCED** | Process-group kill did not catch it; fixture explicitly SIGKILLed afterward |
| Delegated writable Linux cgroup2 | **NOT AVAILABLE** | `/sys/fs/cgroup` is read-only; no `cgroup.kill` witness |

`git apply --check Lu_Linux_Cognitum_D04_Source.patch` passed **against the reconstructed D03 working tree**. It is not a patch against the unmodified `jan_alt` main branch or against the documentation-only D03 evidence branch. Rust code belongs to the same Lu codebase; this is not a separately forked Lu application.

## Paired live model benchmark — six exact-rational tasks

The already-running **D03**, not D04, desktop hosted the Qwen2.5 0.5B Q2_K GGUF. Six distinct expressions were each presented twice: identical user prompt, fresh saved conversation, alternating order of with/without one-turn approval. The user prompt allowed any suitable tools but did not explicitly name Cognitum. Exact references were independently evaluated with `fractions.Fraction`.

| Condition | Completed | Correct exact answers | Real Cognitum tool calls | Median full-turn time |
|---|---:|---:|---:|---:|
| No Cognitum approval | 6/6 | **0/6** | 0 | 779 ms |
| Cognitum approved and available | 6/6 | **0/6** | 0 | 1,012 ms |

This is an important negative result: merely registering/approving the tool did **not** cause this small model to use it. The errors in these 12 turns are model arithmetic or model-routing errors, **not failed Cognitum calculations**. No performance or accuracy improvement is established by this neutral evaluation.

### Separately measured explicit tool-routing condition

With a prompt that explicitly instructed the model to produce a `lu_cognitum_rational` JSON tool envelope, **six of six** approved turns generated a valid real Cognitum tool call, received the correct Protobuf result, and finalized the exact correct fraction (**6/6**). Median full-turn time: **3,169 ms**. This establishes tool-dispatch feasibility, but the prompt intervention makes it **inappropriate to treat these six as the causal WITH arm** in the neutral matched-prompt accuracy comparison. The model used the tool when instructed; it did not spontaneously discover the need for it in the neutral condition.

| Expression | Independently computed answer |
|---|---|
| `9/14 + 5/21` | `37/42` |
| `13/17 - 4/51` | `35/51` |
| `7/12 * 15/28` | `5/16` |
| `17/36 + 5/24` | `49/72` |
| `11/18 - 7/30` | `17/45` |
| `(3/7 + 2/9) * 5/11` | `205/693` |

Benchmark limitations: one trial per expression per condition; small heavily quantized model; no controlled inference seeds, temperature, device energy or memory capture; no broader model tiers; no statistical significance. All raw outputs and measured latencies are preserved. Do not infer a 100% tool reliability rate across general tasks from six explicitly scripted instructions.

## Security and architecture gates not closed

1. **Linux cgroup2 admission:** Require a genuine host-owned writable delegated cgroup2 root, place the fixed worker in it *before* execution, and independently verify a `cgroup.kill` cleanup including a `setsid` breakaway. This environment's cgroup2 mount is read-only. Do not weaken that gate to make a test pass.
2. **Host death/restart:** Require an independently surviving watchkeeper, durable effect/checkpoint ledger, and replay-safe reconciliation of worker trees. Ordinary group cleanup cannot prove this.
3. **Trusted code identity:** The current SHA pins the worker source file, **not** its import dependency tree, interpreter, entire environment or signed CE package. Complete those checks before production admission.
4. **Tool authorization:** Preserve D03's verified persisted USER turn, scoped ExecuteCode grant and single-use approval. Discovery of the tool is never authority to run it. Do not let model-originated content override worker/executable/policy configuration.
5. **D04 runtime:** Complete the linked binary and live post-build cancellation/worker test. Keep D03 measurements labelled D03, not D04.
6. **Augmentation research:** Improve host-safe tool-routing prompts/policy, then run controlled, multi-repeat, multi-model WITH/WITHOUT tests and attribute routing failure separately from backend failure. Expand beyond rational arithmetic (C05/C10/C14).
7. **Shared Lu code:** Integrate audited changes into the same Lu architecture after Linux/Windows regressions. Windows alpha, release config, and main remain unchanged in this D04A experiment.

## Source/evidence files

- `Lu_Linux_Cognitum_D04_Source.patch` — canonical D03→D04 one-file Rust source delta (trailing newline verified, `git apply --check` passed locally).
- `D04_Test_Evidence_2026-10-31.json` — structured acceptance and SHA-256 evidence.
- `matched_live_results.json` — raw 12-turn matched-prompt records (running D03 host).
- `explicit_routing_results.json` — six model-originated tool-routing records (running D03 host).
- `process_group_escape_probe.json` — independent escaped-grandchild negative control.
- `core-tests-2.log`, `core-default-tests.log`, `tauri-check.log`, `binary-build.log` — test/build logs.
- `matched_benchmark.py`, `tool_routing_benchmark.py`, `process_group_escape_probe.py` — reproducible test drivers.

**Final D04A status:** real lifecycle hardening code tested; benchmark completed; kernel containment, host-death recovery and fresh linked D04 GUI remain unaccepted. This is development evidence, not a security certification or production release.
