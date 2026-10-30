# DX-15E — Real Windows native assistant cold-process restart

## Objective
Prove more than the DX-15D in-session message service readback. A native
Lu GGUF assistant answer must survive a complete Lu desktop process
shutdown and be recoverable by a newly launched Lu desktop instance,
using *only* a throwaway Windows GitHub Actions runner profile.

## Windows runner evidence
A new Windows-2025 workflow builds the **debug WebView2 Lu desktop** with
its test-only embedded WebDriver and the checksum-verified native CPU
engine and pinned Qwen 0.5B GGUF. This is not the installed signed NSIS
acceptance gate and does not use the developer's Windows profile.

Process A:
1. Confine `LU_DATA_ROOT`, `JAN_DATA_ROOT`, AppData, temporary paths and
   WebView2 data to `$RUNNER_TEMP/lu-dx-native-restart-$GITHUB_RUN_ID`.
2. Bootstrap a saved thread with a Jan-compatible mock **only** to create
   the existing conversation UI. Load the pinned real GGUF through Lu's
   trusted native model interface; explicitly enable native Lu chat.
3. Send a real native GGUF user turn and require a substantive assistant
   reply. Verify the mock provider did not receive that turn.
4. Wait for the actual assistant record to appear in the isolated Lu
   `messages.jsonl`, and verify the DX-15D redacted operator export
   separately reports `readback=confirmed` and `reactCommit=observed`.
5. Write a test-only checkpoint containing the thread ID, saved assistant
   ID, reply text and a SHA-256 of persisted message content, outside Lu's
   thread storage. Never upload the test profile or this checkpoint.

Between phases the workflow verifies that no original Lu desktop
executable instance or WebDriver listener remains alive. The WDIO
session must be fully torn down before Process B begins.

Process B:
1. Start a **fresh Lu desktop process** using the same isolated data
   root. Do not load, prompt or regenerate with a language model.
2. Navigate to the exact previous thread and assert both saved user
   turns and the exact native assistant reply are restored in WebView2.
3. Independently re-read the isolated `messages.jsonl` and require
   exactly one matching native assistant ID and the same saved content
   hash. An answer only seen in a prior in-memory React store cannot pass.
4. Emit a fixed pass marker only after both process-level phases pass.

## Fail-closed conditions
- No process A checkpoint, overwriting a checkpoint, root outside
  `RUNNER_TEMP`, missing message ID or hash, missing saved record,
  missing readback/React evidence, a changed reply or surviving Lu/WDIO
  process all FAIL the gate.
- The native turn may not fall back to a Jan provider.
- Checkpoint IDs and model text are held only in disposable runner
  storage and never included in diagnostic exports or uploaded artifacts.

## Provenance and limits
This verifies recovery after a clean **process** restart. It does not
prove power-loss atomicity, Windows OS reboot recovery, fsync, installed
signed NSIS correctness, or that pixels were visibly painted to a
particular monitor. The old provider-based restart test does not count
as this Lu-native test; both are kept separate.

DX-15E stacks on DX-15D PR #82. Do not merge until the exact-SHA
Windows two-phase workflow passes. Do not change protected main,
Cognitum, AX/Cowork or user AppData. Only build/verify in CI.
