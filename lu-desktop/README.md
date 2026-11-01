# Lu Independent Desktop — R12 integration candidate

**Status: source-level Windows x64 type-check passed; NOT an installed alpha.**

This is an intentionally separate Tauri 2 / React 19 root, distinct from Jan's
`web-app`, inference manager, settings, model picker, and plugins. GitHub is a
repository, not the build hub. Windows GPU + image inference and installer
acceptance remain the required alpha release gates.

## Existing-source workflow

1. Use the reconciled local `src-tauri/lu-core` (R10/R11) and `lu-win-worker-job`.
   Do not substitute the older R9-only core (image/saved-turn methods differ).
2. `npm run build` compiles the small React frontend and generates `icons/icon.ico`.
   React, React DOM and Tauri API were obtained from the already uploaded
   `Lu_L13_Yarn_part01/02/05` caches. No online CDN or Jan frontend is needed.
3. `LU_ENGINE_PACKAGE_DIR=/path/to/verified/lu-inference npm run stage-engine`.
   This copies **only** the exact SHA-256/size-pinned R11 Vulkan engine files;
   it does not choose arbitrary executables, download packages or copy sources.
4. Use a genuine MSVC/Windows SDK resource compiler and Windows Tauri build to
   compile the independent executable, then package the NSIS installer. The
   local Linux toolchain lacked `llvm-rc`. `scripts/check-win-local.sh` is an
   intentionally **typecheck-only** script using an empty `.res` placeholder;
   it is NOT suitable for linking, packaging, deployment, or release proof.
5. Run on physical Windows with AMD R9700 GPU to establish device offload,
   text generation, MMProj image Q&A, native tools, cancellation/restart,
   installer and uninstall acceptance. Never approve these gates by inference.

## Security boundaries

- The WebView can supply only opaque model, image, session and generation IDs.
- Model and image paths come from trusted OS dialogs, never JS payloads.
- Imported GGUF files are copied and admitted by Lu Core; explicit MMProj pairs
  are bound to one host-minted model ID.
- Image bytes stay in a bounded host registry; Protobuf refs are checked against
  the pinned images and fail closed if no vision-capable model is active.
- `llama-server.exe` is checked against hardcoded digest; the three MSVC runtime
  DLLs are also hash checked. The engine uses host-generated loopback API auth.
- The WebView cannot choose model executable paths, runtime flags or DLLs.

## Known unfinished alpha items

Chat history currently uses a small bounded JSONL fallback rather than the full
ANSF conversational book/revision model. Native tools are implemented in Lu Core
but not yet wired as a permissioned desktop turn. Real GPU and image Q&A,
recovery, cancellation stress tests and Windows installed-app acceptance remain
open. Tauri's WebView2 installer mode is `skip` for this development candidate,
so a final independent installer must establish prerequisites or bundle them.

No Cognitum module or Jan execution bridge is imported by this desktop root.
