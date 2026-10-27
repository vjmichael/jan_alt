use std::{
    fs,
    path::{Path, PathBuf},
};
#[cfg(not(feature = "cli"))]
use tauri::{AppHandle, Runtime, State};

use super::constants::{CONFIGURATION_FILE_NAME, TAURI_BUNDLE_IDENTIFIER};
#[cfg(not(feature = "cli"))]
use super::helpers::copy_dir_recursive;
use super::models::AppConfiguration;
use super::paths;
use super::profile;
#[cfg(not(feature = "cli"))]
use crate::core::state::AppState;

#[cfg(feature = "lu-distribution")]
const DATA_FOLDER_ENV: &str = "LU_DATA_FOLDER";
#[cfg(not(feature = "lu-distribution"))]
const DATA_FOLDER_ENV: &str = "JAN_DATA_FOLDER";

/// Keep the development Lu distribution separate from official Jan.
pub(super) fn app_support_name() -> &'static str {
    #[cfg(feature = "lu-distribution")]
    {
        "Lu"
    }
    #[cfg(not(feature = "lu-distribution"))]
    {
        env!("CARGO_PKG_NAME")
    }
}

fn profile_dir_in(root: PathBuf) -> PathBuf {
    profile::profile_dir_in(root, app_support_name())
}

/// Reject a relative Lu data path or one that points back into Jan's profile.
/// Existing paths are canonicalized so Windows junctions and casing differences
/// cannot silently turn a Lu setting into Jan access.
fn is_forbidden_lu_data_path(candidate: &Path) -> bool {
    #[cfg(feature = "lu-distribution")]
    {
        let jan_roots: Vec<PathBuf> = [paths::data_dir(), dirs::data_dir()]
            .into_iter()
            .flatten()
            .collect();
        profile::is_forbidden_lu_data_path(candidate, &jan_roots)
    }
    #[cfg(not(feature = "lu-distribution"))]
    {
        let _ = candidate;
        false
    }
}

/// Canonical profile directory, %APPDATA%/Jan or %APPDATA%/Lu on Windows.
fn resolve_human_readable_app_data_dir() -> Option<PathBuf> {
    paths::data_dir().map(profile_dir_in)
}

/// Tauri bundle-id app support directory (e.g. `%APPDATA%/jan.ai.app` on Windows).
fn resolve_bundle_app_data_dir() -> Option<PathBuf> {
    paths::data_dir().map(|d| d.join(TAURI_BUNDLE_IDENTIFIER))
}

/// Keep this distribution's settings file canonical. Only Jan recovers from
/// legacy or alternate locations (#7898); Lu never imports Jan's settings.
fn migrate_legacy_app_configuration(app_data_dir: &Path) -> std::io::Result<()> {
    fs::create_dir_all(app_data_dir)?;
    #[cfg(feature = "lu-distribution")]
    {
        // Never touch an official Jan settings file from the Lu preview.
        Ok(())
    }
    #[cfg(not(feature = "lu-distribution"))]
    {
        let canonical = app_data_dir.join(CONFIGURATION_FILE_NAME);
        if canonical.exists() {
            return Ok(());
        }
        migrate_from_candidates(&canonical, legacy_app_config_candidate_paths(app_data_dir))
    }
}

fn migrate_from_candidates(canonical: &Path, candidates: Vec<PathBuf>) -> std::io::Result<()> {
    if let Some(parent) = canonical.parent() {
        fs::create_dir_all(parent)?;
    }

    for legacy in candidates {
        if legacy.is_file() {
            log::info!(
                "Recovering app configuration from {} to {}",
                legacy.display(),
                canonical.display()
            );
            fs::copy(&legacy, canonical)?;
            // Remove the stale copy in the bundle-id folder so the canonical
            // product-name location is the single source of truth (#7898).
            if let Err(err) = fs::remove_file(&legacy) {
                log::warn!("Failed to remove legacy config {}: {err}", legacy.display());
            }
            return Ok(());
        }
    }
    Ok(())
}

fn legacy_app_config_candidate_paths(_app_data_dir: &Path) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Some(bundle_dir) = resolve_bundle_app_data_dir() {
        paths.push(bundle_dir.join(CONFIGURATION_FILE_NAME));
    }

    #[cfg(target_os = "linux")]
    {
        let package_name = app_support_name();
        if let Some(config_dir) = dirs::config_dir() {
            let legacy = config_dir.join(package_name).join(CONFIGURATION_FILE_NAME);
            if legacy != _app_data_dir.join(CONFIGURATION_FILE_NAME) {
                paths.push(legacy);
            }
        }
    }

    paths
}

#[cfg(not(feature = "cli"))]
fn app_data_dir_with_fallback<R: Runtime>(app_handle: &tauri::AppHandle<R>) -> PathBuf {
    profile_dir_in(paths::data_dir_for(app_handle).unwrap_or_else(|err| {
        log::error!("Failed to get data directory: {err}. Using home directory instead.");

        let home_dir = std::env::var(if cfg!(target_os = "windows") {
            "USERPROFILE"
        } else {
            "HOME"
        })
        .expect("Failed to determine the home directory");

        PathBuf::from(home_dir)
    }))
}

/// Resolve the Jan config file path without an AppHandle (for CLI use).
/// Canonical location is this distribution's settings file, with Jan-only
/// fallback recovery from its bundle-id location when needed.
pub fn resolve_config_file_path() -> PathBuf {
    let app_data = resolve_human_readable_app_data_dir().unwrap_or_else(|| {
        let home = std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_default();
        profile_dir_in(PathBuf::from(home))
    });

    if let Err(err) = migrate_legacy_app_configuration(&app_data) {
        log::warn!("Legacy app config migration (CLI) skipped: {err}");
    }

    app_data.join(CONFIGURATION_FILE_NAME)
}

/// Run `f` with this distribution's data-folder override pointed at a temp directory, restoring
/// the previous value afterwards. Serialized on `SECRET_STORE_TEST_LOCK`, the
/// one lock every `JAN_DATA_FOLDER` mutator takes: the env is process-wide and
/// Rust runs tests on threads, so a private lock here would exclude only the
/// other callers of this helper while the secret-store tests redirected the
/// folder (and dropped its temp dir) underneath a run already in progress.
#[cfg(all(test, feature = "cli"))]
pub(crate) fn with_temp_data_folder<T>(f: impl FnOnce(&std::path::Path) -> T) -> T {
    let _guard = crate::core::server::provider_secrets::SECRET_STORE_TEST_LOCK
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    let dir = tempfile::tempdir().expect("tempdir");
    let prev = std::env::var_os(DATA_FOLDER_ENV);
    std::env::set_var(DATA_FOLDER_ENV, dir.path());
    let result = f(dir.path());
    match prev {
        Some(p) => std::env::set_var(DATA_FOLDER_ENV, p),
        None => std::env::remove_var(DATA_FOLDER_ENV),
    }
    result
}

/// Resolve the Jan data folder path without an AppHandle (for CLI use).
/// Reads AppConfiguration from the config file; falls back to the default location.
pub fn resolve_jan_data_folder() -> PathBuf {
    // This distribution's explicit override wins on every platform. `dirs::data_dir()` reads
    // XDG_DATA_HOME only on Linux, so tests/headless consumers need a portable
    // way to redirect the data folder without relying on OS-specific env.
    if let Ok(folder) = std::env::var(DATA_FOLDER_ENV) {
        if !folder.is_empty() {
            let folder = PathBuf::from(folder);
            if !is_forbidden_lu_data_path(&folder) {
                return folder;
            }
            log::warn!("Ignoring unsafe Lu data-folder override");
        }
    }

    let config_file = resolve_config_file_path();

    if config_file.exists() {
        if let Ok(content) = fs::read_to_string(&config_file) {
            if let Ok(config) = serde_json::from_str::<AppConfiguration>(&content) {
                let folder = PathBuf::from(config.data_folder);
                if !is_forbidden_lu_data_path(&folder) {
                    return folder;
                }
                log::warn!("Ignoring unsafe Lu data-folder configuration");
            }
        }
    }

    // Default: data_dir/<distribution>/data (mirrors default_data_folder_path)
    let app_name = if cfg!(feature = "lu-distribution") {
        "Lu".to_string()
    } else {
        std::env::var("APP_NAME").unwrap_or_else(|_| "Jan".to_string())
    };
    if let Some(data_dir) = paths::data_dir() {
        return data_dir.join(&app_name).join("data");
    }
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    PathBuf::from(home).join(&app_name).join("data")
}

#[cfg(not(feature = "cli"))]
#[tauri::command]
pub fn get_app_configurations<R: Runtime>(app_handle: tauri::AppHandle<R>) -> AppConfiguration {
    let mut app_default_configuration = AppConfiguration::default();

    if std::env::var("CI").unwrap_or_default() == "e2e" {
        return app_default_configuration;
    }

    let app_path = app_data_dir_with_fallback(&app_handle);
    if let Err(err) = migrate_legacy_app_configuration(&app_path) {
        log::warn!("Legacy app config migration skipped: {err}");
    }

    let configuration_file = app_path.join(CONFIGURATION_FILE_NAME);

    let default_data_folder = default_data_folder_path(app_handle.clone());

    if !configuration_file.exists() {
        log::info!("App config not found, creating default config at {configuration_file:?}");

        app_default_configuration.data_folder = default_data_folder;

        if let Err(err) = fs::write(
            &configuration_file,
            serde_json::to_string(&app_default_configuration).unwrap(),
        ) {
            log::error!("Failed to create default config: {err}");
        }

        return app_default_configuration;
    }

    match fs::read_to_string(&configuration_file) {
        Ok(content) => {
            match serde_json::from_str::<AppConfiguration>(&content) {
                Ok(app_configurations) => {
                    if is_forbidden_lu_data_path(Path::new(&app_configurations.data_folder)) {
                        log::error!("Lu configuration has an unsafe data folder; using Lu's default data folder");
                        app_default_configuration.data_folder = default_data_folder;
                        app_default_configuration
                    } else {
                        app_configurations
                    }
                }
                Err(err) => {
                    log::error!("Failed to parse app config, returning default config instead. Error: {err}");
                    // Use the proper default data folder path, not the relative "./data"
                    app_default_configuration.data_folder = default_data_folder;
                    app_default_configuration
                }
            }
        }
        Err(err) => {
            log::error!(
                "Failed to read app config, returning default config instead. Error: {err}"
            );
            // Use the proper default data folder path, not the relative "./data"
            app_default_configuration.data_folder = default_data_folder;
            app_default_configuration
        }
    }
}

#[cfg(not(feature = "cli"))]
#[tauri::command]
pub fn update_app_configuration<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
    configuration: AppConfiguration,
) -> Result<(), String> {
    if is_forbidden_lu_data_path(Path::new(&configuration.data_folder)) {
        return Err("Lu requires an absolute data folder outside Jan's profile".to_string());
    }
    let configuration_file = get_configuration_file_path(app_handle);
    log::info!("update_app_configuration, configuration_file: {configuration_file:?}");

    fs::write(
        configuration_file,
        serde_json::to_string(&configuration).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

#[cfg(not(feature = "cli"))]
#[tauri::command]
pub fn get_jan_data_folder_path<R: Runtime>(app_handle: tauri::AppHandle<R>) -> PathBuf {
    if cfg!(test) {
        use std::cell::RefCell;
        thread_local! {
            static TEST_DATA_DIR: RefCell<Option<PathBuf>> = const { RefCell::new(None) };
        }

        return TEST_DATA_DIR.with(|dir| {
            let mut dir = dir.borrow_mut();
            if dir.is_none() {
                let unique_id = std::thread::current().id();
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_nanos())
                    .unwrap_or(0);
                let path = std::env::current_dir()
                    .unwrap_or_else(|_| PathBuf::from("."))
                    .join(format!("test-data-{unique_id:?}-{timestamp}"));
                let _ = fs::create_dir_all(&path);
                *dir = Some(path);
            }
            dir.clone().unwrap()
        });
    }

    let app_configurations = get_app_configurations(app_handle);
    PathBuf::from(app_configurations.data_folder)
}

#[cfg(not(feature = "cli"))]
#[tauri::command]
pub fn get_configuration_file_path<R: Runtime>(app_handle: tauri::AppHandle<R>) -> PathBuf {
    let app_path = app_data_dir_with_fallback(&app_handle);
    if let Err(err) = migrate_legacy_app_configuration(&app_path) {
        log::warn!("Legacy app config migration skipped: {err}");
    }
    app_path.join(CONFIGURATION_FILE_NAME)
}

#[cfg(not(feature = "cli"))]
#[tauri::command]
pub fn default_data_folder_path<R: Runtime>(app_handle: tauri::AppHandle<R>) -> String {
    let mut path = paths::data_dir_for(&app_handle).unwrap_or_else(|err| {
        log::error!("Failed to get data directory: {err}. Falling back to home directory.");
        let home = std::env::var(if cfg!(target_os = "windows") {
            "USERPROFILE"
        } else {
            "HOME"
        })
        .unwrap_or_else(|_| ".".to_string());
        PathBuf::from(home)
    });

    let app_name = if cfg!(feature = "lu-distribution") {
        "Lu".to_string()
    } else {
        std::env::var("APP_NAME")
            .unwrap_or_else(|_| app_handle.config().product_name.clone().unwrap())
    };
    path.push(app_name);
    path.push("data");

    let mut path_str = path.to_string_lossy().into_owned();

    if let Some(stripped) = path_str.strip_suffix(".ai.app") {
        path_str = stripped.to_string();
    }

    path_str
}

#[cfg(not(feature = "cli"))]
#[tauri::command]
pub fn get_user_home_path<R: Runtime>(app: AppHandle<R>) -> String {
    get_app_configurations(app.clone()).data_folder
}

#[cfg(not(feature = "cli"))]
#[tauri::command]
pub fn change_app_data_folder<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
    new_data_folder: String,
) -> Result<(), String> {
    let new_data_folder_path = PathBuf::from(&new_data_folder);

    if is_forbidden_lu_data_path(&new_data_folder_path) {
        return Err("Lu requires an absolute data folder outside Jan's profile".to_string());
    }

    // Get current data folder path only after rejecting a forbidden target.
    let current_data_folder = get_jan_data_folder_path(app_handle.clone());

    // Create the new data folder if it doesn't exist
    if !new_data_folder_path.exists() {
        fs::create_dir_all(&new_data_folder_path)
            .map_err(|e| format!("Failed to create new data folder: {e}"))?;
    }

    // Copy all files from the old folder to the new one
    if current_data_folder.exists() {
        log::info!("Copying data from {current_data_folder:?} to {new_data_folder_path:?}");

        // Check if this is a parent directory to avoid infinite recursion
        if new_data_folder_path.starts_with(&current_data_folder) {
            return Err(
                "New data folder cannot be a subdirectory of the current data folder".to_string(),
            );
        }
        copy_dir_recursive(
            &current_data_folder,
            &new_data_folder_path,
            &[".uvx", ".npx", "openclaw"],
        )
        .map_err(|e| format!("Failed to copy data to new folder: {e}"))?;
    } else {
        log::info!("Current data folder does not exist, nothing to copy");
    }

    // Update the configuration to point to the new folder
    let mut configuration = get_app_configurations(app_handle.clone());
    configuration.data_folder = new_data_folder;

    // Save the updated configuration
    update_app_configuration(app_handle, configuration)
}

#[cfg(not(feature = "cli"))]
#[tauri::command]
pub fn app_token(state: State<'_, AppState>) -> Option<String> {
    state.app_token.clone()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use tempfile::tempdir;

    #[cfg(all(feature = "lu-distribution", not(feature = "cli")))]
    struct RestoreEnv(Vec<(&'static str, Option<std::ffi::OsString>)>);

    #[cfg(all(feature = "lu-distribution", not(feature = "cli")))]
    impl RestoreEnv {
        fn capture(names: &[&'static str]) -> Self {
            Self(
                names
                    .iter()
                    .map(|name| (*name, std::env::var_os(name)))
                    .collect(),
            )
        }
    }

    #[cfg(all(feature = "lu-distribution", not(feature = "cli")))]
    impl Drop for RestoreEnv {
        fn drop(&mut self) {
            for (name, value) in self.0.drain(..) {
                match value {
                    Some(value) => std::env::set_var(name, value),
                    None => std::env::remove_var(name),
                }
            }
        }
    }

    #[cfg(all(feature = "lu-distribution", not(feature = "cli")))]
    #[test]
    fn lu_desktop_uses_its_own_profile_when_jan_data_exists() {
        let _lock = crate::core::server::provider_secrets::SECRET_STORE_TEST_LOCK
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let _env = RestoreEnv::capture(&[
            "LU_DATA_ROOT",
            "JAN_DATA_ROOT",
            "LU_DATA_FOLDER",
            "JAN_DATA_FOLDER",
            "CI",
        ]);
        let temp = tempdir().expect("temporary profile root");
        let jan_dir = temp.path().join("Jan");
        let jan_data = jan_dir.join("data");
        fs::create_dir_all(&jan_data).expect("Jan data directory");
        let jan_config = jan_dir.join(CONFIGURATION_FILE_NAME);
        let jan_config_body = serde_json::to_string(&AppConfiguration {
            data_folder: jan_data.to_string_lossy().into_owned(),
        })
        .expect("Jan test configuration");
        fs::write(&jan_config, &jan_config_body).expect("Jan test configuration file");
        fs::write(jan_data.join("mcp_config.json"), "Jan-only MCP marker").expect("Jan MCP marker");

        std::env::set_var("LU_DATA_ROOT", temp.path());
        std::env::set_var("JAN_DATA_ROOT", temp.path().join("wrong-root"));
        std::env::remove_var("LU_DATA_FOLDER");
        std::env::set_var("JAN_DATA_FOLDER", &jan_data);
        std::env::remove_var("CI");

        let app = tauri::test::mock_app();
        let lu_config = temp.path().join("Lu").join(CONFIGURATION_FILE_NAME);
        let lu_data = temp.path().join("Lu").join("data");
        assert_eq!(
            app_data_dir_with_fallback(app.handle()),
            temp.path().join("Lu")
        );
        assert_eq!(get_configuration_file_path(app.handle().clone()), lu_config);
        assert_eq!(
            get_app_configurations(app.handle().clone()).data_folder,
            lu_data.to_string_lossy()
        );
        assert_eq!(resolve_jan_data_folder(), lu_data);
        assert_eq!(paths::vector_db_dir(), lu_data.join("db"));
        assert!(crate::core::agent::global_config::global_jan_dir()
            .expect("agent profile directory")
            .ends_with(".lu"));

        // A copied Lu root config or override must not reattach Jan's profile.
        fs::write(&lu_config, &jan_config_body).expect("copied Lu test config");
        std::env::set_var("LU_DATA_FOLDER", &jan_data);
        assert_eq!(
            get_app_configurations(app.handle().clone()).data_folder,
            lu_data.to_string_lossy()
        );
        assert_eq!(resolve_jan_data_folder(), lu_data);
        assert!(update_app_configuration(
            app.handle().clone(),
            AppConfiguration {
                data_folder: jan_data.to_string_lossy().into_owned()
            },
        )
        .is_err());
        assert!(change_app_data_folder(
            app.handle().clone(),
            jan_data.to_string_lossy().into_owned(),
        )
        .is_err());
        assert!(update_app_configuration(
            app.handle().clone(),
            AppConfiguration {
                data_folder: jan_data.join("future").to_string_lossy().into_owned()
            },
        )
        .is_err());
        assert!(update_app_configuration(
            app.handle().clone(),
            AppConfiguration {
                data_folder: lu_data
                    .join("..")
                    .join("..")
                    .join("Jan")
                    .join("data")
                    .to_string_lossy()
                    .into_owned()
            },
        )
        .is_err());
        fs::write(&lu_config, r#"{"data_folder":"../Jan/data"}"#).expect("relative Lu test config");
        assert_eq!(
            get_app_configurations(app.handle().clone()).data_folder,
            lu_data.to_string_lossy()
        );
        assert!(update_app_configuration(
            app.handle().clone(),
            AppConfiguration {
                data_folder: "../Jan/data".to_string()
            },
        )
        .is_err());
        assert_eq!(fs::read_to_string(jan_config).unwrap(), jan_config_body);
        assert_eq!(
            fs::read_to_string(jan_data.join("mcp_config.json")).unwrap(),
            "Jan-only MCP marker"
        );
    }

    #[test]
    fn migration_recovers_legacy_then_removes_stale_copy() {
        let tmp = tempdir().expect("temp dir");
        let canonical_dir = tmp.path().join("Jan");
        let canonical = canonical_dir.join(CONFIGURATION_FILE_NAME);
        let legacy = tmp.path().join("jan.ai.app").join(CONFIGURATION_FILE_NAME);

        fs::create_dir_all(legacy.parent().unwrap()).expect("create legacy dir");
        fs::write(&legacy, r#"{"data_folder":"D:\\jan.ai"}"#).expect("write legacy config");

        migrate_from_candidates(&canonical, vec![legacy.clone()]).expect("migration succeeds");

        let recovered = fs::read_to_string(&canonical).expect("read canonical");
        assert!(
            recovered.contains(r#""data_folder":"D:\\jan.ai""#),
            "settings must be preserved in the canonical location"
        );
        assert!(
            !legacy.exists(),
            "stale legacy copy must be removed after recovery"
        );
    }

    #[test]
    fn migration_skips_when_canonical_exists() {
        let tmp = tempdir().expect("temp dir");
        let canonical_dir = tmp.path().join("Jan");
        let canonical = canonical_dir.join(CONFIGURATION_FILE_NAME);
        let legacy = tmp.path().join("jan.ai.app").join(CONFIGURATION_FILE_NAME);

        fs::create_dir_all(canonical.parent().unwrap()).expect("create canonical dir");
        fs::create_dir_all(legacy.parent().unwrap()).expect("create legacy dir");
        fs::write(&canonical, r#"{"data_folder":"D:\\kept"}"#).expect("write canonical config");
        fs::write(&legacy, r#"{"data_folder":"D:\\legacy"}"#).expect("write legacy config");

        migrate_legacy_app_configuration(&canonical_dir).expect("migration succeeds");

        let current = fs::read_to_string(&canonical).expect("read canonical");
        assert!(current.contains(r#""data_folder":"D:\\kept""#));
    }

    #[test]
    fn migration_handles_missing_legacy_files() {
        let tmp = tempdir().expect("temp dir");
        let canonical = tmp.path().join("Jan").join(CONFIGURATION_FILE_NAME);
        let missing = tmp.path().join("missing").join(CONFIGURATION_FILE_NAME);

        migrate_from_candidates(&canonical, vec![missing]).expect("migration succeeds");
        assert!(!canonical.exists(), "canonical should remain absent");
    }

    #[cfg(feature = "lu-distribution")]
    #[test]
    fn lu_preview_never_migrates_jan_settings() {
        let temp = tempdir().expect("temporary directory");
        let jan_dir = temp.path().join("Jan");
        let lu_dir = temp.path().join("Lu");
        fs::create_dir_all(&jan_dir).expect("Jan directory");
        fs::write(jan_dir.join(CONFIGURATION_FILE_NAME), b"Jan original").expect("Jan config");
        migrate_legacy_app_configuration(&lu_dir).expect("Lu setup");
        assert_eq!(
            fs::read(jan_dir.join(CONFIGURATION_FILE_NAME)).expect("read Jan config"),
            b"Jan original"
        );
        assert!(!lu_dir.join(CONFIGURATION_FILE_NAME).exists());
        assert_eq!(app_support_name(), "Lu");
        assert_eq!(profile_dir_in(temp.path().to_path_buf()), lu_dir);
    }

    #[cfg(not(feature = "lu-distribution"))]
    #[test]
    fn jan_profile_keeps_its_package_name() {
        let temp = tempdir().expect("temporary directory");
        assert_eq!(
            profile_dir_in(temp.path().to_path_buf()),
            temp.path().join(env!("CARGO_PKG_NAME"))
        );
    }

    #[test]
    fn bundle_identifier_matches_tauri_conf() {
        let conf_name = if cfg!(feature = "lu-distribution") {
            "tauri.lu.conf.json"
        } else {
            "tauri.conf.json"
        };
        let conf_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(conf_name);
        let content = fs::read_to_string(conf_path).expect("read tauri.conf.json");
        let json: Value = serde_json::from_str(&content).expect("parse tauri.conf.json");
        let identifier = json
            .get("identifier")
            .and_then(|v| v.as_str())
            .expect("identifier field exists");

        assert_eq!(
            identifier, TAURI_BUNDLE_IDENTIFIER,
            "TAURI_BUNDLE_IDENTIFIER must stay synced with tauri.conf.json"
        );
    }
}
