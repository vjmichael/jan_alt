# Lu Core-Owned Next Stable Candidate — engineering milestone

2026-10-31. **Candidate, not a release or authorized automatic merge.**
Branch: work/lu-core-owned-next-stable-20261031, based on verified GUI fail-closed branch 6368936de3991780c8b0ba807d0562ace55a0333.

## Executive decision

Transfer **all critical chat and core execution authority** from Jan-derived routes to Lu. Retain properly attributed Jan-derived presentation/UI primitives where useful. Jan legacy ModelFactory/Cowork/MCP orchestration, plugin runtime and provider-specific tool paths must not own any Lu turn. Maintain Apache-2.0 and NOTICE provenance.

Core ownership:
- Lu-native chat transport and per-conversation session state, persistence, cancellation and recovery;
- Host-owned model runtime / backend manager and conversation-bound native Protobuf tool dispatch;
- Memory/ANSF, policy, authorization, effect journal and diagnostics;
- Future DLC CE/Workshop worker supervisor and shared common AF_UNIX transport.

This branch begins LCX-01 by adding a **new independent LuChatTransport**. Unlike the current Jan-derived CustomChatTransport, it contains no Jan provider factory, Cowork, MCP service or native-tool executor. It calls Lu's already-tested host-owned native inference API, rejects cross-conversation transport reuse and non-native sessions, passes cancellation to the host, and forbids implicit reconnection. The original Jan transport stays intact.

**Not yet done:** LCX-02 native useLuChat and LuChatSessionStore; LCX-03 switching the real Lu thread route to the new hook; LCX-04 eliminating the Jan graph from the compiled Lu distribution and final IPC/capability integration; LCX-05 installed Windows GUI acceptance. The new transport is not yet mounted in Lu Main, so this milestone remains experimental.

## New candidate's promotion criteria

1. Windows native-only NSIS package is installed and contains zero Jan worker/Bun/UV; all actual model/tool turns complete and durable journal reports are internally consistent.
2. The exact user-facing Lu chat route creates only Lu-owned transport/session state and calls no Jan runtime ModelFactory or MCP/Cowork dispatch.
3. Native tool discovery never grants authority; exact saved user turn, permission and effect journal verified by host; cancellations and recovery tested after process death.
4. Local chat/history/ANSF data preserved through restart, migration, reinstall, and rollback.
5. Linux/Windows shared AF_UNIX IPC passes authenticated profile isolation, OS endpoint security and worker cleanup before any release enabling.
6. User-verified production installer and explicit Guardian/release approval before merge/tag/upgrade; a passing source test is never an automatic self-merge.

The separate AF_UNIX branch remains isolated: lu/ipc-common-af-unix-20261031, initial source commit 81dfa358b3f79922c59516745c8f8175fe1ce5bd. Native Linux and Windows headless tests passed in workflow 41239862112, but host security and Cognitum integration are NOT accepted.

## Immediate blocker in previous native-only installed package

Workflow 41235830176 compiled and installed Lu without Jan worker/Bun/UV, and passed startup plus profile-isolation A/B/A. The genuine GGUF native tool test failed an incomplete model/tool/final durable journal assertion (6 observed vs 7 expected). Its smoke receipt verifier file was missing. This is a **failed alpha gate**, and this milestone does not erase it by renaming the candidate stable.

GitHub is a source/evidence archive, not the development hub; compile/test locally first whenever sources/toolchains are available. Never edit the user's installed Lu Stable during development.
