# Lu Windows alpha acceptance

Status: **NOT YET DECLARED**. Windows x86-64 only. Updated 2026-10-28.

## Four mandatory outcomes
1. **Standalone Lu desktop** installs, launches, and works without a separately installed/running Jan application. Inherited Jan-derived code may remain where required and documented.
2. **Real GGUF loading** in the intended Windows inference runtime.
3. **Real response generation** through Lu's desktop conversation UI.
4. **Real native tool loop**: tool-capable GGUF requests a Lu-native tool; host validates conversation-bound authorization; native Protobuf dispatcher executes it; result returns to the model/conversation and persists. A legacy Jan or MCP execution route is not equivalent proof.

## Evidence and outstanding work
| Requirement | Evidence | Disposition |
|---|---|---|
| Windows app installation | User-observed clean Lu installation, without Jan installed; previous Windows installer CI | Demonstrated, newest artifact gate outstanding |
| Real GGUF and generation | User-observed Qwen GGUF/Vulkan loading and multiple successful answers | Demonstrated on user's Windows machine |
| Native tool operation | User-observed `lu_files_read_text` / `lu_files_list_directory`, including rejected traversal/absolute paths | Demonstrated at tool/UI level, exact full model→Protobuf→response provenance still to verify |
| Cancellation recovery | PR #23 frontend fix, 280 frontend + 37 Lu core tests reported in [validation](../lu-p4-cancel-001-validation.md) | Packaged Qwen/Vulkan test outstanding |
| Installer verification | Windows Actions workflow [Lu installer](https://github.com/vjmichael/jan_alt/actions/workflows/) | Must verify successful latest run including install, worker/startup, uninstall |

The `LU-P4-CANCEL-001` fix concerns missing Retry/Play after pre-token cancellation; frontend test success is **not** a packaged GPU worker/resource recovery pass.

## Release decision gate
Do not declare alpha until: latest Windows installer CI is green; end-to-end real model→Lu-native Protobuf-tool→response execution is evidenced (not just isolated tool success); cancellation/recovery blocking behavior is verified or explicitly triaged with release decision; retained Jan components are documented. Record exact commit, binary provenance, tests and any known limitations in this file.

## Excluded from alpha
Complete ANSF UI, the full native tool catalogue, self-diagnostics, benchmarking, Lu-to-Lu sessions, DLC ecosystem, NVP, IDE Workspace, Cognitum CE, Linux/macOS. These are later goals.

## Inheritance policy
Inherited Jan UI/runtime libraries are permitted when necessary and identified. A distinct Jan installation, Jan profile dependence or undocumented legacy tool-dispatch fallback is not. The branding issue is tracked for post-alpha polish rather than silently claiming it is solved.
