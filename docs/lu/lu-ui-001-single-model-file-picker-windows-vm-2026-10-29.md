# LU-UI-001 — Single GGUF native file picker per import dialog

Date: 2026-10-29
Evidence: user-observed Windows 11 Enterprise x64, Oracle VirtualBox, Lu 0.8.5 x64 development preview.
Patch base: `lu/windows-x64-preview-build` at `21397e6bb2c4aa8a3c80eb78a121c452425cf839` (branch head when fix began).
Installed VM artifact: Lu 0.8.5 preview from `d6edb050d797e0d492223db6da8f335dd7c37ce1` (earlier build of that branch).
Ownership: independent Lu UI fix, **not** the AX/Cowork extraction or DX/diagnostics branch.

## Reproduction observed

1. In Settings -> Llama.cpp -> Import, click **Select GGUF File** repeatedly while the Windows file-open dialog is still active.
2. After selecting a GGUF, click **Change** repeatedly.
3. Windows displays multiple independent "Open" file-picker windows, including a crowded taskbar preview.

User screenshots also confirmed successful import of `qwen2.5-0.5b-instruct-q2_k.gguf`. Import success is not evidence of successful model loading or inference. The VM's earlier `Failed to load llamacpp backend` report is a **separate** unresolved DX/inference issue.

## Root cause

`web-app/src/containers/dialogs/ImportLlamacppModelDialog.tsx` called `serviceHub.dialog().open` for every click. `multiple: false` controls the number of selected files in **one** native dialog; it does not prevent opening several dialogs. Existing button disabled conditions tracked importing or validation, but not an in-flight OS picker. State-only busy flags can also race with rapid clicks before React re-renders.

## Fix

- Use a synchronous `useRef` in-flight guard before starting the async OS picker.
- Reflect the busy state in UI so **Select**, **Change**, MMPROJ, draft, import, and Cancel controls are not active while a picker is pending.
- A shared guard covers all native file selectors in the same importer.
- Release the lock in `finally` on file selection, cancellation, validation completion, and native rejection.
- Surface a controlled error toast if the native picker fails; preserve existing filename normalization and metadata validation.
- Keep dialog closure from resetting the form while a native picker is in flight.

## Regression tests added

`web-app/src/containers/dialogs/__tests__/ImportLlamacppModelDialog.test.tsx`:

1. Rapid repeated clicks on **Select GGUF File** create exactly one picker, and cancel allows another.
2. Rapid repeated **Change** clicks create exactly one new picker, and selected replacement file is processed.
3. Pending main GGUF picker disables MMPROJ/draft selectors and import modal cancellation.
4. Picker service rejection releases the lock and permits a retry.

## Acceptance / limitations

- [x] Source guard and regression tests committed in isolated branch.
- [ ] Run exact-branch frontend Vitest, typecheck and lint.
- [ ] Verify in a fresh **Windows 11 Enterprise x64** Lu build from the patched branch: repeated clicks and taskbar previews show one native picker at a time, including the **Change** path.
- [ ] Verify cancellation and OS error permit reopening.
- [ ] Independently test GGUF load/generation on CPU; do not count UI importer pass as inference pass.
- [ ] Review incorporation into the ongoing AX/DX development stack before any release.

This source file is inherited from Jan under Apache-2.0; retain repository LICENSE/NOTICE and Jan-origin provenance. Do not edit protected `main`, AX/DX stacks, Cognitum, or the physical Windows profile for this independent fix.
