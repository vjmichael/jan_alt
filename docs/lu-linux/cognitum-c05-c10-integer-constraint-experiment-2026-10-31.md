# Cognitum C05/C10 bounded integer-constraint experiment — documentation only

**Recorded:** October 31, 2026 (Arizona time; some container timestamps are November 1 UTC)  
**Repository:** `vjmichael/jan_alt` (Lu repository)  
**Status:** Experimental Cognitum backend results documented; **NO Lu C05/C10 integration implemented or authorized**.

> **User direction (October 31, 2026):** No further changes to Lu are authorized. This is a documentation-only record. The proposed C05/C10 Lu capability route below is **not approved work**. Do not interpret this document as authorization to modify Lu source, build configuration, plugins, runtime, tools, or any branch's executable code.

## Question and verified result

Find all integers satisfying

```text
1 <= x < y < z <= 9
x + y + z = 12
x + 2*y + 3*z = 29
```

The **complete** solution set is:

| x | y | z |
|---:|---:|---:|
| 1 | 5 | 6 |
| 2 | 3 | 7 |

**Independent completeness argument:** Subtracting the sum equation from the weighted equation yields `y + 2z = 17`, hence `y = 17 - 2z` and `x = z - 5`. The strict inequalities `y < z` and `x < y` give, respectively, `z > 17/3` and `z < 22/3`. Since `z` is an integer, only `z = 6` or `z = 7` remains. Both substitutions satisfy all original constraints. An independent enumeration of all `9^3 = 729` integer triples from 1 to 9 found exactly these two solutions.

## What actually ran

- **C10:** Direct Cognitum typed-Protobuf host-authorized integer-constraint calls to its pinned local Z3 backend. Two SAT calls returned independently checked witnesses, followed by an UNSAT result after blocking the known solutions (SAT, SAT, UNSAT). The last result is correctly labeled `UNSAT_SOLVER_CLAIM_NOT_A_PROOF`; completeness is independently supported by the algebra and exhaustive enumeration above.
- **C05:** Direct exact-rational linear-specialist Protobuf calls evaluated the linear system for `z=6` and `z=7`, with responses revalidated. A separate SymPy check supported the parametric derivation.
- **Security negatives:** An unauthorized C10 call was rejected with `HOST_AUTHORIZATION_REQUIRED`; a reply rebound to a different request was rejected.
- **Regression evidence:** 47 focused C10 tests passed, plus six subtests.
- **Scope restriction:** These were Cognitum backend experiments. **C05 and C10 were not registered as newly authorized Lu model tools**, and no live Lu-host-routed C10 invocation was demonstrated.

## Exploratory small-model results — not a controlled Cognitum efficacy benchmark

Model: locally running Qwen2.5 0.5B Instruct Q2_K GGUF, direct llama.cpp server, temperature 0 unless otherwise stated in the original receipt.

| Condition | Observed result | Interpretation |
|---|---|---|
| Unaided model, full question, 3 direct trials | 2 incorrectly concluded there were no solutions; 1 ran out of tokens after invalid reasoning | No complete correct unaided answer in this sample |
| Manually supplied verified C05/C10 answer and proof, original full question, 3 direct trials | 3 failed to give the complete proof within output limit | Supplying evidence alone did not guarantee usable explanation |
| Same manually supplied verified context plus concise restatement instruction, 2 direct trials | 2/2 correctly reproduced both solutions and the short proof | Prompt differs; **not** a paired estimate of integration benefit |
| Lu's existing structured model-turn API without C10 routing, 3 turns | All 3 failed at `model_nonobject_rejected` | Output-format/integration failures, not mathematical answers |

**Do not claim:** that Lu has a working C10 model-to-tool route; that a solver's UNSAT response alone constitutes a certified proof; that HDC/KAN were evaluated here; or that this experiment establishes a general accuracy improvement.

## Component distinctions and potential research

- **C05:** Exact arithmetic, algebra, and linear-system specialization.
- **C10:** Constraint solving, SAT/UNSAT claims, witness checking, and formal-verification functionality.
- **C08 / HDC:** Optional similarity and candidate-retrieval/representation research; not an exact enumerator or proof engine in this test.
- **C09 / KAN:** Optional, default-off learned numerical approximation; may assist heuristic numerical work but does not guarantee completeness of discrete integer solutions in this test.

HDC/KAN remain separately testable specialist modules; keeping them separate does not preclude future controlled studies of their mathematical usefulness.

## Unapproved future concept — documentary record, not an implementation request

A possible future **host-reviewed Lu C10 capability** would need fixed typed input/output contracts, trusted backend binding, bounded expression translation, per-turn authorization, independent SAT-witness checking, transparent UNSAT provenance, refusal/negative-routing controls, and paired model-versus-tool evaluation. **This is a proposal only. The user explicitly withheld authorization to modify Lu; do not start this work without new explicit approval.**

## Evidence provenance

This record summarizes the independently executed Cognitum experiment packaged in `Cognitum_C05_C10_Integer_Constraints_2026-10-31.zip` and its `ENGINEERING_REPORT.md` (conversation artifact, not committed here). Earlier Lu arithmetic-routing and P25 findings belong to separate experiments and are not reused as C10 integration evidence.

**Change scope for this branch:** one documentation file only; no Lu source changes, runtime changes, configuration changes, or Windows/Linux build modifications.
