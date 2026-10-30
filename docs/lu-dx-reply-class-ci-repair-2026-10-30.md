# Lu DX — Native Reply Rejection Classification CI Repair (2026-10-30)

## Scope
This draft stacks on PR #92's classifier, commit `34182682dbf590225e0cfb749f2c16958de6136f`. It repairs two source-verification failures without changing inference, reply parsing, authority, permissions, persistence, or model content export.

## Observed evidence
- Real Windows WebView2 run [41065840459](https://github.com/vjmichael/jan_alt/actions/runs/41065840459) on older `e0a83edc` reached native inference but reported `failureClass=model_reply_rejected`; it did not persist or render an assistant answer. Process B was skipped.
- PR #92 then added content-free reply-shape categories at `34182682`. That change had not been present in the older failing Windows run.
- At `34182682`, Core Contracts run [41069406401](https://github.com/vjmichael/jan_alt/actions/runs/41069406401) failed `cargo fmt --check`: the multi-arm `matches!` expression requires rustfmt line wrapping.
- Phase4F run [41069406115](https://github.com/vjmichael/jan_alt/actions/runs/41069406115) and native loop run [41069406181](https://github.com/vjmichael/jan_alt/actions/runs/41069406181) failed the same regression: `model_cannot_provide_its_own_host_session_identifier` expected `ModelReply(UnexpectedFields)`, but the host now correctly produces `ModelReplyStructure("model_tool_fields_rejected")`.

## Changes
1. Apply rustfmt-equivalent wrapping to the model-rejection arm.
2. Update the supervisor's existing negative integration test to expect the new bounded, content-free category while retaining `step_count() == 0`, the durable rejected audit record, and no authorization of model-selected host session identifiers.

No change is made to the tool-call protocol, JSON repair rules, permission engine, or the Windows operator test.

## Acceptance and remaining gate
- Require fresh exact-head `cargo fmt --check`, Phase4F, native loop, and Core Contracts CI success. A source-only fix is not a pass until the corresponding run succeeds.
- Windows [run 41069397256](https://github.com/vjmichael/jan_alt/actions/runs/41069397256) belongs to the parent `34182682` classifier head and is independent. Its outcome will reveal whether the real GGUF reply produces a specific rejection category; it does **not** validate this successor's source fixes.
- W01 requires a real Lu-native first assistant reply to be saved, rendered, and restored in Process B. Do not claim W01 or alpha from component CI.
- Keep protected `main` unchanged and merge only after review.
