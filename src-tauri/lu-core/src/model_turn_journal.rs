//! Durable, conversation-scoped audit of the external model JSON boundary.
//!
//! This is separate from the effect journal: it records evidence, NOT a grant,
//! an execution checkpoint, or permission to replay tool effects. The owning
//! trusted desktop must choose a profile-private SQLite path.

use std::{path::Path, sync::Mutex};

use crate::model_json_boundary::{JsonRepairStatus, MAX_BOUNDARY_JSON_BYTES};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelAuditKind {
    UserRequest,
    ModelOutput,
    ParsedCandidate,
    /// Host selected a reviewed route; selection is not an effect or a grant.
    HostRouteSelected,
    Rejected,
    ToolFeedback,
    FinalAnswer,
    GenerationFailure,
}

impl ModelAuditKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::UserRequest => "USER_REQUEST",
            Self::ModelOutput => "MODEL_OUTPUT",
            Self::ParsedCandidate => "PARSED_CANDIDATE",
            Self::HostRouteSelected => "HOST_ROUTE_SELECTED",
            Self::Rejected => "REJECTED",
            Self::ToolFeedback => "TOOL_FEEDBACK",
            Self::FinalAnswer => "FINAL_ANSWER",
            Self::GenerationFailure => "GENERATION_FAILURE",
        }
    }

    fn parse(value: &str) -> Option<Self> {
        match value {
            "USER_REQUEST" => Some(Self::UserRequest),
            "MODEL_OUTPUT" => Some(Self::ModelOutput),
            "PARSED_CANDIDATE" => Some(Self::ParsedCandidate),
            "HOST_ROUTE_SELECTED" => Some(Self::HostRouteSelected),
            "REJECTED" => Some(Self::Rejected),
            "TOOL_FEEDBACK" => Some(Self::ToolFeedback),
            "FINAL_ANSWER" => Some(Self::FinalAnswer),
            "GENERATION_FAILURE" => Some(Self::GenerationFailure),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelAuditError {
    Database(String),
    Poisoned,
    InvalidOrigin,
    OversizedEvent,
    InvalidStoredKind,
}

impl From<rusqlite::Error> for ModelAuditError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Database(error.to_string())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelAuditRecord {
    pub sequence: i64,
    pub kind: ModelAuditKind,
    pub payload: String,
    pub repair: Option<String>,
}

pub struct ModelTurnJournal {
    connection: Mutex<Connection>,
}

impl ModelTurnJournal {
    /// SQLite CHECK constraints are baked into table DDL. Older Windows
    /// profiles need an atomic rebuild to admit HOST_ROUTE_SELECTED without
    /// modifying the independent effect journal. Never replay selected routes.
    fn install_schema(connection: &mut Connection) -> Result<(), ModelAuditError> {
        const CREATE_TABLE: &str = "CREATE TABLE IF NOT EXISTS lu_model_boundary_audit (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN (
                    'USER_REQUEST','MODEL_OUTPUT','PARSED_CANDIDATE','HOST_ROUTE_SELECTED',
                    'REJECTED','TOOL_FEEDBACK','FINAL_ANSWER','GENERATION_FAILURE')),
                payload TEXT NOT NULL,
                repair TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
             );";
        const CREATE_INDEX: &str = "CREATE INDEX IF NOT EXISTS lu_model_boundary_by_task
            ON lu_model_boundary_audit(conversation_id, task_id, sequence);";
        let previous: Option<String> = connection.query_row(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='lu_model_boundary_audit'",
            [], |row| row.get(0),
        ).optional()?;
        match previous {
            None => {
                connection.execute_batch(CREATE_TABLE)?;
                connection.execute_batch(CREATE_INDEX)?;
            }
            Some(sql) if sql.contains("'HOST_ROUTE_SELECTED'") => {
                connection.execute_batch(CREATE_INDEX)?;
            }
            Some(sql) => {
                // Do not reinterpret an unknown table as a Lu profile. Failing
                // closed is safer than silently dropping arbitrary columns.
                if !sql.contains("AUTOINCREMENT") || !sql.contains("'USER_REQUEST'")
                    || !sql.contains("'GENERATION_FAILURE'")
                    || !sql.contains("created_at")
                {
                    return Err(ModelAuditError::Database(
                        "unrecognized prior model-audit schema".into()
                    ));
                }
                let transaction =
                    connection.transaction_with_behavior(TransactionBehavior::Immediate)?;
                let previous_sequence: Option<i64> = transaction.query_row(
                    "SELECT seq FROM sqlite_sequence WHERE name='lu_model_boundary_audit'",
                    [], |row| row.get(0),
                ).optional()?;
                transaction.execute_batch(
                    "CREATE TABLE lu_model_boundary_audit_migrating (
                        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                        conversation_id TEXT NOT NULL,
                        task_id TEXT NOT NULL,
                        kind TEXT NOT NULL CHECK(kind IN (
                            'USER_REQUEST','MODEL_OUTPUT','PARSED_CANDIDATE','HOST_ROUTE_SELECTED',
                            'REJECTED','TOOL_FEEDBACK','FINAL_ANSWER','GENERATION_FAILURE')),
                        payload TEXT NOT NULL,
                        repair TEXT,
                        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                     );
                     INSERT INTO lu_model_boundary_audit_migrating
                        (sequence,conversation_id,task_id,kind,payload,repair,created_at)
                     SELECT sequence,conversation_id,task_id,kind,payload,repair,created_at
                       FROM lu_model_boundary_audit;
                     DROP TABLE lu_model_boundary_audit;
                     ALTER TABLE lu_model_boundary_audit_migrating
                       RENAME TO lu_model_boundary_audit;",
                )?;
                // Deleting the historical highest row must never cause a
                // sequence number to be reused after profile migration.
                if let Some(sequence) = previous_sequence {
                    let updated = transaction.execute(
                        "UPDATE sqlite_sequence SET seq=MAX(seq, ?1)
                         WHERE name='lu_model_boundary_audit'",
                        params![sequence],
                    )?;
                    if updated == 0 {
                        transaction.execute(
                            "INSERT INTO sqlite_sequence(name,seq)
                             VALUES ('lu_model_boundary_audit',?1)",
                            params![sequence],
                        )?;
                    }
                }
                transaction.execute_batch(CREATE_INDEX)?;
                transaction.commit()?;
            }
        }
        Ok(())
    }

    pub fn open(path: &Path) -> Result<Self, ModelAuditError> {
        let mut connection = Connection::open(path)?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        Self::install_schema(&mut connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    fn validate_origin(conversation_id: &str, task_id: &str) -> Result<(), ModelAuditError> {
        if conversation_id.trim().is_empty()
            || task_id.trim().is_empty()
            || conversation_id.len() > 128
            || task_id.len() > 128
        {
            return Err(ModelAuditError::InvalidOrigin);
        }
        Ok(())
    }

    /// Each append is committed under SQLite WAL/FULL before execution proceeds.
    /// Caller must never place model-provided IDs in the origin fields.
    pub fn append(
        &self,
        conversation_id: &str,
        task_id: &str,
        kind: ModelAuditKind,
        payload: &str,
        repair: Option<JsonRepairStatus>,
    ) -> Result<i64, ModelAuditError> {
        Self::validate_origin(conversation_id, task_id)?;
        if payload.len() > MAX_BOUNDARY_JSON_BYTES {
            return Err(ModelAuditError::OversizedEvent);
        }
        let repair = repair.map(|status| format!("{status:?}"));
        let connection = self
            .connection
            .lock()
            .map_err(|_| ModelAuditError::Poisoned)?;
        connection.execute(
            "INSERT INTO lu_model_boundary_audit
                 (conversation_id, task_id, kind, payload, repair)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![conversation_id, task_id, kind.as_str(), payload, repair],
        )?;
        Ok(connection.last_insert_rowid())
    }

    pub fn events_for(
        &self,
        conversation_id: &str,
        task_id: &str,
    ) -> Result<Vec<ModelAuditRecord>, ModelAuditError> {
        Self::validate_origin(conversation_id, task_id)?;
        let connection = self
            .connection
            .lock()
            .map_err(|_| ModelAuditError::Poisoned)?;
        let mut statement = connection.prepare(
            "SELECT sequence, kind, payload, repair FROM lu_model_boundary_audit
             WHERE conversation_id=?1 AND task_id=?2 ORDER BY sequence ASC",
        )?;
        let rows = statement.query_map(params![conversation_id, task_id], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
            ))
        })?;
        let mut events = Vec::new();
        for row in rows {
            let (sequence, kind, payload, repair) = row?;
            events.push(ModelAuditRecord {
                sequence,
                kind: ModelAuditKind::parse(&kind).ok_or(ModelAuditError::InvalidStoredKind)?,
                payload,
                repair,
            });
        }
        Ok(events)
    }
}

#[cfg(test)]
mod host_route_migration_tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn db_path(tag: &str) -> std::path::PathBuf {
        let unique = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!(
            "lu-route-audit-{tag}-{}-{unique}.db", std::process::id()))
    }

    const LEGACY_TABLE: &str = "CREATE TABLE lu_model_boundary_audit (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL, task_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN (
            'USER_REQUEST','MODEL_OUTPUT','PARSED_CANDIDATE',
            'REJECTED','TOOL_FEEDBACK','FINAL_ANSWER','GENERATION_FAILURE')),
        payload TEXT NOT NULL, repair TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE INDEX lu_model_boundary_by_task
            ON lu_model_boundary_audit(conversation_id,task_id,sequence);";

    #[test]
    fn older_windows_schema_is_migrated_preserving_rows_and_sequence() {
        let path = db_path("legacy");
        let connection = Connection::open(&path).unwrap();
        connection.execute_batch(LEGACY_TABLE).unwrap();
        for text in ["first", "later", "discarded"] {
            connection.execute(
                "INSERT INTO lu_model_boundary_audit
                 (conversation_id,task_id,kind,payload)
                 VALUES ('conv-1','user-turn-1','MODEL_OUTPUT',?1)", [text]
            ).unwrap();
        }
        connection.execute(
            "DELETE FROM lu_model_boundary_audit WHERE payload='discarded'", []
        ).unwrap();
        drop(connection);

        let journal = ModelTurnJournal::open(&path).unwrap();
        let events = journal.events_for("conv-1", "user-turn-1").unwrap();
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].sequence, 1);
        assert_eq!(events[1].payload, "later");
        let route_seq = journal.append(
            "conv-1", "user-turn-1", ModelAuditKind::HostRouteSelected,
            r#"{"rule_id":"lu.route.test","stage":"selected_before_dispatch"}"#, None
        ).unwrap();
        assert!(route_seq > 3, "SQLite AUTOINCREMENT high watermark must survive migration");
        drop(journal);

        let reopened = ModelTurnJournal::open(&path).unwrap();
        let rows = reopened.events_for("conv-1", "user-turn-1").unwrap();
        assert_eq!(rows.len(), 3);
        assert_eq!(rows[2].kind, ModelAuditKind::HostRouteSelected);
        assert_eq!(rows[2].sequence, route_seq);
        assert!(reopened.events_for("other-conv", "user-turn-1").unwrap().is_empty());
        drop(reopened);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn incompatible_legacy_schema_rolls_back_without_loss() {
        let path = db_path("rollback");
        let connection = Connection::open(&path).unwrap();
        connection.execute_batch(
            "CREATE TABLE lu_model_boundary_audit (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                conversation_id TEXT NOT NULL, task_id TEXT NOT NULL,
                kind TEXT NOT NULL CHECK(kind IN ('USER_REQUEST','GENERATION_FAILURE')),
                payload TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
             INSERT INTO lu_model_boundary_audit(conversation_id,task_id,kind,payload)
                VALUES ('c','t','USER_REQUEST','keep');"
        ).unwrap();
        drop(connection);
        assert!(ModelTurnJournal::open(&path).is_err());
        let intact = Connection::open(&path).unwrap();
        let preserved: String = intact.query_row(
            "SELECT payload FROM lu_model_boundary_audit", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(preserved, "keep");
        drop(intact);
        let _ = std::fs::remove_file(path);
    }
}
