# Lu Windows x86-64 development preview — acceptance gates

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
| Fresh Lu profile has empty MCP server list, not Jan legacy MCP defaults | `setup.rs` and startup probe `-RequireNativeMcpFirstRun` | Implemented; new candidate validation pending |
| Complete current hardened x64 preview installer with startup and profile gates | Windows `lu/windows-x64-preview-build` successor | Pending |

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
