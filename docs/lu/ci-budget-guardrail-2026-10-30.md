# Lu CI Budget Guardrail — 2026-10-30

**Status: staged on `ci/lu-actions-budget-20261030`, not applied to the existing PR branches or protected `main`.**

## Trigger

The repository owner's October 30 GitHub usage alert reports 2,000/2,000 included Actions minutes used, with a November 1 reset. A $0 overage budget may prevent new billed Actions jobs. Do not interpret jobs left queued, skipped or unable to run as passing acceptance.

## Verified before staging

- PR #93 exact head `dd815b8c96f524d99f1fb782f29bcde71103ec17`: Core Contracts 41070628837, Phase4F 41070628752, native loop 41070628680, and Jan Docs 41070628739 **passed**, plus author/label housekeeping.
- The real W01 Process A/B WebView2 workflow run 41069397256 was still **in progress** when this guardrail was prepared, on an **older** PR #92 head `34182682dbf590225e0cfb749f2c16958de6136f`. This does not qualify PR #93.
- Existing `lu-core-ci.yml` triggers on both `pull_request` and `push lu/**`, producing duplicate core work on open Lu branches.
- Existing `lu-dx-native-assistant-restart-windows.yml` automatically triggers long Windows builds on each source update to five development branches.

## Staged workflow modifications

1. **Lu Core Contracts**: preserve `pull_request` validation. Restrict `push` to `lu/core-explicit-validation` so ordinary development pushes no longer launch duplicate jobs.
2. **Windows DX-15E W01**: preserve the original full two-process test, its exact runner, paths and `workflow_dispatch`; restrict auto `push` to intentional `lu/alpha-w01-acceptance-run`. Do not stage a candidate on that ref until the budget permits a real run.
3. Both edits are **trigger-only**, leaving test assertions, strict authority, error handling and evidence gates unchanged.

### Important deployment constraint

These workflow files do **not** yet exist on protected `main`. GitHub's manual `workflow_dispatch` selection is therefore not a substitute for a push trigger until these definitions are available on the default branch. The explicit staging refs retain a practical trigger. The guardrail has no effect on existing PR #92/#93 branches until integrated into their workflow source. A draft PR itself can invoke other `pull_request` workflows; defer opening it until Actions usage is available.

## Next steps

- Preserve PR #93 as the source-validated predecessor. Do not rerun already-passed checks just to poll status.
- Record the final outcome and content-free failure class from the **existing** Windows run 41069397256. If it fails, repair the verified class on a separate source branch; never guess the model reply bytes.
- Once budget is available, integrate/review the guardrail and stage **one** exact-head Windows candidate; require actual W01 first reply + durable readback + new-process render and all existing AX/DX/A/W acceptance conditions.
- Keep `main` protected; do not characterize source review, skipped tests or green checks on a different SHA as Alpha acceptance.
