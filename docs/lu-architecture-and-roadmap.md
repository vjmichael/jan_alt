# Lu Architecture & Production Roadmap — Revision 0.2

Status: design update, not evidence that the features below are implemented. Applies to Lu's Jan fork.

## Product boundary: model-powered, model-neutral

Lu is a local-first AI desktop **host and orchestration platform**. Its intelligence, prose, analysis and generative decisions depend on the **loaded AI model(s)** and their capabilities; Lu Core is not itself a substitute for an LLM. Qwen is one supported model family, not the exclusive engine. Local and cloud model adapters are interchangeable, and two-model routing may delegate heavy reasoning to a capable model. Distinguish model quality from Lu's UI, policies, tools, retrieval, and inference backend. A model can be evaluated *inside* Lu without claiming the GUI is the model.

Existing architecture boundaries remain: Jan Tauri IPC, Cowork TypeScript agent loop, Rust native tools/policy, ANSF immutable messages and revisions, and app-owned memory. Protobuf for typed internal contracts with JSON adapters at external model/API boundaries. Never turn memory content or chat context into tool permissions.

## Goal: broadly useful, accessible, reproducible research and production

Support ordinary end users, students, researchers, and teams. A simple task (CV/resume, letter, budget, image export) should not require command-line configuration; power users can enable diagnostics and reproducible controlled benchmarks.

### Artifact subsystem (planned)

* Stable Lu Core `ArtifactRequest`, `ArtifactManifest`, `ArtifactResult` and `ArtifactValidation` metadata; production is delegated to replaceable libraries and isolated tool adapters.
* Formats, in priority order: **CSV**, **XLSX**, **DOCX**, **PDF**, **PNG/JPEG**, **SVG**; optionally ODS/ODT and legacy XLS/DOC conversion where needed. CV (curriculum vitae) and resume templates use DOCX/PDF; CSV is a separate tabular format.
* Validate file magic, generated size and schema, formula handling, encoding, printable previews, page counts, spreadsheet value/formula semantics, and path containment. Use temporary files plus atomic publish, typed failure statuses and user-approved destination. Sanitize formulas and external links.
* Deterministic charts, image composition and JPEG/PNG export do **not** require a generative image model. Photorealistic or illustrative original images generally require a separate image-generation model/adapter; respect model availability and licensing.
* Preserve provenance: producing model/backend (when relevant), tool/renderer version, source refs, settings and hash. Document and spreadsheet artifact engines must not be put into Lu's orchestration kernel itself.

### Observability and audit (planned, privacy-first)

* Correlate `run_id`, `trace_id`, `conversation_id`, `model_id`, `backend_id`, `artifact_id`, and scoped ANSF provenance references. Capture monotonic timings, failure classifications, process/resource samples and policy decisions at instrumented boundaries.
* Levels: default minimal local diagnostic metadata; explicit per-run detailed trace with secrets redacted; optional benchmark dataset capture only after review. No implicit cloud telemetry, keylogging, or raw prompt/tool-argument export.
* Lu's own code, IPC, memory and native tools can be observed deeply. GPU/kernel visibility depends on driver/backend; neural internal causal explanations cannot be inferred solely from execution traces.
* Trace retention, quotas, opt-out and deletion, access controls, and immutable audit events should be separately managed; user data never becomes trusted authority through observability.

### Benchmark and comparison modes (planned)

1. **Lu-common-denominator mode**: evaluate multiple interchangeable models under the same Lu task harness, tools, policies, retrieval configuration and artifact validators; report per-model strengths and weaknesses. The GUI/runtime overhead should be measured separately.
2. **Cross-client mode**: compare a model/task inside Lu with another AI GUI/client. Declare whether prompts, samplers, tools, retrieval, system policies, token accounting, runtime hardware, inference backend and versions match; report unmatched variables explicitly and never call an uncontrolled comparison apples-to-apples.
3. **Diagnostics mode**: inspect one run's tool decisions, errors, timings and redacted trace.

For reproducibility store benchmark dataset revision and hashes, canonical test cases, expected and measured outcomes, model names/versions/quantization, backends, token budget, decoding parameters, hardware, thermal/power environment, concurrency, warmup and run counts, seed where available, raw scored outputs subject to consent, and statistical intervals. Distinguish determinism from variability; no claim of general model superiority from one suite. Reports as CSV/JSONL/Parquet and optionally XLSX/PDF.

### Teacher / dataset-production mode (planned)

* Input: user-approved demonstrations, ANSF sources, validated tool outcomes and benchmark cases.
* Pipeline: select -> de-identify and permission/license filter -> annotate provenance -> deduplicate -> verify with tests/human approval -> split train/validation/test to prevent leakage -> emit schema-versioned JSONL or Parquet datasets and manifests.
* Target curricula: supervised task examples, tool-use imitation, preference pairs, evaluations and graded skills. Synthetic reasoning explanations must be labelled as generated explanations, not hidden neural chain-of-thought transcripts.
* Training itself is an **optional external adapter** (e.g. LoRA/PyTorch). Teacher Mode can prepare datasets without training any model. Generated material does not automatically retrain Lu's active model or enter trusted ANSF facts. User opt-in controls capture, release and export.
* Observe & Learn remains a separate consent-driven desktop demonstration source, **not** an always-on recording system.

### Proposed boundaries

`Lu Core -> CapabilityPolicy/Provenance/Artifact contracts/Trace schema/Benchmark protocol/Teacher export contract`

`Adapters -> local/cloud model backends; PDF/DOCX/XLSX/CSV writers; graphics renderer; profiling drivers; benchmark evaluators; dataset exporters`

`UI -> everyday generate/export actions; opt-in diagnostic/benchmark lab; explicit Teacher curation and approvals`

### Implementation order

1. Finish ANSF Memory Worker: archived read views, manual trusted-host checkpoint capture **and read-back**, continuity source checks and Windows smoke/security review.
2. Add minimal, privacy-preserving trace IDs and structured outcome events to core/IPC.
3. Add artifact contract and CSV writer first, then DOCX/XLSX/PDF and deterministic graphics.
4. Add model-neutral benchmark harness and reproducible reporting; distinguish Lu-as-common-harness from cross-GUI comparisons.
5. Add opt-in Observe & Learn / Teacher export pipeline and optional fine-tuning integrations, only after provenance and redaction tests.

## Non-goals and acceptance gates

Do not merge unfinished Lu features solely because design is documented. No silent user or model authority elevation, silent cloud upload, autonomous retraining, purported reading of hidden model cognition, or unsupported claims about image generation. CI plus real desktop tests, permissions audit, signed-commit requirements and comparative benchmark validity checks remain release gates.
