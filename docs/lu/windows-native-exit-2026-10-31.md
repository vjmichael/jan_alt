# Windows Lu-native engine exit handoff — October 31, 2026

The Lu-owned persistent `llama-server.exe` is supervised separately from the
inherited Jan llama.cpp plugin. Before this change, desktop `RunEvent::Exit`
only ran the Jan cleanup, and the `confirm_exit` command called
`process::exit` without reaching that event. A loaded Lu-native child could
therefore remain after a normal desktop close.

The Windows alpha branch now asks `LuInferenceDesktopState` to cancel active
native turns, signal a running generation, wait up to five seconds for it to
stop, and unload the supervised session. Both normal `RunEvent::Exit` and the
direct `confirm_exit` path call this cleanup. Errors are logged as fixed
categories, without model text or file paths. The implementation was adapted
from the separately compiled L16 Linux preview source; its report observed
normal GUI close terminating the desktop and engine child.

**Verification:** source diff and `git diff --check` passed locally. This
workspace has no working Windows compiler or WebView2 desktop. The supplied
Rust tarball could not be made into a usable local formatter/toolchain here,
so this branch's Rust format, Windows compile, and process behavior remain
unverified. Linux L16 execution does not certify Windows behavior.

**Next gate:** on a disposable Windows runner, launch a release-equivalent
Lu desktop with a pinned GGUF, load it, record the Lu-owned engine PID, close
the window and separately exercise `confirm_exit`; require both child PIDs to
exit within a bounded interval. Then repeat while generation is active and
check cancellation, task journal and profile isolation. Abrupt process kill
still requires Windows Job Object containment; this normal-close change does
not claim SIGKILL/TerminateProcess cleanup.

## Restart recovery correction

The same source baseline called `create_dir` for `lu-native-runtime` on every
startup. A valid second process therefore got `AlreadyExists` and disabled
native recovery. The L16 correction now permits an existing ordinary runtime
directory after validating its canonical parent, then acquires the exclusive
owner lock and reconciles the task/effect journals. Existing symlinks and
parallel owners still fail closed. The cross-platform regression starts once,
rejects a second simultaneous owner, drops the first owner and reopens the
same directory. A Unix regression denies a redirected symlink.

The L16 Linux preview ran these host tests and completed a real GUI chat after
restart. This Windows branch still requires its own compile, unit tests and
full process restart run; source parity alone is not Windows acceptance.

## Windows verification gate prepared

The native assistant cold-restart workflow now runs the recovery unit test on
Windows, then starts an extra disposable WebView2 process. It loads the pinned
Qwen GGUF, records the Lu-owned engine PID, invokes `confirm_exit`, and requires
both the desktop and recorded engine PID to disappear. The existing process A
then reuses that same profile, so its startup exercises the preexisting runtime
directory. Process B remains the separate-process saved-assistant readback
gate. The new exit phase does not depend on the model producing a correct
assistant reply; W01 reply quality and tool dispatch remain separate.

The workflow must execute on the exact Windows branch head before any of these
new assertions can be marked passed. It does not yet test the normal window
close path during active generation or abrupt process termination.
