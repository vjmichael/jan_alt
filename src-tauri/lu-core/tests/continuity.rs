use std::{path::PathBuf, time::{SystemTime, UNIX_EPOCH}};
use lu_core::{ContinuityError, ContinuityStore, TaskCheckpoint};

fn temp() -> PathBuf {
    let t = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    std::env::temp_dir().join(format!("lu-continuity-{}-{t}.sqlite", std::process::id()))
}
fn sample() -> TaskCheckpoint {
    TaskCheckpoint {
        checkpoint_id: "checkpoint-001".into(),
        project_id: "lu".into(),
        task_id: "memory-worker".into(),
        conversation_id: "thread-123".into(),
        source_entry_ids: vec![1, 2],
        completed_work: "Completed indexed import".into(),
        next_action: "Validate Windows runtime".into(),
        blockers: vec!["Smoke test".into()],
    }
}
#[test]
fn checkpoint_replay_and_restart_preserve_identity() {
    let db = temp();
    let first = sample();
    {
        let store = ContinuityStore::open(&db).unwrap();
        store.append(&first).unwrap();
        store.append(&first).unwrap();
        assert_eq!(store.latest("lu", "memory-worker").unwrap(), Some(first.clone()));
        let mut conflict = first.clone();
        conflict.next_action = "Unverified change".into();
        assert_eq!(store.append(&conflict), Err(ContinuityError::IdentityConflict));
    }
    {
        let store = ContinuityStore::open(&db).unwrap();
        let mut next = first.clone();
        next.checkpoint_id = "checkpoint-002".into();
        next.completed_work = "Windows smoke test finished".into();
        store.append(&next).unwrap();
        assert_eq!(store.latest("lu", "memory-worker").unwrap(), Some(next));
        assert!(store.latest("another-project", "memory-worker").unwrap().is_none());
    }
    let _ = std::fs::remove_file(db);
}
#[test]
fn rejects_invalid_ids_and_unbounded_checkpoint_fields() {
    let db = temp();
    let store = ContinuityStore::open(&db).unwrap();
    let mut bad = sample();
    bad.project_id = "../other".into();
    assert_eq!(store.append(&bad), Err(ContinuityError::InvalidInput));
    bad = sample();
    bad.source_entry_ids = vec![0];
    assert_eq!(store.append(&bad), Err(ContinuityError::InvalidInput));
    bad = sample();
    bad.next_action = "x".repeat(4097);
    assert_eq!(store.append(&bad), Err(ContinuityError::InvalidInput));
    let _ = std::fs::remove_file(db);
}
