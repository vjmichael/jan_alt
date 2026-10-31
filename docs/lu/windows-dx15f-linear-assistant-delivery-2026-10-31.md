# DX-15F: first native assistant delivery receipt for linear Lu threads

Date: 2026-10-31. Baseline: 7654eb6c08297e0ca0ad77e518af1aed0494e8dd.

## Observed Windows DX-15E failure

Run 41219283094 passed the real-GGUF host build, loaded the sealed Lu engine, independently verified the engine and desktop exited, then generated a real native assistant reply. The UI assistant appeared and the persisted JSONL assistant row existed. The run failed after 30 seconds at the WebView readback/React commit receipt, so the second-process readback phase was not reached.

## Source defect

The native stream sets a one-use ticket for the host-verified saved userTurnId. OnFinish previously passed the optional message-branching parentId to beginLuAssistantWrite. New ordinary linear conversations have no explicit parentId and no pendingAssistantParents entry; planContinuation therefore yields null. The receipt rejects that null, leaving readback and React commit unobserved even if the assistant was saved and displayed.

## Correction

For delivery evidence only, use the final existing persisted user row in the same thread when a conversation is still unbranched. Preserve explicit parents for branched conversations. The ticket continues to verify the exact host-saved userTurnId and thread ID; a wrong/stale assistant cannot grant authority or establish evidence. No saved message parent links are rewritten and no Jan/Cowork inference path is added. The existing write-promise, service readback, exact content and actual React callback gates remain intact.

The Windows E2E test now prints only fixed readback and React states when this gate fails, without exporting IDs, prompts, message contents or user paths.

## JSONL content equivalence

The Windows messages endpoint persists serde_json::Value, which can reorder nested object keys. JSON.stringify(candidate.content) === JSON.stringify(expected.content) can therefore reject a fully identical saved record based on property insertion order alone. The readback checker now canonicalizes JSON object keys recursively while preserving array positions and values. Identity, role, thread, and exact content remain mandatory; a failed serialization cannot certify storage.

## Verification and follow-up

Local isolated TypeScript strict compile: PASS. Eight focused Node tests exercised exact linear receipt flow, branch requirements, wrong conversation, stale callbacks, saved-row comparison and pre-render-before-write behavior: 8 PASS. These are focused frontend logic checks; they do not substitute for the repository Vitest suite or Windows WebView2 acceptance. Push to the original alpha branch only after review so the existing DX-15E workflow runs once on the committed revision. Alpha cold restart still requires independent live Windows verification.
