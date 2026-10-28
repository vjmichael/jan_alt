# Lu engineering documentation index

Status: reconciliation baseline, 2026-10-28. Source: user-approved roadmap decisions plus the linked implementation and CI evidence. This is **not** a claim that every repository branch or workspace has been inventoried.

## Authoritative planning and tracking
- [Alpha acceptance](alpha-acceptance.md): narrow Windows x86-64 release gate.
- [Roadmap](roadmap.md): v1.0 core, v1.x stabilization, v2.0 DLC expansion.
- [v1.0 implementation, phase smoke gates and final qualification](v1-implementation-verification.md): implementation requirements and verification matrix.
- [Component and evidence register](component-register.md): distinguish design, implementation, integration, verified tests and acceptance.

## Existing detailed engineering records
- [LU-P4-CANCEL-001 validation](../lu-p4-cancel-001-validation.md): source fix, tests and unverified real Qwen/Vulkan behavior.
- [P4 diagnostics design](../lu-p4-diagnostics-design.md): proposal **only**, no enabled runtime.
- [PR #23](https://github.com/vjmichael/jan_alt/pull/23): cancellation fix, Windows smoke-test corrections, CI and comments.

## Documentation rules
1. Mark each feature as **proposed**, **implemented**, **integrated**, **tested**, or **accepted**; code presence does not imply desktop integration.
2. Attach commit SHA and test/run evidence for each accepted engineering claim.
3. Preserve inherited Jan historical documentation; Lu-specific scope and identity are defined here, not by the upstream README.
4. Update the register at each merge/release gate. Do not mark a workflow passed while still running or failed.
5. Avoid routine Human Transfer Protocol (HTP): prefer CI, directly collected diagnostics, and automated evidence. Human consent remains mandatory for privileged actions.

This index does not supersede module-level specifications not yet reviewed. Cross-link them when independently verified.
