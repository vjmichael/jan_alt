# Cognitum P25 Expanded — Local Live Model and Backend Readiness Gate

**Date:** October 31, 2026 (America/Phoenix); container UTC was November 1, 2026.  
**Status:** one-model extended live benchmark complete and independently audited; **five-tier/multi-DLC scientific campaign remains open**.

## Tested proposition

Lu's already reviewed exact-rational capability router can improve a small local model's fraction answers when a user turn explicitly authorizes the registered Cognitum native worker. This compares **OFF (no authorization)** to **ON (one-turn host authorization and deterministic Lu route)** using identical per-pair user text. It does **not** measure Qwen's spontaneous tool choice or the independent effect of the schema wording alone.

- Real executable SHA-256: `d302a8eac85616b9cca27e8148241bffdf5868bb8ee09ed54bc99a063898cbb5`.
- Real model: `qwen2.5-0.5b-instruct-q2_k.gguf` (CPU `llama-cpu`, context `4096`, GGUF SHA-256 `9ee36184e616dfc76df4f5dd66f908dbde6979524ae36e6cefb67f532f798cb8`).
- Seed `251031`; 16 distinct mathematical problems across four families (addition, subtraction, multiplication, nested arithmetic), 2 repetitions each; arm and case order independently shuffled with the fixed seed.
- Six distinct non-routable guardrail cases, 2 repetitions, two arms: user tool refusal, ambiguous multi-problem, calendar date, URL, symbolic algebra, and nonfraction multiplication.
- Live inference was performed through the fresh D04F Lu Linux desktop and private native test socket, using its actual model loading and Cognitum worker. No simulated model responses.
- An independent verifier reparsed arithmetic expressions with an AST-to-Fraction evaluator, regraded the model's last reported fraction, and joined all turns against real SQLite event rows. The verified tool result matched the independent oracle in every approved eligible case.

## Results — live 0.5B

| Category | OFF | ON |
|---|---:|---:|
| Eligible arithmetic turns | 32 | 32 |
| Completed | 30 | 32 |
| Failed turns (counted incorrect) | 2 | 0 |
| Correct final simplified fraction | **0/32** | **32/32** |
| Native host-routed Cognitum calls | 0 | 32 |
| Median end-to-end turn time | 1125 ms | 2137 ms |
| p90 turn time (descriptive) | 9159 ms | 2575 ms |

Matched eligible pairs: **32 gains, 0 losses, 0 both correct, 0 both incorrect**. *These 32 paired comparisons are repetitions of only 16 unique questions. This is an exploratory demonstration, not an externally validated general effect.*

**Negative routing:** all **24** non-routable control turns completed without a native tool call, in either arm. This is evidence for scope discipline within these six specific prompt classes, not a universal injection-defense result.

**Audit:** 88 real turn groups, 32 host route-selection entries, 32 matching tool results; independent verifier checked exact event order, payloads, conversation/task grouping, and per-turn model finalization. Two OFF failures retained as failures and mapped to rejected-turn audit records. The auditor's 13 adversarial/control tests passed.

**Latency note:** assisted turns are slower (median 2137 ms vs 1125 ms). The OFF p90 includes model stalls, so latency summaries should be reported together with failures and individual receipts.

## Cognitum backend breadth: C05 and C10

Backend-readiness run (direct local calls, **not** Lu-authorized tool routing): **7/7 verified sample probes** of symbolic math, scientific math, arbitrary precision decimal, exact rational matrices, root bracketing, discrete simulation, and C10 finite Boolean unsatisfiability. All **83/83** C05/C10 unit tests passed without competing model inference. During a concurrent model run, **81/83** passed; two C10 incremental-session assertions observed UNKNOWN in place of SAT, reproducible on a co-loaded run. An idle rerun returned valid SAT checkpoints. This is a **timeout/resource-contention reliability concern** requiring targeted repetition, not proof of erroneous SAT/UNSAT classification. C05/C10 were **not** made available to the live model through Lu, and no unsupported model efficacy claims are made.

## Historical larger-model evidence — NOT pooled

The recovered P23 FULL report (operator-reported `qwen/qwen3.8-27b`, independent identity unavailable) was previously re-audited by P25. On **12 distinct scheduling tasks**, strict protocol-plus-answer was **0/12 OFF** versus **5/12 ON**, but mathematically tolerant grading was **10/12 vs 10/12**. The strict difference predominantly reflects formatting; it is not evidence of general accuracy gain. That run had different prompts, tools, model, and infrastructure, and involved **no new 27B inference** in this checkpoint. Its results must not be aggregated with the new 0.5B fraction outcomes.

## Model coverage

The original requested five tiers are documented in `P25_5_Tier_Execution_Matrix.json`. A local runtime inventory found one runnable Qwen2.5 0.5B Q2_K GGUF; an attempted model download failed in this environment. Therefore **only sub-1B was newly measured**. The historical 27B evidence was audited separately; ~1B, 7–14B, and ~16B were not run. Quantization, controlled inference seed, energy/VRAM and alternative Cognitum capability effectiveness remain open.

## Explicit acceptance boundary

- **Closed:** expanded P25 0.5B exact-arithmetic/routing holdout, independent journal and oracle verification, negative routing sample, direct C05/C10 component readiness.
- **Open:** multi-model, five-tier, multi-capability paired scientific evaluation; C10 responsiveness under load; real Windows model runs and full DLC routing support.
- **Unchanged:** P46 cgroup2 kernel-required containment and Windows Job Object OS acceptance, which belong to separate gates; trusted Cognitum remains operational without writable cgroups.

## Evidence and reproducibility

Use `benchmark.py` with a real trusted Lu D04F development host and installed GGUF. `verify_p25.py` reads raw results and the host's SQLite audit in read-only mode; `test_auditor.py` exercises integrity negatives. No benchmark tool can authorize a worker without Lu's normal host permissions. Files here exclude GGUF bytes, SQLite database, runtime tokens and socket paths. `c05_c10_reference_probe.py` is a direct backend readiness check, not a model-facing tool.
