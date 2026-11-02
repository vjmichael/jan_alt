# Lu R14 — TaskDialogIndirect startup failure and Common Controls v6 fix

**Release status:** NOT ALPHA, Windows execution pending.

## User-observed failure

R13 installed `lu-desktop.exe` exits before the UI with the Windows loader
message `The procedure entry point TaskDialogIndirect could not be located`.
This is an executable loading problem, not Vulkan, GGUF, or multimodal model
failure. The original R13 `lu-desktop.exe` import table binds
`TaskDialogIndirect` against `comctl32.dll`, but its PE Resource Directory
entry is zero. A fake resource compiler had emitted an empty Windows resource.
Windows normally loads older Common Controls (v5) without v6 activation.

## Repair

- Added genuine RT_MANIFEST type 24, executable ID 1 to the PE via an
  independently parseable, restricted `.res` compiler linked using lld-link.
- XML explicitly requests `Microsoft.Windows.Common-Controls` version
  `6.0.0.0` (public key token `6595b64144ccf1df`).
- Retains Windows GUI subsystem and x64 architecture.
- Portable Python verifier parses PE headers, resource directory, XML
  identity and imported symbols and **fails packaging** if any is absent.
- NSIS dev evaluation rerun with original pinned Vulkan llama-server and DLLs.
- Six regression tests passed, including fail-closed negative tests.

## Proof

- R13 `objdump`: Resource Directory RVA=0, bytes=0.
- R14 `objdump`: RT_MANIFEST type=0x18/id=1, resource size=0x1d8.
- R14 `.rsrc`: includes Common Controls v6 XML identity.
- R14 still imports `TaskDialogIndirect` from `comctl32.dll`.
- New Windows GUI EXE SHA-256: `0e238ef975ed726b625c4ae07fbaa775b6348d22fd6efacd581d516acb7bc0b4`.
- Installer SHA-256: `9fa81064d0ae4281d7ef0986a42da6b88b67ac88c0d642d24e370d3496315646`.

## Acceptance remaining

- Windows OS must actually load and show the Lu Tauri window. Static PE
  verification provides strong evidence but cannot prove the OS accepts the
  replacement binary in the user's configuration.
- GPU offload, loaded GGUF, MMProj image Q&A and recovery/tools remain open.
- Cross-build still uses a development-only placeholder for icon/version
  resource compilation. The manifest **is real and embedded**, but this is
  not a production Tauri installer build.
- Install R14 separately from R13 and test. User data is not deleted by
  removing R13. Do not mark alpha approved.

## Microsoft documentation

- Common Controls versioning: https://learn.microsoft.com/en-us/windows/win32/controls/common-control-versions
- Enabling visual styles with a version 6 manifest: https://learn.microsoft.com/en-us/windows/win32/controls/cookbook-overview
- Task dialogs require comctl32.dll v6: https://learn.microsoft.com/en-us/windows/win32/api/commctrl/nf-commctrl-taskdialog

## Reproducible checks

- `python3 scripts/build_win_manifest_res.py scripts/lu-desktop.manifest <output.res>` emits a genuine PE manifest resource. Link it with `/manifest:no <output.res>` using `lld-link`. The development-only cross-build wrapper is in `scripts/build-r14-manifest-eval.sh`.
- `python3 scripts/verify_win_v6_manifest.py <lu-desktop.exe>` checks the actual linked PE, not the XML source.
- `LU_WIN_DESKTOP_EXE=<path> python3 -m unittest discover -s tests/windows-physical -p test_win_manifest_regression.py -v` runs the six regression tests.
- `packaging/build-dev-evaluation.sh` invokes the verifier before NSIS; it rejects the old R13 format.
