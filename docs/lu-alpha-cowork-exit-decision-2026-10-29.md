# Lu alpha: Cowork exit and release boundary

Decision: the Windows x86-64 Lu alpha uses Lu-owned model, conversation and native-tool execution. Cowork is not an alpha feature or fallback. This changes the earlier 4G compatibility plan; Jan builds may retain Cowork while Lu extracts the needed capabilities independently. Alpha is postponed until this boundary and the installed GGUF acceptance pass.

## Meaning of “no Cowork or non-inherited Jan code”

The Lu alpha must not expose Cowork routes, run its TypeScript agent loop, invoke Jan's `execute_tool` path for Lu tasks, or package Cowork-only runtime modules. A static bundle import, registered executable command or reachable fallback is still a dependency even if the sidebar is hidden. The checked-in Jan-derived desktop shell, chat/history, settings and other deliberately inherited components can remain only when inventoried and attributed under Apache-2.0. “No Cowork” is not a claim that the entire app was independently authored.

## Independent gates

| Batch | Acceptance | Current state |
| --- | --- | --- |
| A: deny access | Lu-branded nightly/development/stable routes and direct session IPC deny Cowork; Jan channel behavior remains intact | Implemented in this branch; Windows CI pending |
| B: package exclusion | Lu build graph excludes Cowork route/runner/dispatch and Cowork-only assets; an artifact inventory checks the built frontend and the Tauri command surface | In progress. A branded generated-route-tree check is prepared; complete bundle and command inventory remain open |
| C: replace required capability | Each alpha tool has Lu-owned Protobuf codec, registry, host-derived conversation/task origin, scoped authorization, durable effects and cancellation where relevant | Read-only chat scratch exists; user workspace writes and Cowork parity open |
| D: installed alpha | Real NSIS-installed Windows x86-64 first run loads GGUF, answers, persists conversation, runs a native tool, stops, exits/relaunches, and recovers without duplicate effects | Open; current installer CI is not a complete installed GUI acceptance |

Keep source provenance and the full Apache-2.0 LICENSE/NOTICE in every distribution containing inherited Jan code. Do not delete Jan-derived code or data merely to make an inventory count look smaller. Record each retained Jan module by purpose and each excluded module by actual build evidence.

## Release sequence

- **Alpha:** narrowly usable Lu-owned Windows chat/inference/tool path, with the four gates above. No Cowork or non-inherited Jan agent runtime in its package.
- **v1.0:** stabilize the alpha core, diagnostics, recovery, permissions and supported native tools. Migration of remaining deliberately inherited desktop components is reviewed separately.
- **v2.0:** DLC Workspaces and optional Core Extensions become product milestones after a stable core. Define minimal compatibility contracts before v1.0 so later extensions do not force another core rewrite; do not ship unfinished DLC as an alpha dependency.

This scope can reduce cross-system debugging after extraction, but the exclusion and replacement work moves the alpha date. No acceptance claim follows from a feature flag alone.

The first package step excludes `cowork.tsx`, `artifacts.tsx` and `settings/cowork.tsx` from the Lu generated route graph while leaving Jan route generation intact. The CI checker runs after `LU_BRAND=true` Vite build and requires ordinary chat routes to remain. Other shared imports can still pull Cowork modules into the bundle; the follow-up artifact inventory must enumerate them and fail the release if any Cowork-only runtime survives.

The next inventory step records each `web-app/src` module in the optimized Lu Vite chunks and its chunk filenames, outside the packaged `dist` directory. CI retains the JSON and prints Cowork/Artifacts path matches. This measures bundled imports, including shared imports that survive route exclusion. The count is diagnostic evidence, not an AX-02 absence gate; subsequent batches must remove or classify each remaining path, inspect non-frontend runtime registration and fail the Alpha release on any Cowork-only module.

The first measured Lu bundle contained 684 frontend source modules and seven Cowork/Artifacts path matches. The Jan Cowork sidebar was one of them, pulled through the shared sidebar despite the route exclusion. The Lu branded Vite resolver now replaces only that import with a Lu-owned empty component and the post-build checker rejects the original sidebar module. Jan builds still resolve the original component. Six other named matches remain to be measured after this change; native agent-tools command registration remains a separate AX gate.

The subsequent build measured 680 modules and five named Cowork/Artifacts matches: `useCoworkConfig`, `useCoworkRun`, `useCoworkSessions`, `coworkPing`, and `coworkTurns`. Shared startup hydration imported the Cowork configuration and sessions stores. Jan-only hydration now lives behind a branded build constant and a dynamic module; the next optimized build must prove `useCoworkConfig` absent. Other shared imports of session state and run progress remain, as does native command registration.
