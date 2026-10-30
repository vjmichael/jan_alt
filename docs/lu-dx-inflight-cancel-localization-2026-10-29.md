# DX-12 — Preserve cancellation evidence while a model loop is active

## Problem
A native turn can enter the model loop and then receive an authorized
cancellation signal. The host finding interpreter previously tested
`model-loop-entered && !model-loop-returned` before
`native-cancel-signalled`. A trace ending with the cancellation checkpoint
would therefore tell the operator to await ordinary model-loop completion
instead of identifying **unverified worker exit** as the next diagnostic gate.

## Change
- For a **nonterminal** accepted trace whose last checkpoint is
  `native-cancel-signalled`, prioritize `worker_recovery`,
  `worker_terminated_unobserved` and `check_worker_exit_and_journal`.
- Do not infer worker exit, actual task cancellation completion or restart.
- Preserve existing terminal-failure and success precedence when an actual
  host terminal checkpoint later arrives.
- Add Rust actual-journal regression for cancellation *after* model-loop
  entry and later host failure; TypeScript export/description regression
  rejects a forged ordinary-inference finding over the same sequence.
- Run independent Windows x64 host finding workflow, frontend typecheck,
  Vitest/lint, and inherited desktop gates.

This change is diagnostic interpretation only: no changes to cancellation
authority, worker signaling, GGUF inference, assistant persistence or
Cognitum. Stacks on DX-11 PR #72. Protected main, AX/Cowork and personal
Windows profile remain untouched.
