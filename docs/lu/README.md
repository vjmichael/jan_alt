# Lu engineering documentation index

Status: updated 2026-10-29 for the **rebaselined Alpha release decision**.
This index distinguishes requirements from completed implementation; it is **not**
a claim that Cowork extraction or new diagnostics have passed.

## Binding Alpha change (2026-10-29)

- [Rebaselined Alpha: no Cowork, no non-inheritable Jan, postponed release](../lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md) — **supersedes older transitional compatibility assumptions**.
- [Alpha end-to-end DX fault-localization requirements](../lu-alpha-diagnostics-fault-localization-2026-10-29.md) — causal traces, stage localization, redacted evidence, boundary fault injection, no benchmarking.
- [Revised Alpha release gates](../lu-alpha-0.1-windows-release-gate-2026-10-29.md) — AX and DX in addition to A01–A09. Earlier Alpha candidate pin is historical, not a newly qualified release.

## Authoritative planning and tracking
- [Alpha acceptance](alpha-acceptance.md): revised Cowork-free Windows x86-64 release gate.
- [Roadmap](roadmap.md): v1.0 core, v1.x stabilization, v2.0 DLC expansion.
- [v1.0 implementation, phase smoke gates and final qualification](v1-implementation-verification.md): implementation requirements and verification matrix.
- [Jan source provenance / Apache-2.0 record](jan-origin-provenance.md): verified inherited files, modification labels, NOTICE and compliance gate.
- [Component and evidence register](component-register.md): distinguish design, implementation, integration, verified tests and acceptance.

## Existing detailed engineering records
- [LU-P4-CANCEL-001 validation](../lu-p4-cancel-001-validation.md): source fix, tests and unverified real Qwen/Vulkan behavior.
- [P4 diagnostics design](../lu-p4-diagnostics-design.md): historical diagnostic design; new end-to-end DX gates take priority. Passive prototype source exists on an independent branch, but installed diagnostic acceptance is unproven.
- [PR #23](https://github.com/vjmichael/jan_alt/pull/23): cancellation fix, Windows smoke-test corrections, CI and comments.

## Documentation rules
1. Mark each feature as **proposed**, **implemented**, **integrated**, **tested**, or **accepted**; code presence does not imply desktop integration.
2. Attach commit SHA and test/run evidence for each accepted engineering claim.
3. Preserve inherited Jan historical documentation; Lu-specific scope and identity are defined here, not by the upstream README.
4. Update the register at each merge/release gate. Do not mark a workflow passed while still running or failed.
5. Avoid routine Human Transfer Protocol (HTP): prefer CI, directly collected diagnostics, and automated evidence. Human consent remains mandatory for privileged actions.

This index does not supersede module-level specifications not yet reviewed. Cross-link them when independently verified.
