// JAN-UPSTREAM-PROVENANCE: Derived from Jan (https://github.com/janhq/jan).
// Jan project notice: Copyright 2025 Menlo Research; upstream portions Apache-2.0.
// LU MODIFICATION NOTICE: Lu contributors have modified this Jan-derived file. Preserve upstream notices.
// See docs/lu/jan-origin-provenance.md. This notice does not license unrelated Lu-only code.
//! The built-in agent toolset, shared by the Jan desktop app and the headless
//! `jan` CLI.
//!
//! The toolset is Tauri-free: executing a tool needs nothing but
//! `(&BuiltinTool, &serde_json::Value, &ToolContext)`, never an `AppHandle`.
//! `tauri` is an optional dependency behind the `tauri` feature, so the CLI
//! builds this crate with `default-features = false` and links no GUI crates.
//! Everything under `permissions`, `skills`, `tools` and `workspace` is
//! available in both configurations; only `init()` and the IPC shims in
//! `commands` are gated.

pub mod memory;
pub mod permissions;
pub mod preview;
pub mod skills;
pub mod tools;
pub mod workspace;

// Migration-only bridge; dormant until a caller opts into the feature.
#[cfg(feature = "lu-bridge")]
pub mod lu_bridge;

#[cfg(feature = "tauri")]
mod commands;

/// Webview-backed `screenshot` renderer, so the tool works without Chrome, on
/// all three desktop platforms; other targets keep the Chrome path.
#[cfg(all(
    feature = "tauri",
    any(target_os = "linux", target_os = "macos", target_os = "windows")
))]
mod webview_shot;

/// Runs the confined-spawn helper and exits, when this process was re-exec'd as
/// one by the Windows sandbox backend. A no-op on every other platform and on a
/// normal launch, but it must be called before anything else in `main`: the
/// helper's whole job is to spawn and wait, so starting the app first would run a
/// second copy of it per shell command.
pub use tools::appcontainer::run_helper_if_requested as run_sandbox_helper_if_requested;
#[cfg(feature = "lu-bridge")]
pub use tools::ce_worker::run_ce_worker_if_requested;

#[cfg(feature = "tauri")]
pub use commands::{AgentToolsError, ToolResult};

#[cfg(feature = "tauri")]
macro_rules! agent_tools_handler {
    ($($jan_only:path),* $(,)?) => {
        tauri::generate_handler![
            commands::workspace_path,
            commands::thread_workspace_path,
            commands::thread_workspace_delete,
            commands::thread_workspace_sweep,
            commands::skill_list,
            commands::skill_read,
            commands::skill_write,
            commands::skill_delete,
            commands::skill_invoke,
            commands::memory_list,
            commands::memory_read,
            commands::memory_write,
            commands::memory_catalog,
            commands::memory_delete,
            commands::tool_schemas,
            commands::sandbox_status,
            commands::attachment_import,
            commands::cancel_thread_bash,
            $($jan_only,)*
        ]
    };
}

/// Initializes the agent tools plugin. Lu's Protobuf tool dispatcher does not
/// register legacy Cowork execution, session, monitor, subagent, blackboard, or
/// preview IPC. Jan retains these commands in its desktop plugin.
#[cfg(feature = "tauri")]
pub fn init<R: tauri::Runtime>() -> tauri::plugin::TauriPlugin<R> {
    let builder = tauri::plugin::Builder::new("agent-tools");
    #[cfg(feature = "lu-distribution")]
    let builder = builder.invoke_handler(agent_tools_handler![]);
    #[cfg(not(feature = "lu-distribution"))]
    let builder = builder.invoke_handler(agent_tools_handler![
        commands::execute_tool,
        commands::execute_tool_streaming,
        commands::session_workspace_path,
        commands::session_workspace_delete,
        commands::session_workspace_sweep,
        commands::subagent_result_reserve,
        commands::subagent_result_fill,
        commands::blackboard_write,
        commands::start_monitor,
        commands::stop_monitor,
        commands::list_monitors,
        commands::session_monitor_ids,
        commands::stop_session_monitors,
        commands::preview_register_root,
        commands::preview_unregister_root,
    ]);
    #[cfg(not(feature = "lu-distribution"))]
    let builder = builder
        .setup(|app, _api| {
            use tauri::Manager;
            app.manage(preview::PreviewRoots::default());
            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("preview", |ctx, request, responder| {
            let app = ctx.app_handle().clone();
            // Off the webview thread: canonicalize and read touch the disk.
            std::thread::spawn(move || {
                responder.respond(commands::preview_response(&app, request.uri().path()));
            });
        });
    builder.build()
}

#[cfg(test)]
mod permission_tests {
    /// A command reaches the frontend only if it is BOTH in `generate_handler!`
    /// and in `build.rs`'s `COMMANDS` (which generates its permission). Missing
    /// the latter compiles and tests clean, then fails at runtime with
    /// "not allowed. Command not found" -- invisible to any suite that mocks
    /// `invoke`. Keep the two lists in lockstep.
    fn names_between<'a>(src: &'a str, start: &str, end: &str) -> Vec<&'a str> {
        let Some(rest) = src.split_once(start).map(|(_, r)| r) else {
            return Vec::new();
        };
        let Some(block) = rest.split_once(end).map(|(b, _)| b) else {
            return Vec::new();
        };
        block
            .split(',')
            .map(|s| s.trim().trim_matches('"'))
            .filter(|s| !s.is_empty())
            .map(|s| s.rsplit("::").next().unwrap_or(s))
            .collect()
    }

    #[test]
    fn every_registered_command_has_a_permission() {
        let mut handlers = names_between(include_str!("lib.rs"), "tauri::generate_handler![", "]");
        handlers.retain(|name| !name.contains('$') && !name.contains('*'));
        handlers.extend([
            "execute_tool",
            "execute_tool_streaming",
            "session_workspace_path",
            "session_workspace_delete",
            "session_workspace_sweep",
            "subagent_result_reserve",
            "subagent_result_fill",
            "blackboard_write",
            "start_monitor",
            "stop_monitor",
            "list_monitors",
            "session_monitor_ids",
            "stop_session_monitors",
            "preview_register_root",
            "preview_unregister_root",
        ]);
        let declared = names_between(include_str!("../build.rs"), "COMMANDS: &[&str] = &[", "];");
        assert!(!handlers.is_empty(), "failed to parse generate_handler!");
        assert!(!declared.is_empty(), "failed to parse build.rs COMMANDS");
        let missing: Vec<_> = handlers.iter().filter(|c| !declared.contains(c)).collect();
        assert!(
            missing.is_empty(),
            "commands registered but absent from build.rs COMMANDS: {missing:?}"
        );
    }

    #[test]
    fn every_permission_is_in_the_default_set() {
        let declared = names_between(include_str!("../build.rs"), "COMMANDS: &[&str] = &[", "];");
        let default_toml = include_str!("../permissions/default.toml");
        let missing: Vec<_> = declared
            .iter()
            .filter(|c| {
                let permission = format!("allow-{}", c.replace('_', "-"));
                !default_toml.contains(&permission)
            })
            .collect();
        assert!(
            missing.is_empty(),
            "commands missing an allow-* entry in permissions/default.toml: {missing:?}"
        );
    }
}
