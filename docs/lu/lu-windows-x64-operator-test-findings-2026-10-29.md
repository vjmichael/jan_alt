# Lu Windows x86-64 — consolidated operator validation findings

**Test date:** 2026-10-29 (local, America/Phoenix)  
**Record type:** Operator-observed acceptance evidence, engineering bugs, and test disposition  
**Scope:** Lu Windows x64 development-preview installer, model importer, native llama.cpp worker, Vulkan GPU detection, and Windows 11 VM limitations  
**Status:** Physical Windows GPU-assisted chat inference **passed**; clean VirtualBox CPU-only worker **failed**; VirtualBox GPU/VM test campaign **deferred** by user decision. No alpha/release-wide acceptance is implied.

> This report consolidates observations from a Lu user testing session. The screenshots were shown in the conversation, but are **not committed** to this public repository. Evidence is described below; independent artifacts and exact-commit CI proofs remain distinct.

## 1. Build identity and environments

### Installer supplied for the operator test

| Field | Value / evidence |
|---|---|
| Application | Lu 0.8.5 development preview |
| Installer | `Lu_0.8.5_x64-setup.exe`, NSIS Windows x86-64, Vulkan-enabled build |
| Windows artifact | [GitHub Actions run 40542686980](https://github.com/vjmichael/jan_alt/actions/runs/40542686980), artifact `Lu-Windows-x64-Vulkan-Development-Installer` (12752628750) |
| Artifact commit | `d6edb050d797e0d492223db6da8f335dd7c37ce1` |
| Installer SHA-256 | `eedce2f39a8ad3490261ad1b3a1e5479fc1488f164c249930b7cd37d56b40c92` (verified against build manifest at delivery) |
| Bundled provider displayed in VM | llama.cpp integration v0.5.0, engine build `b11146`, commit `7fe450e1` |
| Source provenance | Jan-derived sources retained, subject to Apache-2.0 preservation; `jan-llama-worker` is an inherited binary name, **not** proof that the old Cowork path handled this request |

The supplied installer is an **earlier snapshot** than subsequently developed AX/DX branches and draft fixes. None of the draft changes below are presumed installed in the tested build.

### Environment A — disposable Windows 11 Enterprise VM

- Hypervisor: Oracle VirtualBox on a Windows physical host.
- Guest: Windows 11 Enterprise, x86-64; fresh VM operating environment.
- Hardware reported: AMD Ryzen 5 5500; 4 virtual CPU cores; 8.71 GB RAM; roughly 4.50 GB RAM free during one measurement; 80 GB virtual storage; AVX2 present.
- No dedicated VRAM/usable guest GPU was detected; GPU probing in Lu returned an error.
- The user successfully installed and launched Lu, completed enough onboarding to open Settings, and imported an official GGUF.

### Environment B — physical Windows PC

- Lu was installed again and first-run onboarding was observed.
- Lu detected an **AMD Radeon AI PRO R9700, 32 GB VRAM**, with **Vulkan** selected.
- The system downloaded/began downloading its embedding model during onboarding; the screenshots do not independently prove successful embedding inference.
- A Qwen 3.8 27B model was available in the model picker, subsequently loaded and generated a complete response.
- Important clean-state distinction: a **fresh app install is not a clean Windows OS image**. Prior application data/model inventory and system-level VC++/Vulkan prerequisites may persist. The exact application binary hash on the physical PC was not independently checked against the supplied artifact.

## 2. Observed acceptance results

| Gate | VirtualBox Win11 VM | Physical Windows host | Notes |
|---|---|---|---|
| Installer completed and desktop started | **PASS (observed)** | **PASS (observed)** | Actual Lu UI rendered |
| First-run onboarding rendered | **PASS** | **PASS** | Physical onboarding reached engine/embedding step |
| CPU / RAM inventory | **PASS** | Not separately evidenced here | VM accurately displayed reported hardware |
| GPU detection | **FAIL / no usable GPU** | **PASS** | VM lacked usable GPU; physical Radeon R9700 enumerated via Vulkan |
| GGUF file import/registration | **PASS** | Model available; fresh import not established | VM Qwen2.5 import succeeded |
| Inference worker initial handshake | **FAIL** | **PASS, indirectly demonstrated by generation** | VM `0xC0000135`; physical model generated |
| Model loads and generates text | **BLOCKED/FAIL** | **PASS** | Physical Qwen 3.8 27B generated a complete answer |
| Response visible in desktop conversation | Not achieved | **PASS** | One completed physical-host reply |
| Second prompt in same conversation | Not tested | **NOT VERIFIED** | Proposed follow-up, no supplied completion proof |
| Close/reopen conversation persistence | Not tested | **NOT VERIFIED** | Not inferred from conversation list alone |
| Native Protobuf tool-call loop and security | Not tested | **NOT VERIFIED** | Plain text generation is not native tool acceptance |
| Updated DX UI and AX/Cowork extraction | Not tested | **NOT VERIFIED** | These changes are in separate later development branches |

### Physical-host generation evidence

The operator submitted a new chat prompt, `What is your experience like with exploring the internet?`. Screenshots showed model-load progress (16%), streaming reasoning/answer display, and a completed response. Lu's completed-message UI reported **504 tokens at approximately 28 tokens/second**. An earlier physical-host example reported **101 tokens at approximately 29 tokens/second**. These figures are **Lu UI-reported values**, not separately benchmarked throughput. The screenshots demonstrate one completed prompt after a fresh app installation; neither actual web-tool invocation nor a second persisted turn was shown.

## 3. LU-UI-001: multiple concurrent native file-open dialogs

**Operator repro:** In Settings → Llama.cpp → Import, repeatedly click **Select GGUF File** and/or **Change** before dismissing an existing Windows file picker. Multiple independent Windows **Open** dialogs appear. One screenshot showed many Open taskbar previews. `multiple: false` only prevents selecting more than one file in *one* dialog and does not serialize dialog launches.

**Outcome:** Operator was eventually able to import `qwen2.5-0.5b-instruct-q2_k.gguf`, with Lu displaying an import-success toast and model entry.

**Engineering action:** [Draft PR #74 — LU-UI-001 single native GGUF picker](https://github.com/vjmichael/jan_alt/pull/74). The isolated source fix adds a synchronous in-flight guard shared by main GGUF, MMPROJ and draft-model pickers, disables conflicting controls, releases the lock on selection/cancel/failure, and adds four frontend regression tests.

**Status:** Source/tests/documentation committed in draft; **not** verified by actual patched Windows installer and **not** contained in the operator's 0.8.5 installation. Preserve as open until exact-head automated tests and a Windows retest pass.

Detailed repro/acceptance record: `docs/lu/lu-ui-001-single-model-file-picker-windows-vm-2026-10-29.md` on PR #74's branch.

## 4. LU-ENG-001: clean VM worker fails before inference

**VM observation:** Settings → Hardware reported `Couldn't read GPU devices`, with detail `Failed to load llamacpp backend`; onboarding proposed **Will run on CPU**. Following successful import, **Start** and chat requests failed:

```text
Generation failed
Failed to create model: Failed to start model: jan-llama-worker
did not come up: exited before serving (exit code 0xC0000135)
```

**Windows meaning:** `0xC0000135` is `STATUS_DLL_NOT_FOUND`: the worker process could not resolve a required DLL or transitive dependency during startup. The exact missing library is **not identified**. Neither a defective model file, insufficient RAM, a generic CPU incompatibility, nor missing GPU support is proven to be the cause.

**Important discrepancy:** The same Lu development-preview generation performed inference on the physical Windows GPU host. This indicates a **host-environment-dependent startup condition**, not general inability of Lu to generate text.

**Packaging/CI analysis:**

1. The original [`d6edb050` preview installer workflow](https://github.com/vjmichael/jan_alt/actions/runs/40542686980) checked for the worker executable and staged DLLs and ran an NSIS installation/uninstallation smoke. File presence and PE architecture checks did **not** start the installed worker.
2. The later `lu/windows-x64-preview-build` branch added a real installed worker startup/handshake probe, but its test inherited the Windows CI image's toolchain `PATH`; LLVM/Vulkan tooling or other build dependencies on the runner could mask missing packaged dependencies.
3. The llama.cpp build script had a documented prior missing `libomp.dll` pitfall and a `GGML_OPENMP=OFF` precaution; that historical issue does **not** establish the actual missing library in this VM.
4. PR [#77 — Windows clean-runtime worker probe](https://github.com/vjmichael/jan_alt/pull/77) now proposes a constrained runtime `PATH`, removal of inherited GGML/Vulkan/CUDA path overrides, and explicit early-exit reporting. It does **not** yet fix a specific DLL or prove CPU inference.

**Status:** Open engineering issue; root cause remains unresolved. Continue examining PE import dependencies and Windows loader diagnostics from a disposable environment; never replace system DLLs with untrusted downloads.

Detailed failure and gated remediation record: `docs/lu/lu-eng-001-win11-cpu-only-missing-dll-2026-10-29.md` on PR #77's branch.

## 5. Decision: VirtualBox Lu VM testing deferred

**User decision (2026-10-29):** Defer the current Lu VirtualBox VM test campaign and **do not** require a hypervisor migration, GPU passthrough software, or additional guest testing in order to proceed with Lu development.

**Rationale:** Windows-hosted VirtualBox does not provide the requested dedicated GPU PCI passthrough pathway for realistic Lu Vulkan inference testing. Oracle's older VirtualBox 6.0 PCI passthrough documentation concerned experimental Linux-host functionality; current VirtualBox documentation describes PCI passthrough as unavailable. This is an environment capability limitation, not a finding that Lu requires dedicated GPUs for all operation.

Useful reference: [Oracle VirtualBox PCI passthrough (6.0)](https://docs.oracle.com/en/virtualization/virtualbox/6.0/admin/pcipassthrough.html) and [Oracle VirtualBox 7.2 documentation](https://docs.oracle.com/en/virtualization/virtualbox/7.2/user/vboxmanage.html).

**Do not lose the separate CPU-only failure:** The absence of a GPU is **not a sufficient explanation** for `STATUS_DLL_NOT_FOUND`. Lu's CPU fallback/clean-Windows runtime dependency acceptance remains an engineering requirement, but further manual VM tests are **deferred**, not passed or waived as product requirements.

## 6. Engineering follow-up gates and owners

| Priority | Gate | Responsibility / disposition |
|---|---|---|
| P0 | Preserve physical Windows fresh-app install + Vulkan inference proof | Documented above; passed to observed scope only |
| P0 | Identify specific DLL/transitive dependency causing `0xC0000135` | Windows packaging/runtime investigation; **open** |
| P0 | Run packaged worker on a clean/sanitized runtime path and check handshake | PR #77, Windows Actions; **pending exact-head CI** |
| P1 | Build an installation with correct CPU-capable dependencies; validate CPU-only GGUF generation | **Open**, defer operator VM retest until suitable environment exists |
| P1 | Integrate single-picker fix and run real Windows double-click test | PR #74; **pending tests and new build** |
| P1 | Second same-chat text turn and app relaunch/persistence on physical Windows | **Pending operator evidence** |
| P1 | Validate native tool call → Lu dispatch → model continuation → persisted conversation | Separate Lu acceptance track; **not certified here** |
| P1 | DX end-to-end real Windows trace/fault localization, cancellation and restart safety | Separate DX track; **not certified here** |
| Deferred | VirtualBox GPU passthrough / alternative VM environment | **User-deferred**; no dependency on Lu's active engineering progress |

## 7. Provenance and change isolation

- This report describes *operator-observed* facts; it is not a replacement for a CI artifact, executable hash comparison, PE dependency audit, or signed release acceptance.
- The report is documentation-only: **no** model, installed user profile, protected `main`, AX/Cowork extraction, DX diagnostics, Cognitum, or release installer is modified by this record.
- Related code changes remain isolated in draft [PR #74](https://github.com/vjmichael/jan_alt/pull/74) and [PR #77](https://github.com/vjmichael/jan_alt/pull/77). Neither should be described as merged, shipped, or Windows-validated solely because it is referenced here.
- Preserve inherited Jan Apache-2.0 notices and source origin labels when carrying fixes into future Lu builds.
- The operator's screenshots and local device/user profile identifiers should not be uploaded into a public repo without a separate deliberate review.

**Release/testing decision:** Proceed with Lu's other engineering gates on physical Windows and constrained CI. Keep CPU-only installation compatibility in the backlog as a real quality gate; do not block general Lu development on VirtualBox GPU testing.
