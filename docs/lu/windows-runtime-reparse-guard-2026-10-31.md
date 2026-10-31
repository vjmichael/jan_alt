# Lu-Win x86-64 alpha: native runtime redirection guard

Engineering checkpoint: October 31, 2026. Base revision: 7654eb6c08297e0ca0ad77e518af1aed0494e8dd.
GitHub is a source and milestone repository; the implementation and its initial tests were developed in an isolated local Linux workspace.

## Problem and correction

The old recovery guard rejected ordinary symlinks and tested the canonical parent of lu-native-runtime. A Windows directory junction targeting a sibling directory can still satisfy the canonical-parent test. The fix rejects the Windows FILE_ATTRIBUTE_REPARSE_POINT bit explicitly (including junctions), and rejects redirected preexisting owner.lock, tasks.sqlite and effects.sqlite files before opening the runtime journal.

The guard does not grant model, task or tool authority. It does not access the user's Windows AppData or the historical Jan profile. It remains startup protection only: same-user race conditions, hard links, SQLite auxiliary files and ACL/handle-based enforcement need separate review.

## Local test evidence

- Rust 1.98.0 rustfmt --edition 2021 --check on the exact patched source: PASS.
- The two extracted source guard functions compiled with Rust 1.98.0 on Linux.
- Three independent Rust unit tests: regular file accepted, redirected owner-lock file rejected, and a sibling-directory symlink (which passes the former canonical-parent predicate) rejected: 3 PASS.
- Lu Linux native test-host Python security-client suite: 13 PASS; supporting baseline, not evidence that a Windows desktop runs.
- Source regression added for a Windows junction to a sibling directory and for Unix redirected owner/journal files. The Windows-specific test, full Tauri unit tests, native WebView2 and installer have NOT been run for this patch.

## Next verification and Actions usage

Keep existing DX-15E Windows run 41219283094 on head 7654eb6c undisturbed; that run targets live model exit, first assistant turn, and cold-restart disk readback. Once it completes, validate the new source on a disposable Windows host and fold it into the next pinned alpha candidate. Avoid repeating the entire expensive Windows workflow solely for this isolated hardening unless a concrete acceptance failure requires it.

Alpha remains unaccepted until a real pinned Windows x86-64 installer launches, loads a real GGUF, responds, persists a conversation across restart, and reliably terminates its Lu-owned engine.
