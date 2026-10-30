# Lu DX-06 — human-readable operator diagnostics

## Why
Lu already exposes a privacy-filtered JSON report and a host-only checkpoint finding
on the DX stack. A general Windows user should not need to interpret schema
codes or export a file merely to see where a native model turn stopped.

## Implementation
- Add **Check diagnostics** beside **Export diagnostics** in the Lu-only native
  GGUF model picker. The result appears as an accessible status paragraph.
- Read the existing `lu_inference_diagnostics` Tauri command, scoped to the
  active turn when one is in progress; never start or cancel a generation,
  change permission grants, collect raw logs or enumerate files.
- Validate the host's trace and attached finding with the *same* allowlists
  used for redacted export. Display only compiled-in explanations; never
  interpolate a model message, exception, path or uncontrolled host field.
- A bounded failure after `native-model-loop-entered` says the **model/tool
  continuation interval needs investigation**, with root cause unconfirmed.
  A successful host turn explicitly states that assistant persistence/render
  is not yet verified. Missing, stale or dropped evidence returns a safe
  inconclusive message; cancellation is not mistaken for worker termination.

## Acceptance
1. New unit tests check the fixed operator messages for failure, host success,
   missing evidence and cancellation. No private data may be included.
2. Desktop Integration CI runs `luDiagnostics.test.ts`, TypeScript checks,
   Lu frontend build and the model-picker lint.
3. Dedicated Windows WebView2 acceptance runs the real GGUF turn and verifies
   the existing host trace + export before clicking **Check diagnostics**.
   The control must show the corresponding host finding and not reveal
   conversation IDs, provider data, paths or sessions.
4. Exact SHA green CI required before declaring installed acceptance. This
   debug WebView2 runner is **not** a signed Windows 11 NSIS release test.

## Non-goals
This feature offers safe triage, **not** automatic root-cause determination or
a complete Protobuf causal trace. It does not persist diagnoses across
restarts, prove the assistant message was saved/rendered, or repair failures.
It remains DX-only pending review against AX/Cowork extraction. Protected
main, Cognitum and the user's Windows/AppData are untouched.
