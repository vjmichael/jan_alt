# Lu model JSON boundary: repair, validate, authorize

Status: implementation on isolated Lu development branch. The JSON-boundary unit suite passed earlier Windows CI; durable journaling and real-GGUF/packaged installer gates require fresh CI evidence.

## Direction of the exchange

- **Lu host to model:** the trusted host serializes the advertised (host-selected) tool schemas into bounded JSON. Tool results are first checked against their Protobuf output type by the native codec, then strictly JSON-serialized before model continuation. Never guess or repair an invalid internal result.
- **Model to Lu host:** a complete model response is untrusted JSON text. The Lu Core model boundary parses it strictly, optionally proposes one narrow syntax correction, then parses again. It rejects duplicate keys even in nested argument objects.
- **After parsing:** the tool-turn controller checks exact allowed fields and a host-selected tool catalog. Each typed codec validates arguments and converts them to the registered Protobuf request. Conversation-bound authority and host policy separately authorize execution. Model text cannot grant capabilities.
- **Native tool reply:** the native registry returns a typed Protobuf payload or structured failure, which is validated/serialized to model-facing JSON data.

## Repair policy

Permitted, bounded and observable repairs: remove an exact JSON Markdown code fence, or remove trailing commas outside quoted strings. Both may be combined. These are syntax-only corrections. The controller exposes the last repair status for diagnostics.

Rejected: unterminated JSON, inferred closing braces, guessed missing field values, hallucinated tool names/paths, invalid backslash escape interpretation, additional prose, duplicate keys and oversized frames. A valid but unauthorized repaired request is still denied by the subsequent checks.

Lu native Rust uses `model_json_boundary.rs`; Jan's legacy frontend `toolCallRepair.ts` is **not** the Lu native execution gate. JSON remains an external LLM interface only, while all internal Lu native tool contracts remain Protobuf. External MCP adapters, if installed later, have their own independent boundary checks.

## Release acceptance

1. Unit tests: exact/uncorrected JSON, fenced JSON, trailing commas, both repairs, duplicate keys, truncation, size caps, invalid escapes, serialized tool response.
2. Native integration: a repaired read request executes only if it passes codec validation and conversation authority; unknown tools, extra fields and duplicate keys fail.
3. Real GGUF: show actual model-generated tool JSON and tool-result continuation with boundary diagnostics; no synthesized response counts as evidence.
4. Persist model output, syntax repair status, rejected calls, typed tool feedback and final response in a profile-private SQLite journal, and prove restart recovery. The journal must be provided by the trusted desktop caller.

This limited repair policy is intentional: a broad heuristic or AI-based repair may be appropriate for **display-only** previews, but never for an automatic privileged tool execution.

## Durable model boundary evidence

The independent SQLite WAL/FULL `ModelTurnJournal` stores host-scoped conversation/task IDs, user request, raw generated frames, parsed syntax candidates (including repair status), rejection errors, native tool feedback and final answers. `run_supervised_native_turn_journaled` records raw model frames **before** invoking tools and fails closed when an audit write fails. Tests reopen the SQLite file to verify persistence and isolation. The unjournaled API remains for compatibility and test fixtures, **not** as proof that the desktop production route is integrated.

The audit journal is **not** the effect journal and must never authorize replay of uncertain tool side effects. A downstream tool may complete before its feedback is durably recorded; interrupted side-effecting turns still require effect-journal reconciliation. Store the audit DB at a host-owned profile-private location, not a model-selected workspace. Future work must wire the journaled route into the real Windows GUI and enforce retention/redaction policies for sensitive text.
