# Lu DX-01 operator export — real Windows WebView2 acceptance

## User-visible capability

The **Export diagnostics** button is present on the Lu-only native GGUF model picker on the DX branch. It calls `exportLuNativeDiagnostics()` to download `lu-native-diagnostics.json`. The report permits only known status codes and bounded host/frontend events; it does not export prompts, model filesystem paths, thread identities or raw logs.

The feature remains on a separate DX branch until integration. An existing installed Lu Alpha or the AX/Cowork extraction PR stack does **not** yet contain the button/host diagnostic command.

## Independent Windows validation

`e2e/specs/lu-native-inference.e2e.ts` adds `DX export button produces a content-free report in real Windows WebView2`. On branch `lu/dx-export-webview2-acceptance-20261029` the Windows `lu-native-webview2-e2e.yml` sets `LU_E2E_DX_EXPORT_ONLY=1` and skips unrelated model-generated completion and the separate live scoped-correlation case. It still loads a checksum-pinned real GGUF, runs W02 admission denials and W04 cancellation, then checks that the user-facing export:

- Creates a JSON Blob named `lu-native-diagnostics.json` from the real WebView2 UI button;
- Presents the `lu.native.diagnostics.v1` report schema and real loaded engine status;
- Never includes the saved conversation ID, bootstrap prompt, provider identity, session ID, generation ID, model reference or Windows user path in the exported text;
- Intercepts the browser download click, leaving no generated report in user AppData.

A passing mock/unit test alone is **not** installed desktop acceptance. This is an isolated debug Tauri/WebView2 GitHub Actions run on Windows Server 2025, not a signed NSIS release nor Windows 11 Enterprise. The operator's dedicated disposable Windows 11 VM can later validate the exact merged build. No user machine is accessed from CI.

## Outstanding diagnostic work

1. Run and pass exact-version DX-02/DX-03 Rust contract and causal-provenance regressions.
2. Resolve the real native-turn failure that arose after `native-model-loop-entered` in WebView2 run 40944293463; successful scoped response correlation is **not** yet proven.
3. Connect typed fault-localization findings to trusted host worker events, real process clock epoch and persistence/render evidence; current export is an observation bundle, not a verified automatic diagnosis.
4. Review AX/Cowork shared interfaces before combining this DX branch into Lu; never merge unverified code directly into protected `main`.

All reports intentionally omit raw messages, paths, secrets and model output.
