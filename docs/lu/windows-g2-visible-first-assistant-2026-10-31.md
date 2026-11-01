# LU-WIN-G2: first installed-GUI assistant render witness

Date: October 31, 2026. Source-only hardening branch `work/lu-win-g2-visible-first-assistant-20261031`, based on the Windows six-gate candidate at `dc8ac3b5c0dbbbe30db22ab3f2bf98e77dffc23a`.

## Why this is needed

The six-gate Windows acceptance driver previously accepted the first assistant merely because an assistant JSONL record was saved after the greeting. That is durable storage evidence, **not** evidence the actual Lu window rendered the reply. Gate G2 requires an installed desktop, a real GGUF, a successful model response, and an actual on-screen assistant. The later cold-restore G4 stage already requires a visible accessibility readback, so G2 should not be weaker.

## Isolated change

- After first durable assistant persistence, read the **same** already-saved JSONL via the existing disposable-profile gate. Accept exactly one assistant and extract its first text segment from the real frontend content structure (including `[{type:'text',text:{value:...}}]`), without logging it.
- Match a bounded 32-character prefix against an **onscreen UI Automation Text element** while desktop process A is still running. The real application and model are untouched: no CDP, WebDriver, simulated tool IPC, assistant injection, or model mock.
- Emit only the fixed `LU_INSTALLED_UIA_FIRST_GUI_RENDER_PASS` witness after a visible match. Missing, duplicate, empty, echoed, or invisible responses fail closed. The next stage may then create the authorized tool fixture and issue the genuine tool prompt.
- Extend the existing cold-GUI source contract and mutation fixtures to reject storage-only first-turn evidence. Add a standalone PowerShell 5.1 helper unit script that developers can execute locally without installing Lu.

## Verification and integration boundary

The source contract's first-turn proof and four deletion/fake-witness mutations were exercised in an independent V8 source check while preparing this branch. This is **not** a Windows PowerShell parser pass and **not** installed GUI evidence. A separate isolated Windows source verification workflow checks the actual PS5.1 AST/helper and Node source tests. It must pass before integrating.

**Native Windows source verification complete:** [run 41261680636](https://github.com/vjmichael/jan_alt/actions/runs/41261680636), source commit `87c1d361177fdc4961d9a7de7d3336c3cc1f13f3`, finished **PASS**. Node mutation/contract suite: **12 passed, 0 failed**. Windows PowerShell 5.1 parsed the production UIA script and ran extracted helper unit cases for genuine saved message structure, bounded witness, missing/duplicate/empty assistant and echoed user text. Fixed log witnesses: `LU_WIN_G2_FIRST_RENDER_WITNESS_SOURCE_PASS` and `LU_WIN_G2_SOURCE_INDEPENDENT_PASS installed_gui=not_tested`. This remains source-only evidence, not actual GUI/NSIS acceptance.

Do **not** change or relabel the active six-gate NSIS build from source `dc8ac3b5c0dbbbe30db22ab3f2bf98e77dffc23a`, [run 41261058985](https://github.com/vjmichael/jan_alt/actions/runs/41261058985). Its release verdict must be read from the completed job. This isolated test-harness refinement does not alter that binary, and cannot retroactively upgrade its results.

Once verified, apply this narrowly to the Windows alpha candidate and repeat independent installed UIA acceptance against the **exact newly built** SHA-pinned installer. Keep G3 model-directed Protobuf read, G4 visible cold restore, G5 authorization/descendant worker cleanup, G6 Windows 10/physical-machine/upgrade evidence independently tracked. Do not merge Cognitum/Linux or experimental AF_UNIX work to accelerate Windows acceptance.

GitHub is the source repository and independent evidence archive, not the Lu development host.
