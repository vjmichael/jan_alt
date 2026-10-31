# W-NATIVE-JOURNAL: real installed Lu tool and receipt retest

Date: 2026-10-31. Experimental test-only branch, not Lu Stable.

## Observed failure that motivated this gate

In native-only Windows NSIS run 41235830176, the pinned Qwen2.5 0.5B GGUF generated two actual responses, requested and executed a Lu read-only Protobuf file tool, and the continuation returned a correct evidence-bearing final answer. The test then failed a static requirement that the durable journal contain seven records; it contained six. Source inspection of supervised_tool_generation.rs proves ParsedCandidate is appended only when parse_model_boundary returns Some; therefore an accepted final response without a second parsed candidate produces six, without losing any model output or tool/effect receipt.

The revised test **does not waive** authorization, tool result, final answer or durable provenance: it requires precisely the six-event or seven-event ordered timeline, first and second raw model outputs equal the recorded outputs, one actual tool feedback, terminal final answer equal to returned answer, no Rejected/GenerationFailure, and correct independently generated file proof marker.

The same original run failed a secondary receipt validation when scripts/lu/check-installed-smoke-verdict.mjs was missing. That script is restored and unit tested, but continues to refuse any self-claimed alpha promotion or Cowork-independent attestation.

## Test execution

New workflow .github/workflows/lu-windows-native-journal-retest.yml fetches the **unchanged existing** native-only NSIS artifact from 41235830176, pins the exact SHA-256 35acb87b602ed2a5313c70e8cadf79b77965dc6b91993c6820bcbfc64b6f9be3, downloads the same exact GGUF and validates its SHA-256. On an isolated disposable Windows runner, it installs the NSIS, checks zero Jan/Bun/UV executables, invokes the genuine Lu-core model/tool/journal test, checks lazy startup/profile A/B/A and uninstalls. The validator emits a bounded, non-self-attesting receipt even if the actual model fails.

**Important:** the Lu-core test harness here is patched, whereas the downloaded installer is the exact previous unchanged binary. If successful, this proves native runtime/tool execution against that installed engine and corrected independent test contract, **not** a newly rebuilt shipping GUI with the corrected test source. It does not prove the production WebView's GUI path.

No migration, user machine installation, or automatic release occurs.

## Independent native Windows result — PASS, no alpha self-approval

GitHub Actions Windows 2025 [workflow 41240948894](https://github.com/vjmichael/jan_alt/actions/runs/41240948894) **completed successfully** using the previously compiled, independently pinned native-only NSIS (SHA-256 35acb87b602ed2a5313c70e8cadf79b77965dc6b91993c6820bcbfc64b6f9be3), not an altered binary.

Observed positive test markers:
- LU_INSTALLED_REUSE_PROVENANCE_PASS rebuild=false exact_SHA=true.
- LU_NATIVE_ONLY_INSTALLED_PAYLOAD_PASS legacy_executables=0.
- LU_INSTALLED_NATIVE_LAZY_BOOT_PASS owned_legacy_workers=0.
- LU_REAL_GGUF_NATIVE_TOOL_JSON_PASS generations=2 tools=1 worker_recovered=true.
- LU_INSTALLED_NATIVE_GGUF_TOOL_TURN_PASS.
- LU_W05_INSTALLED_PROFILE_RESTART_PASS runs=3 roots=2 preserved=true cross_profile_writes=0 jan_sentinel=true.
- LU_INSTALLED_SMOKE_VERDICT package=true model=true profile=true alphaAccepted=false.
- LU_NATIVE_ONLY_UNINSTALL_PASS desktop=false inference_engine=false.

Workflow published provisional audit receipts artifact ID 13057965231. The receipt is **not independent Guardian attestation** and explicitly states alphaAccepted=false.

**Boundary:** Real model/tool execution was verified via an isolated Lu-core runner using the installed NSIS inference engine. This does not prove the complete installed WebView UI can send, display, authorize, and persist a native tool turn after the Jan chat-route extraction. The corrected journal assertion is test-only, not a production model/effect-journal rewrite. The installer binary remains unchanged. Windows 10 x86-64, old-to-new upgrade, core LCX-03, socket host authorization, and independent promotion/rollback still require separate proof.
