# Lu Linux development evidence and convergence

This directory records the locally developed Linux Lu desktop/test host and optional Cognitum integration work. **It is an evidence/patch ledger, not a complete D04F source checkout or a released Linux installer.**

## Begin here

- **[Lu Linux additions and Windows convergence inventory](lu-linux-development-additions-and-convergence-inventory-2026-10-31.md)** — comprehensive D02–D04F feature ledger, actual source/branch status, Windows collision map, shared-Lu architecture and CV-00 through CV-07 integration gates.
- **[Latest P46/P25 Linux follow-up](p46-p25-next-startup-precondition-holdout-2026-10-31.md)** — 158/158 scoped process tests, fresh 9-case/18-pair real Qwen holdout, remaining kernel-cgroup restrictions.
- **[D04F linked desktop acceptance](cognitum-d04f-desktop-p46r8-p25-followup-2026-10-31.md)** — successful local Linux development binary and real GGUF host, host-selected Cognitum call, restart and token rotation; not installer certification.
- **[D04E durable route audit](cognitum-d04e-durable-route-audit-2026-10-31.md)** — `HOST_ROUTE_SELECTED` before dispatch, legacy SQLite migration and rollback evidence.
- **[Machine-readable latest gate ledger](evidence/p46-p25-next-gate-ledger-2026-10-31.json)** — precise test counts, model/binary hashes, accepted and unaccepted gates.

## Do not confuse these artifacts

- **Local developer build:** real reconstructed Linux `Lu-Desktop`, model/worker tests and private debug socket, with their own recorded hashes.
- **GitHub Linux development branch:** D02–D04F documentation, structured acceptance evidence and selected source patches; currently missing complete intermediate source overlays needed for straightforward replay.
- **Cross-platform AF_UNIX crate:** separate [IPC prototype branch](https://github.com/vjmichael/jan_alt/tree/lu/ipc-common-af-unix-20261031); not yet wired to shipping Lu.
- **Windows alpha:** separate [Windows six-gate candidate](https://github.com/vjmichael/jan_alt/tree/lu/windows-alpha-six-gates-20261031); its installed GUI/installer verdicts and worker Job Object gates are independent.

**Convergence policy:** one Lu product, shared durable conversation/authorization/Protobuf/core, OS-specific verified backends, optional feature-gated developer test host and Cognitum CE. Preserve Linux and Windows evidence without prematurely merging or promoting either branch. Local-first development; GitHub is the source repository and optional independent verification archive.
