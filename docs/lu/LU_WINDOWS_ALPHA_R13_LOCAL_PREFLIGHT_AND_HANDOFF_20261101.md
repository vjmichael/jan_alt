# Lu Windows Alpha — R13 physical acceptance handoff

**Date:** 2026-11-01  
**Decision:** Development evaluation only — **NO ALPHA APPROVAL**

## Goal

Execute the next practical Windows installed-desktop test, preserving the R12 source, NSIS packaging and pinned Vulkan engine. No software dependencies were rediscovered or requested.

## Source correction

The Windows-target Lu Desktop executable linked in debug mode with PE **console** subsystem due to `cfg_attr(not(debug_assertions), windows_subsystem = "windows")`. Changed it to `cfg_attr(windows, windows_subsystem = "windows")`, verified the newly linked x64 PE uses Windows GUI subsystem `2`, and rebuilt the NSIS evaluation installer. The portable NSIS build script now rejects console subsystem, 32-bit PE, and wrong machine format. A negative test using a deliberately modified console PE failed as intended before NSIS packaging.

## Fresh local pass evidence

- `lu-desktop.exe` is PE32+ x64 **GUI**; SHA-256 `4ef60de064b555ab63e3ec961d3a144e7f4e203458b39ef61381a24e0192fd6e`.
- R13 dev-evaluation NSIS EXE rebuilt successfully; SHA-256 `b4bebbe8272ecb749da00d6a830770b8dbac9fb0bace0ed53c95b55c27a36241`.
- Bundled pinned Vulkan engine SHA-256 `36155bc14f8eb02224105377c946528ccac91337d715386a77d6187cb98105b4` and all three DLL hashes unchanged and checked.
- Physical acceptance kit has a PowerShell preflight, one-click CMD launcher, sample vision fixture, and handoff instructions. ZIP integrity passed.
- Earlier R12 Lu Core tests (326 passed, 0 failed, 1 ignored) remain recorded; they were **not** rerun in this R13 packaging-only change.

## Not performed / explicit holds

No Windows guest, Wine runtime, Windows GUI automation or physical AMD GPU is accessible in the current Linux container. The **actual Windows installer launch is not tested**. A real Microsoft Windows resource compiler has also not yet been used: the currently packaged executable still relies on the R12 check-only placeholder resource path. The pinned engine's `--list-devices` command can show visibility, but **does not prove** GPU layer offload; model load logs are still required. The test cannot assert that image Q&A is accurate or that ANSF/native tools are integrated.

## How to run on physical Windows

1. Install `Lu_R13_Independent_Desktop_DEV_EVAL_NOT_ALPHA.exe` (R13 supersedes R12 using the same development-only installation directory).
2. Extract `Lu_R13_Windows_Physical_Acceptance_Kit_20261101.zip` or the combined bundle and double-click `START_WINDOWS_LU_R13_TEST.cmd`.
3. Confirm the independent Lu GUI opens; import/load a GGUF, generate text, unload, attach the matching MMProj, and ask an image-dependent question using `Lu_R13_Vision_Test_Fixture.png`.
4. Test cancel and conversation restart. Answer the interactive prompts. Close Lu and let the script observe process cleanup.
5. Share the generated `acceptance-observations.json` and `llama-list-devices.txt`. Do not share private chat contents, model files or passwords.

## Acceptance decision

**Not a release gate closure.** R13 closes a development *packaging regression* (GUI subsystem) and prepares reproducible Windows test evidence. Gate 4 AMD offload, Gate 6 installed operation, full tools/ANSF and genuine Win resource build remain open.
