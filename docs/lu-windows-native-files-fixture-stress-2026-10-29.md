# Lu Windows native Protobuf file-tool fixture concurrency regression

## Observed failure

Windows Actions run `40981966708` (DX-03 branch) passed 5/6 `model_native_files` tests and failed `model_json_is_strict_then_dispatched_as_typed_protobuf_without_mcp` while setting up the **test fixture**. At `model_native_files.rs:37`, `fs::create_dir(subdir)` produced Win32 error **183 AlreadyExists**. The old temp root combined PID and `SystemTime::now().as_nanos()`; two parallel tests can observe an identical clock value in one process on Windows and reuse the same directory. That is an observed fixture setup failure, **not** evidence that Lu's runtime native file tool dispatch accepted an unauthorized action.

## Change

- Keep randomized timestamp and PID, but add an atomic process-local fixture ordinal so simultaneous tests cannot reuse the same path.
- Add a 48-thread concurrent fixture test; every root must be unique and contain independently readable fixture content.
- Scope the Unix-only symlink test's `allowed` variable to Unix to avoid Windows compiler warnings.
- Preserve all existing protobuf typed file tool and deny tests. No production Lu file I/O implementation changes.

## Acceptance

`lu-win-native-file-fixture-stress.yml` runs on a real Windows Server 2025 x86-64 MSVC runner, checks strict Clippy and repeats the complete `model_native_files` test binary 20 times (including the 48-thread fixture regression). Record the exact green workflow SHA before closing this batch.

This is a **Windows CI reliability test**, not Windows 11 Enterprise installed-NSIS acceptance or an assertion that the Lu file tools are available to a general user. No changes to Cognitum, protected main, or the user's Windows profile.
