LU INDEPENDENT DESKTOP R14 — DEVELOPMENT EVALUATION
=================================================
NOT AN ACCEPTED ALPHA. NO VERIFIED WINDOWS/AMD VULKAN OR MMProj IMAGE Q&A.

This evaluation installs an actual Lu-owned Tauri/React desktop source build,
not the R11 engine-only evaluation. The Windows binary was cross-compiled with a real embedded RT_MANIFEST
requesting Common Controls v6. The version/icon resource still used a limited
development-only route, so this remains NOT AN ALPHA build. Run only in a disposable test profile.

TEST STEPS
1. Install, launch "Lu R14 Desktop Dev Eval" and verify that Lu's chat UI opens.
2. Import a GGUF with the Lu-native model picker (not Settings>Llama.cpp).
3. Load the model, prompt for a short text answer, and confirm nonempty output.
4. Unload it; attach the matching mmproj GGUF; reload; select a PNG/JPEG and
   ask an image-dependent question. Record any errors or wrong answer.
5. Close/reopen and check model catalog and chat transcript. Image bytes are
   NOT currently persisted as ANSF attachments across application restarts.
6. Check cancellation and unload; then uninstall. Native tool UI is not yet
   wired, so do NOT count native tool acceptance as passed.

The bundled llama-server.exe was cross-built with Vulkan and hash-pinned, but
actual AMD GPU offload and this imported Windows Vulkan ABI are NOT confirmed.
The desktop launcher currently discards engine stderr, so GPU offload logs
require a separate engine-level acceptance run.

IMPORTANT: A missing WebView2 runtime, missing DLL, failed model load, image
prompt failure, or a console window must be recorded as a test finding.
No software or hardware success may be inferred from packaging alone.

User-owned Lu app data at %LOCALAPPDATA% is intentionally NOT removed by
uninstall. This is a developer evaluation package; do not distribute it as Lu
Alpha 0.1 or replace an existing Jan/Lu installation.

R13 ERROR FIX: R13 had no embedded Windows manifest. TaskDialogIndirect
requires ComCtl32 v6. R14 embeds Common Controls v6 and packaging fails if
its manifest is missing. This is verified by PE inspection, not by running
on Windows. If Lu still fails, provide the exact new message/screenshot.
