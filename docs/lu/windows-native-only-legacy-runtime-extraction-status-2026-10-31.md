# Lu Windows native-only legacy-runtime extraction status — 2026-10-31

**Architecture target:** Cowork-free Lu x86-64 alpha, without the inherited Jan worker/Bun/UV bootstraps. **Status: in development, NOT alpha-certified.** This records exact evidence and known blockers; nothing is promoted to Lu Stable.

## Established positive baseline

- [DX-15E](https://github.com/vjmichael/jan_alt/actions/runs/41224161266): Windows real GGUF native chat response and cold-process persistence in a *test-only* Tauri host, source `d0593a2728a61c949f3ae64dcd630a53748e2025`.
- [Compatibility installed NSIS lifecycle and real Protobuf model-tool test](https://github.com/vjmichael/jan_alt/actions/runs/41232017298): exact installer source `513969a77e1205cedb3b6ae7bb5d389acda94b60`; both Windows jobs passed real install/profile/uninstall and independently model-generated `generations=2 tools=1 worker_recovered=true`. **The package still bundles Jan worker/Bun/UV and is not Cowork-free.**

## Current native-only extraction

- [Native-only Windows NSIS build #41235830176](https://github.com/vjmichael/jan_alt/actions/runs/41235830176), source `7fae3e19c42bf58d2223a4ea675690438a821e74`. Pinned Lu CPU inference engine build and digest, no Jan/Bun/UV resources in Lu manifest, and disposable Windows-platform overlay all **PASSED**; exact Tauri/NSIS compiler step was still **IN PROGRESS at last check**. No NSIS package artifact yet. **Do not claim an installed pass.**
- Earlier native-only [run #41234053997](https://github.com/vjmichael/jan_alt/actions/runs/41234053997) failed because Tauri's **automatically merged** `src-tauri/tauri.windows.conf.json` reintroduced `externalBin` for `resources/bin/bun-x86_64-pc-windows-msvc.exe`. The native-only Lu configuration correctly omitted it, so the build failed with a missing resource. The [fixed disposable overlay](https://github.com/vjmichael/jan_alt/commit/7fae3e19c42bf58d2223a4ea675690438a821e74) was separately validated [on Windows](https://github.com/vjmichael/jan_alt/actions/runs/41235737447). Do not restore the old binaries merely to compile.
- [Independent Lu native-only IPC allowlist](https://github.com/vjmichael/jan_alt/actions/runs/41235464533): Windows source-mutation checks and **Windows Tauri `cargo check --features lu-distribution --lib` passed**, source `c3205f4e9035ee5aebc7ec80754cc97980c83584`. It excludes inherited Jan MCP/agent/raw path file handler commands from Lu's app-level command table. **Separate branch; not merged into running NSIS or tested with installed GUI**.
- [Lu-only system monitor capability](https://github.com/vjmichael/jan_alt/actions/runs/41236458404): Windows mutation/security tests passed, source `4dd50142d9c6d37963172b3ba6ccec040310e9b3`. Removes `llamacpp:allow-read-gguf-metadata` from Lu's monitor while leaving Jan original unchanged. **Separate source branch; installed GUI and Tauri build pending**.
- [Cross-version W06 native-only upgrade test](https://github.com/vjmichael/jan_alt/actions/runs/41235002842) passed Windows PowerShell parser/preflight only. Prepared immutable old-vs-new [artifact reuse workflow](https://github.com/vjmichael/jan_alt/blob/work/lu-win-native-only-w06-upgrade-20261031/.github/workflows/lu-windows-native-only-w06-actual.yml) pins old installer run `41227420821` (source `513969a...`, NSIS SHA-256 `3c33c4959b43ac892bd9469c2667db05898049d797e9353384bd741be0842fb0`) and new candidate run `41235830176` (source `7fae3e19...`). **Not executed**; the new artifact must exist and be verified first.

## Remaining next acceptance gates

1. Complete and examine the exact Windows native-only NSIS artifact and build logs.
2. On a disposable Windows host, install it, inspect the **entire installed tree** for zero Jan worker/Bun/UV executables, verify actual Lu engine manifest/hash, startup without MCP, A/B/A profile restart, GGUF-generated authorized Protobuf tool turn/continuation, and uninstall. Record independent verdicts and no hidden alpha self-certification.
3. Install the *previous legacy-containing Lu* package and perform **real in-place replacement** using the new native-only package. Verify old legacy binaries actually existed before upgrade and are absent after, all user/Jan data sentinels persist and uninstall is clean. Failure means installer migration needs remediation; never make it pass by silently deleting arbitrary user files.
4. Integrate the independently compiled restricted IPC allowlist and Lu monitor capability **only after installed-GUI and security verification**, with unchanged ordinary Jan compatibility.
5. Windows 10 x86-64 actual host acceptance, cancellation/recovery and final Cowork independence proof remain separate. An Actions Windows 2025 result cannot certify Windows 10.

## Safety/release controls

GitHub is a repository/evidence archive, not the dev hub. Work is isolated on disposable branches. No Lu production binary is self-modified in place. DRC Guardian + human approval govern future promotions; they are design work and do **not** provide a current runnable rollback. See [ADR-LU-DRC-001](./lu-development-release-control-adr-2026-10-31.md).
