# Lu W01 — Model Kind Rejection, Bounded Final Compatibility (2026-10-30)

**Status: unvalidated source candidate on `fix/lu-display-only-final-envelope-20261030`. W01/Alpha remain BLOCKED.** No Actions runs were triggered by this branch.

## Observed real Windows result

DX-15E real WebView2 [run 41069397256](https://github.com/vjmichael/jan_alt/actions/runs/41069397256) on older PR #92 commit `34182682dbf590225e0cfb749f2c16958de6136f` completed with failure:
- Real GGUF model/engine startup and Process A reached native model generation.
- Content-free failure category: `model_kind_rejected`; host last confirmed `native-model-loop-entered`, first unconfirmed `native-model-loop-returned`.
- Assistant readback and React commit were unobserved; Process B was skipped.
- This is a validated JSON *shape* failure at the model/tool boundary, but the previous classifier **did not distinguish absent, unknown or non-string `kind`**. The model output bytes are not disclosed by the sanitized operator export; do not invent their contents.

## Candidate repairs

1. The native prompt reiterates that ordinary chat uses `kind=final` and forbids alternate discriminator values.
2. After strict duplicate-key-safe JSON parsing, `NativeToolTurn` may treat **only** an exact single-field object with a nonempty string under `text`, `answer` or `response` and **no `kind` field** as a display-only final answer. It must revalidate conversation-bound permission before finishing. It does not execute tools or synthesize arguments.
3. All JSON tool calls continue to require exact `{"kind":"tool","name":"...","arguments":{...}}` schema, an advertised tool, native Protobuf dispatch, host policy, and the existing authority.
4. Unknown explicit `kind` values, non-string `kind`, duplicate keys, extra fields, blank/nested final values, truncated JSON and control/role output are not converted into tool requests or final aliases.
5. Passive host classification now distinguishes `model_missing_kind_rejected`, `model_unknown_kind_rejected`, and `model_nonstring_kind_rejected`, retaining only content-free fixed labels in the WebView export.

## Regression coverage added (pending execution)

- Acceptance of the three exact single-field, nonempty string final envelopes without tool dispatch; later replies reject as `AlreadyFinished`.
- Rejection of model-provided tool names/arguments mixed into display envelopes, wrong explicit `kind`, malformed values and duplicate keys; zero tool dispatch steps.
- A revoked host task still rejects the display-only envelope.
- Prompt role-delimiter escaping and exact `kind` instructions.
- Three sanitized diagnostic failure classes are allowed through the existing host-only evidence checks; arbitrary failure strings and private paths remain filtered.

## What this does NOT prove

The real Windows rejection's exact model JSON shape remains unknown. This candidate only resolves it if the model used one of the safely recognized final-only envelopes, or if the strengthened prompt induces the required format. It does not silently transform arbitrary `kind` values. No Rust/TS tests were executed on this branch due to the exhausted GitHub Actions allowance and unavailable toolchains in this environment.

A separate, independent stop-word hardening branch `fix/lu-chatml-stop-20261030` also exists but is **not** included in this candidate; its effectiveness is likewise unproven.

## Next verification after offline tooling is available

1. Use the local-only engineering runner on a checkout of this branch (from `tools/lu-local-offline-checks-20261030`) to run `cargo fmt`, Rust core native-turn and supervised-turn unit suites, persistent backend tests and strict Clippy. Do not claim passing results from source inspection.
2. Locally execute frontend Vitest tests for `luDiagnostics` using already-installed dependencies, with no network.
3. On a deliberate future Windows W01 budgeted run, require actual generated final, saved JSONL, readback, React commit, and second process restored without regeneration.
4. If the classifier still rejects, use the fixed *failure class only* to decide the next safe adapter. Never export model bytes, relax executable authority, or mark W01 as passed on synthetic evidence.

Protected `main` remains unchanged.
