//! Durable, host-issued CE permission records and synchronous revocation events.
//! A manifest or model cannot mint a grant. Grants bind an exact signed digest,
//! publisher key, profile, scope, tool, effect, and authenticated user turn.
//! A private, host-owned SQLite database is required by the embedding app.

use std::{
    path::Path,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{params, Connection, OptionalExtension};

use crate::{
    ce_signing::VerifiedCePackage,
    contracts::{AuthorizationError, ToolAuthorizer, ToolDescriptor, ToolEffect, ToolInvocation},
    privilege_guard::enforce_model_ceiling,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CePermissionError {
    Database(String),
    InvalidGrant,
    InsecureStorage,
    AlreadyRecorded,
    NotFound,
    Denied,
    Unavailable,
}

impl From<rusqlite::Error> for CePermissionError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error.to_string())
    }
}

fn now_secs() -> Result<i64, CePermissionError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| CePermissionError::Unavailable)?
        .as_secs();
    i64::try_from(now).map_err(|_| CePermissionError::Unavailable)
}

fn valid(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 128
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_'))
}

fn effect_code(effect: ToolEffect) -> i64 {
    match effect {
        ToolEffect::ReadWorkspace => 1,
        ToolEffect::WriteWorkspace => 2,
        ToolEffect::ExecuteCode => 3,
        ToolEffect::NetworkRead => 4,
        ToolEffect::NetworkWrite => 5,
        ToolEffect::DeviceControl => 6,
        ToolEffect::Elevated => 7,
    }
}

/// Host UI must authenticate this user turn from persisted records. The
/// approval is not inferred from a model, manifest, or extension request.
#[derive(Debug, Clone)]
pub struct CeGrantRequest {
    pub profile_id: String,
    pub scope_id: String,
    pub tool_id: String,
    pub effect: ToolEffect,
    pub approved_user_turn_id: String,
    pub expires_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CeRevocation {
    pub profile_id: String,
    pub package_id: String,
    pub scope_id: String,
    /// None means every tool in this package/scope.
    pub tool_id: Option<String>,
}

type Listener = Arc<dyn Fn(&CeRevocation) + Send + Sync>;

struct Inner {
    conn: Mutex<Connection>,
    listeners: Mutex<Vec<Listener>>,
}

/// Clones share one connection and one listener set. A separate process
/// editing the database is NOT an approved revocation pathway: the trusted
/// host must call revoke_* so active worker cancellation is synchronous.
#[derive(Clone)]
pub struct CePermissionStore {
    inner: Arc<Inner>,
}

impl CePermissionStore {
    pub fn open(path: &Path) -> Result<Self, CePermissionError> {
        // Caller must provide an already protected Lu-owned profile directory.
        // Never accept a path supplied by an extension, model or webview.
        let parent = path.parent().ok_or(CePermissionError::InsecureStorage)?;
        let parent_meta = std::fs::symlink_metadata(parent)
            .map_err(|_| CePermissionError::InsecureStorage)?;
        if !parent_meta.file_type().is_dir() {
            return Err(CePermissionError::InsecureStorage);
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
            if parent_meta.permissions().mode() & 0o077 != 0 {
                return Err(CePermissionError::InsecureStorage);
            }
            if let Ok(meta) = std::fs::symlink_metadata(path) {
                if !meta.file_type().is_file() {
                    return Err(CePermissionError::InsecureStorage);
                }
            }
            // The database and SQLite sidecars must never be world-readable.
            let mut options = std::fs::OpenOptions::new();
            options.write(true).create(true).mode(0o600);
            let _file = options.open(path).map_err(|e| CePermissionError::Database(e.to_string()))?;
            std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
                .map_err(|e| CePermissionError::Database(e.to_string()))?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch(
            "PRAGMA foreign_keys=ON;
             PRAGMA journal_mode=WAL;
             PRAGMA synchronous=FULL;
             CREATE TABLE IF NOT EXISTS ce_grants (
               profile TEXT NOT NULL,
               package TEXT NOT NULL,
               scope TEXT NOT NULL,
               tool TEXT NOT NULL,
               effect INTEGER NOT NULL,
               digest TEXT NOT NULL,
               key_id TEXT NOT NULL,
               user_turn TEXT NOT NULL,
               approved_at INTEGER NOT NULL,
               expires_at INTEGER NOT NULL,
               revoked_at INTEGER,
               PRIMARY KEY(profile, package, scope, tool)
             );
             CREATE TABLE IF NOT EXISTS ce_permission_events (
               seq INTEGER PRIMARY KEY AUTOINCREMENT,
               event TEXT NOT NULL CHECK(event IN ('approve','revoke')),
               profile TEXT NOT NULL,
               package TEXT NOT NULL,
               scope TEXT NOT NULL,
               tool TEXT,
               at INTEGER NOT NULL
             );
             CREATE TRIGGER IF NOT EXISTS ce_events_immutable_update
               BEFORE UPDATE ON ce_permission_events BEGIN
                 SELECT RAISE(ABORT, 'CE permission audit event is immutable');
               END;
             CREATE TRIGGER IF NOT EXISTS ce_events_immutable_delete
               BEFORE DELETE ON ce_permission_events BEGIN
                 SELECT RAISE(ABORT, 'CE permission audit event is immutable');
               END;",
        )?;
        Ok(Self {
            inner: Arc::new(Inner {
                conn: Mutex::new(conn),
                listeners: Mutex::new(Vec::new()),
            }),
        })
    }

    pub fn subscribe_revocations(&self, listener: Listener) -> Result<(), CePermissionError> {
        self.inner
            .listeners
            .lock()
            .map_err(|_| CePermissionError::Unavailable)?
            .push(listener);
        Ok(())
    }

    /// TRUSTED HOST ONLY. Rejects duplicate/replayed approval and silently
    /// changed package bytes. A new digest needs an explicit new approval
    /// after the old row has been deliberately retired.
    pub fn approve(
        &self,
        package: &VerifiedCePackage,
        grant: &CeGrantRequest,
    ) -> Result<(), CePermissionError> {
        if !valid(&grant.profile_id)
            || !valid(&grant.scope_id)
            || !valid(&grant.approved_user_turn_id)
            || !valid(&grant.tool_id)
            || !package.manifest().tools.contains(&grant.tool_id)
            || enforce_model_ceiling(grant.effect).is_err()
        {
            return Err(CePermissionError::InvalidGrant);
        }
        let now = now_secs()?;
        if grant.expires_at <= now {
            return Err(CePermissionError::InvalidGrant);
        }
        let mut conn = self
            .inner
            .conn
            .lock()
            .map_err(|_| CePermissionError::Unavailable)?;
        let tx = conn.transaction()?;
        let count = tx.execute(
            "INSERT OR IGNORE INTO ce_grants
              (profile,package,scope,tool,effect,digest,key_id,user_turn,approved_at,expires_at,revoked_at)
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,NULL)",
            params![
                grant.profile_id, package.manifest().id, grant.scope_id, grant.tool_id,
                effect_code(grant.effect), package.artifact_sha256(), package.key_id(),
                grant.approved_user_turn_id, now, grant.expires_at
            ]
        )?;
        if count != 1 {
            return Err(CePermissionError::AlreadyRecorded);
        }
        tx.execute(
            "INSERT INTO ce_permission_events(event,profile,package,scope,tool,at)
             VALUES ('approve',?1,?2,?3,?4,?5)",
            params![
                grant.profile_id,
                package.manifest().id,
                grant.scope_id,
                grant.tool_id,
                now
            ],
        )?;
        tx.commit()?;
        Ok(())
    }

    /// Re-read durable state on EVERY broker operation and worker admission.
    pub fn require(
        &self,
        package: &VerifiedCePackage,
        profile: &str,
        scope: &str,
        tool: &str,
        effect: ToolEffect,
    ) -> Result<(), CePermissionError> {
        if !valid(profile)
            || !valid(scope)
            || !valid(tool)
            || !package.manifest().tools.iter().any(|id| id == tool)
            || enforce_model_ceiling(effect).is_err()
        {
            return Err(CePermissionError::Denied);
        }
        let now = now_secs()?;
        let conn = self
            .inner
            .conn
            .lock()
            .map_err(|_| CePermissionError::Unavailable)?;
        let record: Option<(i64, String, String, i64, Option<i64>)> = conn
            .query_row(
                "SELECT effect,digest,key_id,expires_at,revoked_at
             FROM ce_grants WHERE profile=?1 AND package=?2 AND scope=?3 AND tool=?4",
                params![profile, package.manifest().id, scope, tool],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .optional()?;
        match record {
            Some((stored_effect, digest, key, expiry, None))
                if stored_effect == effect_code(effect)
                    && digest == package.artifact_sha256()
                    && key == package.key_id()
                    && now < expiry =>
            {
                Ok(())
            }
            _ => Err(CePermissionError::Denied),
        }
    }

    pub fn revoke(
        &self,
        profile: &str,
        package: &str,
        scope: &str,
        tool: Option<&str>,
    ) -> Result<(), CePermissionError> {
        if !valid(profile)
            || !valid(package)
            || !valid(scope)
            || tool.is_some_and(|tool| !valid(tool))
        {
            return Err(CePermissionError::InvalidGrant);
        }
        let now = now_secs()?;
        {
            let mut conn = self
                .inner
                .conn
                .lock()
                .map_err(|_| CePermissionError::Unavailable)?;
            let tx = conn.transaction()?;
            let affected = if let Some(tool) = tool {
                tx.execute(
                    "UPDATE ce_grants SET revoked_at=?1 WHERE profile=?2 AND package=?3
                     AND scope=?4 AND tool=?5 AND revoked_at IS NULL",
                    params![now, profile, package, scope, tool],
                )?
            } else {
                tx.execute(
                    "UPDATE ce_grants SET revoked_at=?1 WHERE profile=?2 AND package=?3
                     AND scope=?4 AND revoked_at IS NULL",
                    params![now, profile, package, scope],
                )?
            };
            if affected == 0 {
                return Err(CePermissionError::NotFound);
            }
            tx.execute(
                "INSERT INTO ce_permission_events(event,profile,package,scope,tool,at)
                 VALUES ('revoke',?1,?2,?3,?4,?5)",
                params![profile, package, scope, tool, now],
            )?;
            tx.commit()?;
        }
        let event = CeRevocation {
            profile_id: profile.to_owned(),
            package_id: package.to_owned(),
            scope_id: scope.to_owned(),
            tool_id: tool.map(str::to_owned),
        };
        let listeners = self
            .inner
            .listeners
            .lock()
            .map_err(|_| CePermissionError::Unavailable)?
            .clone();
        for listener in listeners {
            listener(&event);
        }
        Ok(())
    }

    pub fn audit_event_count(&self) -> Result<u64, CePermissionError> {
        let conn = self
            .inner
            .conn
            .lock()
            .map_err(|_| CePermissionError::Unavailable)?;
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM ce_permission_events", [], |r| {
            r.get(0)
        })?;
        u64::try_from(count).map_err(|_| CePermissionError::Unavailable)
    }
}

/// Immutable package/scope binding, provided by the trusted host when a task
/// starts. This is an additional policy layer, not a substitute for user-turn
/// verification by ConversationAuthority.
pub struct CeGrantAuthorizer {
    pub store: CePermissionStore,
    pub package: VerifiedCePackage,
    pub profile_id: String,
    pub scope_id: String,
}

impl ToolAuthorizer for CeGrantAuthorizer {
    fn authorize(
        &self,
        invocation: &ToolInvocation,
        descriptor: &ToolDescriptor,
    ) -> Result<(), AuthorizationError> {
        if invocation.workspace_id.as_deref() != Some(self.scope_id.as_str())
            || invocation.tool_id != descriptor.id
        {
            return Err(AuthorizationError::new("CE scope or tool mismatch"));
        }
        self.store
            .require(
                &self.package,
                &self.profile_id,
                &self.scope_id,
                &descriptor.id,
                descriptor.effect,
            )
            .map_err(|_| AuthorizationError::new("CE permission missing, changed or revoked"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ce_signing::CePublisherTrust;
    use ed25519_dalek::{Signer, SigningKey};
    use sha2::{Digest, Sha256};

    fn package() -> VerifiedCePackage {
        let signing = SigningKey::from_bytes(&[13u8; 32]);
        let mut trust = CePublisherTrust::new();
        trust
            .pin_key(
                "key",
                "Publisher",
                signing.verifying_key().to_bytes(),
                0,
                u64::MAX,
            )
            .unwrap();
        let manifest = serde_json::json!({
            "format_version":1,"id":"publisher.extension","version":"1.0.0",
            "contract_version":1,"publisher":"Publisher",
            "artifact_sha256":format!("{:x}",Sha256::digest(b"worker")),
            "dependencies":[],"tools":["publisher.extension.run"]
        })
        .to_string();
        let mut message = b"Lu-CE-Signed-Manifest-v1\0".to_vec();
        message.extend_from_slice(&(3u32).to_be_bytes());
        message.extend_from_slice(b"key");
        message.extend_from_slice(&(manifest.len() as u32).to_be_bytes());
        message.extend_from_slice(manifest.as_bytes());
        let signature = signing.sign(&message);
        let envelope = serde_json::json!({
            "format_version":1,"key_id":"key","manifest_json":manifest,
            "signature_hex":signature.to_bytes().iter().map(|b|format!("{b:02x}")).collect::<String>()
        }).to_string();
        trust.verify_at(&envelope, b"worker", 200).unwrap()
    }

    #[test]
    fn grants_survive_restart_and_revocations_notify_and_deny() {
        let root = std::env::temp_dir().join(format!(
            "lu_ce_permission_{}_{}",
            std::process::id(),
            std::thread::current().name().unwrap_or("test")
        ));
        std::fs::create_dir_all(&root).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&root, std::fs::Permissions::from_mode(0o700)).unwrap();
        }
        let path = root.join("permissions.db");
        let _ = std::fs::remove_file(&path);
        let pkg = package();
        let grant = CeGrantRequest {
            profile_id: "profile".into(),
            scope_id: "scope".into(),
            tool_id: "publisher.extension.run".into(),
            effect: ToolEffect::ReadWorkspace,
            approved_user_turn_id: "verified-turn".into(),
            expires_at: i64::MAX,
        };
        let store = CePermissionStore::open(&path).unwrap();
        store.approve(&pkg, &grant).unwrap();
        assert_eq!(
            store.approve(&pkg, &grant),
            Err(CePermissionError::AlreadyRecorded)
        );
        assert_eq!(store.audit_event_count().unwrap(), 1);
        drop(store);
        let store = CePermissionStore::open(&path).unwrap();
        store
            .require(
                &pkg,
                "profile",
                "scope",
                &grant.tool_id,
                ToolEffect::ReadWorkspace,
            )
            .unwrap();
        assert_eq!(
            store.require(
                &pkg,
                "other",
                "scope",
                &grant.tool_id,
                ToolEffect::ReadWorkspace
            ),
            Err(CePermissionError::Denied)
        );
        assert_eq!(
            store.require(
                &pkg,
                "profile",
                "scope",
                &grant.tool_id,
                ToolEffect::WriteWorkspace
            ),
            Err(CePermissionError::Denied)
        );
        let events = Arc::new(Mutex::new(Vec::new()));
        let captured = Arc::clone(&events);
        store
            .subscribe_revocations(Arc::new(move |event| {
                captured.lock().unwrap().push(event.clone())
            }))
            .unwrap();
        store
            .revoke(
                "profile",
                "publisher.extension",
                "scope",
                Some(&grant.tool_id),
            )
            .unwrap();
        assert_eq!(events.lock().unwrap().len(), 1);
        assert_eq!(store.audit_event_count().unwrap(), 2);
        assert_eq!(
            store.require(
                &pkg,
                "profile",
                "scope",
                &grant.tool_id,
                ToolEffect::ReadWorkspace
            ),
            Err(CePermissionError::Denied)
        );
        drop(store);
        let reopened = CePermissionStore::open(&path).unwrap();
        assert_eq!(
            reopened.require(
                &pkg,
                "profile",
                "scope",
                &grant.tool_id,
                ToolEffect::ReadWorkspace
            ),
            Err(CePermissionError::Denied)
        );
        drop(reopened);
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(path.with_extension("db-wal"));
        let _ = std::fs::remove_file(path.with_extension("db-shm"));
        std::fs::remove_dir_all(root).unwrap();
    }
}
