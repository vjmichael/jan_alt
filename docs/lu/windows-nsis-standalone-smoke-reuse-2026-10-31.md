# Reusing the pinned Windows NSIS for independent installed-product acceptance

Created 2026-10-31. This is a **Windows verification-only** workflow, not Lu's development environment.

The full installer build on https://github.com/vjmichael/jan_alt/actions/runs/41227420821 may be expensive and its tiny Qwen real-tool requirement can fail independently of installer correctness. This workflow downloads that exact run's already-built installer artifact and checks the immutable build manifest and SHA-256 before performing a second **separate** temporary Windows installation and removal.

The PowerShell smoke exercises Windows PE x86-64 identity, native Lu engine package and SHA-256, attribution licenses, Jan-profile/registry isolation, actual Lu GUI/legacy worker startup, and A/B/A profile restart. Its installed audit receipt must say `blocked_legacy_worker` and `alphaAccepted:false`: a compatibility smoke can never count as Cowork-free alpha. This workflow intentionally does **not** exercise the real model-generated native tool; that result comes from the original full run and remains separately gated.

The exact runner and source are pinned; edits to the original installer or to the smoke script must be reviewed before retesting. The installer artifact may not exist until the original build has uploaded it. No user installation is touched.
