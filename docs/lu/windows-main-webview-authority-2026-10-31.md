# Windows Lu main WebView native-authority boundary

Date: 2026-10-31.
Baseline: e1b1a860e65ecf8089f244dc419859dccd4eabf0; separate from the running NSIS compatibility gate 41227420821.

## Problem

Lu's `lu-default.json` still included remote origins matching `http://*`, inherited `agent-tools:*` permissions, `llamacpp:default` and shell spawn/open/execute authority. Lu's chat alpha already uses its own host-authorized native model/tool commands. Merely removing a Cowork UI tab cannot prove the old IPC privilege surface is inaccessible.

## Source change

- Remove remote-origin access to Lu's privileged main-window capability.
- Remove all inherited `agent-tools:` commands and `llamacpp:default` from main-window permissions.
- Remove `shell:` spawn/open/execute permissions from the main-window capability. Existing `opener` and other permission entries are not altered.
- Add standalone Node capability regression (nine tests, local pass) and a source checker that fails on forbidden permissions. It is a **source guard**, not live Windows authorization proof.

## Acceptance still needed

Before merging, run the Lu Windows desktop build and native-GGUF chat acceptance, verify legitimate Lu-native tool IPC is unaffected, probe attempted inherited agent/Cowork commands and remote-origin invocation, and verify all auxiliary windows and plugins have separate restricted permissions. No claim that the bundled legacy Jan worker has been removed. Do not disturb the already-running installed NSIS compatibility test. Preserve upstream Apache-2.0 notices in modified derived files.

This branch is deliberately NOT yet the alpha/release branch. GitHub remains a repository and acceptance archive.
