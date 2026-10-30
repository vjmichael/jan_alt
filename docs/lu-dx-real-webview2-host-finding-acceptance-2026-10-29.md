# Lu DX-05: real Windows WebView2 operator finding acceptance

## Proven foundations (separate gates)

- W05 installed Lu A → B → A profile restart passed, including zero cross-profile writes, in Windows installer run 40979764520.
- The native Protobuf file-tool stress passed 20 complete repeats with 48 concurrent fixture roots in Windows run 40983824157.
- DX-01 operator export was proven with a real resident GGUF and privacy checks in WebView2 run 40979814151.
- DX-03 typed Windows causal-contract tests passed 8 diagnostic-contract and 14 localization tests in 40982250437.
- DX-04 Lu *host-only* finding Rust unit tests passed 5/5 and strict Clippy in 40987616899. PR #65 desktop integration (commit fda4b4f...) passed; its installed runtime was not proven.

## This next test

Branch `lu/dx-webview2-host-finding-acceptance-20261029` stacks on PR #65 and only adds a test and CI routing.

On `windows-2025` with real Tauri WebView2, a checksum-pinned Qwen 0.5B GGUF, a trusted resident Lu engine and an isolated profile:

1. Persist one USER-role bootstrap turn in the normal UI, using the mock provider only for thread creation.
2. Check five unauthorized native-turn requests (W02) and the real persistent-engine generation-cancel flow (W04).
3. Invoke an admitted **real** native GGUF tool turn with the saved user turn, without silently falling back to the Jan provider. Permit success or failure: this gate is about accurate diagnosis, not generation success.
4. Await the host's terminal event (or explicitly cancel an overlong turn) and request the genuine `lu_inference_diagnostics` host snapshot.
5. Require an accepted host-minted trace, zero event loss, model-loop entry, an observed terminal event and a conservative `lu.native.host-finding.v1` status matching what the host actually recorded:
   - successful host turn → `host_turn_returned`, first unobserved `assistant_persistence_unobserved`;
   - failed model loop → `bounded_host_boundary`, first unobserved `native-model-loop-returned`, next probe `inspect_engine_and_native_tool_journal`.
6. Click the real **Export diagnostics** button, intercepting its Blob only in the disposable test, and verify its exported `hostFinding` and `hostTrace` agree on the same host trace reference and contain no prompt, conversation ID, provider name, raw model path or session IDs.

The test never injects a synthetic host trace, treats a trace reference as permission, accesses a personal Windows profile, or invents a causal Protobuf diagnosis. It does not establish saved assistant reply persistence/rendering, and it is not a signed Windows 11 Enterprise NSIS test. The Windows executable used for this test is a debug instrumented Lu host. Tests must finish green on an exact SHA before claiming this gate passed.

## Integration remaining

Future DX work must connect per-process/worker epoch and complete Protobuf causal trace to real host/worker events. Assistant persistence and UI rendering must be attested separately. Preserve Jan Apache-2.0 notices and keep AX extraction distinct until reviewed.
