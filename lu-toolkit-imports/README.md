# Lu toolkit migration staging

This folder holds the original owner-authored Lu tool sources for review and
incremental conversion into **bundled native Lu tools**. It is intentionally
outside the compiled Rust crate, Jan web application and package workspace.

## Current source inventory

- `batch_file_lifecycle.ts` — user-authored batch preview/apply operations
  for renames, naming templates, SHA-256 validation, collision detection,
  reversible trash and partial-operation receipts.

## Missing original dependencies

The batch source imports `./file_lifecycle` and `./tool_result`, neither of
which was present in the Library source collection available during import.
**Do not claim this file is executable, compiled, security-hardened or
integrated.** The source must not be exposed to the model tool registry.

## Integration acceptance criteria

1. Obtain the original dependency modules and verify their use of filesystem
   roots, symlink protections, allowed operations, and error contracts.
2. Map the operation schemas to Lu's typed internal Protobuf messages and
   strict model-facing JSON codecs.
3. Introduce explicit write / reversible trash capability approvals in the
   host PolicyEngine, not just schema declaration.
4. Add a persistent per-file effect journal, conflict checks immediately
   before each change, cancellation and power-loss reconciliation.
5. Test preview/apply fidelity, collisions, concurrent filesystem changes,
   Windows filename conventions, and partial receipts.
6. Only then expose the operations through Lu's native registry.

The deployed desktop's `lu.files` tools currently provide only confined,
read-only text-file and directory-listing operations. The owner's original
toolkit will become the foundation of richer default file operations as
individual modules are validated.
