# Lu Windows x86-64 development preview — acceptance gates

> **Historical preview readiness only (superseded 2026-10-29).**
> The Alpha release target is now a **Cowork-free, non-inheritable-Jan-feature-free**
> Lu Windows x86-64 build with end-to-end fault-localizing diagnostics.
> Prior Jan-compatibility preview results and NSIS installers are development
> evidence only, not the new Alpha release qualification. See
> [the current Alpha decision](lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md).
> Benchmarking remains deferred.


Status: **Windows-only development preview, not a production release.**
This file records *observed* evidence; a passing installer build is not
evidence that model inference, native tools, or all GUI flows work.

## Verified on disposable Windows GitHub Actions runners

| Gate | Evidence | Result |
| --- | --- | --- |
| Standalone Lu NSIS build, Vulkan worker, Bun and UV packaged | [Build 40534953723](https://github.com/vjmichael/jan_alt/actions/runs/40534953723) | Pass |
| SHA-256 / source-commit manifest | Same build | Pass |
| Silent install and uninstall; Lu and bundled runtime PE headers are AMD64 | [Smoke 40542358856](https://github.com/vjmichael/jan_alt/actions/runs/40542358856) | Pass |
| Real installed Lu startup (12 seconds), with disposable Jan profile and `jan://` registration sentinels left untouched | [Startup 40544281643](https://github.com/vjmichael/jan_alt/actions/runs/40544281643) | Pass, **not** GUI E2E |
| Updater disabled and Jan release-note fetch avoided in Lu preview | `useAppUpdater`, `TauriUpdaterService`, `DialogAppUpdater`, frontend regression | Implemented; new candidate validation pending |
| Fresh Lu profile has empty MCP servers and never re-adds Jan Browser on settings read | `setup.rs`, `core/mcp/commands.rs`; real WebView2 E2E #40554486741 | GUI test passed; hardened NSIS rebuild pending |
| Current hardened x64 preview installer, startup, empty MCP profile and worker checks | [Build #40557690189](https://github.com/vjmichael/jan_alt/actions/runs/40557690189) | **PASS**; checksum and NSIS artifact uploaded |

The first successful installer was built from SHA
`279a6d8e92a43bf871f9ff1b9c63372a31133a4c`. It predates the
Windows `jan://` registration safeguard and first-run network/configuration
changes, **so it is not the final intended preview**.

## Windows-only acceptance sequence

1. Build the current Lu Windows x86-64 preview from an exact immutable Git
   SHA. Bundle Vulkan llama.cpp, Bun, UV, and all engine DLLs.
2. Use the ephemeral runner to verify the binary and bundled runtime PE
   architecture, installer checksum and provenance, and silent NSIS
   installation. Never run test installations on the user's Windows PC.
3. Launch the **installed** `Lu-Desktop.exe` with `LU_DATA_ROOT` confined
   to a unique runner-temporary directory. Verify Jan's real roaming AppData
   sentinels and `HKCU\Software\Classes\jan\shell\open\command` remain
   unchanged, then kill the process and uninstall Lu.
4. On the hardened cold-start build, assert `Lu/data/mcp_config.json` exists
   and contains an empty `mcpServers` object, while leaving existing Lu
   MCP configurations untouched.
5. Before distributing beyond developer testing, validate visible GUI
   initialization, a local GGUF model load and inference, a native tool call,
   memory read/write persistence across restart, and independent Jan/Lu
   uninstall and profile preservation on a real Windows x86-64 VM.

## Explicitly not complete

- Unsigned development installer: Windows SmartScreen warnings are expected;
  there is no production signing, authenticated update channel or release key.
- Windows external signed Core Extension executable loader is **not enabled**;
  experimental Linux-only worker work is deferred. Windows AppContainer tools
  have separate diagnostic tests but do not establish general CE release safety.
- The first installed process test shows it remains alive; it does **not**
  guarantee WebView2 rendered the setup screen correctly or that a GPU/model
  inference path is functional. GitHub hosted VMs do not provide the user's
  physical Vulkan/NVIDIA GPU.
- Fresh installation may fetch recommended model/catalog metadata unless
  the user has offline models; full no-network onboarding remains to be designed
  and validated. Disabling preview *application updates* alone does not imply
  network-free model discovery.
- Full DLC Workspace environments, secure third-party CE lifecycle and
  broader Lu roadmap remain deferred until a usable Windows baseline exists.

The Lu overnight hourly development automation is disabled. Do not
automatically reenable it, touch local Windows AppData, or merge to
`main` to run any of these tests.

## Real Windows x64 local inference evidence (October 27, 2026)

- [Packaged worker boot/auth/EOF shutdown #40548990539](https://github.com/vjmichael/jan_alt/actions/runs/40548990539): **PASS**. Installed worker initialised ggml DLLs, emitted a port/PID handshake, rejected missing/wrong bearer tokens, accepted its authenticated loopback model-list request, and exited cleanly on stdin EOF.
- [Real local GGUF chat inference #40550104505](https://github.com/vjmichael/jan_alt/actions/runs/40550104505): **PASS**. In a disposable Windows runner, the installed Lu worker loaded a 135M-parameter SmolLM2 Instruct Q4_K_M GGUF fetched solely for the test, with pinned SHA-256 `bda484992f9655d22504b14e57985257fa6a86937c61f957cf99c10a3bcae169`. It generated a valid authenticated assistant response with 14 completion tokens, then shut down. <https://huggingface.co/lmstudio-community/SmolLM2-135M-Instruct-GGUF/blob/main/SmolLM2-135M-Instruct-Q4_K_M.gguf> publishes that digest; the checksum is enforced before local loading.
- [GGUF streaming CI #40550371673](https://github.com/vjmichael/jan_alt/actions/runs/40550371673): **PASS**. The installed worker generated a real authenticated assistant completion (17 tokens) and a second OpenAI-compatible streaming completion with `text/event-stream`, SSE data frames and the `[DONE]` marker; stdin EOF shut the worker down cleanly.

These checks validate the **installed engine worker**, not full graphical chat, model-selection onboarding, tool routing, or persistence. The GGUF is a disposable test input, not a model included in the Lu installer. Production inference remains subject to machine-specific GPU/driver compatibility.

## Windows WebView2 desktop end-to-end evidence (October 27, 2026)

- [Windows Lu WebView2 E2E #40554486741](https://github.com/vjmichael/jan_alt/actions/runs/40554486741): **PASS**, 8 tests, 2 spec files. This is a separately compiled `Lu-Desktop.exe` with the *test-only* `e2e` feature and Lu distribution identity; it is not a production installer. Real Windows WebView2 covered Lu branding, onboarding, resolved Lu profile path, MCP settings opening without reimporting Jan's browser server, custom model selection via UI, two streamed replies through a loopback mock provider, restoration of all turns after a *webview reload*, and thread deletion from UI and disk.
- The previous hardened installer [#40547217542](https://github.com/vjmichael/jan_alt/actions/runs/40547217542) successfully compiled but **failed** the native-first MCP smoke before uploading the installer. Diagnostic log showed `core::mcp::commands::get_mcp_configs` ran an independent Jan Browser default migration. The correction is in `core/mcp/commands.rs` and makes that code path preserve Lu's empty server list, while Jan's normal migration remains intact. The GUI E2E proves the fix on a debug Lu build; a hardened installer built with the fix must still pass its separate packaging gate.
- The mock model responses are deterministic. They demonstrate real UI/provider/IPC/thread-storage integration, **not** a real GGUF response through the UI. Real local GGUF inference is separately verified through the installed worker.

### Remaining Windows user-visible release gates

1. Rebuild the hardened **release-profile** NSIS from the updated Lu branch, then pass installer/real-startup/native-first MCP/worker gates before artifact upload.
2. Wire and exercise a small GGUF model from the **desktop GUI** through the same bundled local worker, without treating a direct worker HTTP test as a UI test.
3. Run a first-party Lu-native tool call initiated by a chat model, including scope and denial checks.
4. Prove thread/memory restore after a **full Lu process restart**, not just WebView2 reload, and verify uninstall preserves independent Jan data.

## Windows GUI-to-real-GGUF integration milestone (October 27, 2026)

- **PASS** — [Lu WebView2 + real GGUF CI #40561041839](https://github.com/vjmichael/jan_alt/actions/runs/40561041839), **10 tests across 3 spec files**, all passing. The test compiled a separately branded `Lu-Desktop.exe` with *test-only* embedded WebDriver, then verified a pinned SmolLM2-135M-Instruct GGUF loaded from a previously validated NSIS package's llama.cpp worker. A user-created **local OpenAI-compatible provider** in Lu's real GUI selected that model and streamed a **51-character generated response** into WebView2. The actual response was restored from Lu's Rust thread store after webview reload. This does **not** prove the built-in llama.cpp *model-library import* UI, native tool invocation, or a full desktop restart.
- **PASS** — [Hardened Windows installer #40557690189](https://github.com/vjmichael/jan_alt/actions/runs/40557690189), commit `c93be1ef260a2c29949264a6ba26cee33e11b04a`. It passed the real startup, independent profile, native-first MCP and bundled worker smoke gates and uploaded `Lu-Windows-x64-Vulkan-Development-Installer`. The GUI-to-real-GGUF test above consumed an **earlier validated installer** `40542686980` for the worker, not this newest installer.
- Next acceptance work: user-facing built-in local GGUF import and selection; model-originated Lu-native file-tool invocation with consent and workspace scope; conversation/memory restoration across a **complete Lu application restart**; independent Jan/Lu uninstall/profile integrity on representative Windows systems.

CI installer artifacts are temporary and unsigned. Neither this test nor the installer build runs on the user's own Windows machine or alters their real AppData.
