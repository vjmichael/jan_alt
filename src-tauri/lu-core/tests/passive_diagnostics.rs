//! Synthetic diagnostics-contract fixtures, NOT Windows GUI proof.
use lu_core::passive_diagnostics::{NativeStage, PassiveDiagnostics, MAX_PASSIVE_EVENTS};

#[test]
fn passive_ring_is_bounded_and_sequences_are_ordered() {
    let mut trace = PassiveDiagnostics::default();
    for _ in 0..100 {
        trace.record(NativeStage::TurnReceived);
    }
    let events = trace.snapshot();
    assert_eq!(events.len(), MAX_PASSIVE_EVENTS);
    assert_eq!(events[0].sequence, 37);
    assert_eq!(events[MAX_PASSIVE_EVENTS - 1].sequence, 100);
    assert!(events.windows(2).all(|pair| pair[0].sequence < pair[1].sequence));
    assert!(events.windows(2).all(|pair| {
        pair[0].elapsed_millis <= pair[1].elapsed_millis
    }));
}

#[test]
fn trace_serialization_never_contains_user_content_or_identifiers() {
    let mut trace = PassiveDiagnostics::default();
    for stage in [
        NativeStage::TurnReceived,
        NativeStage::SavedUserAttested,
        NativeStage::TaskAuthorized,
        NativeStage::ModelLoopEntered,
        NativeStage::ModelLoopReturned,
        NativeStage::TurnSucceeded,
        NativeStage::CancelSignalled,
    ] {
        trace.record(stage);
    }
    let json = serde_json::to_string(&trace.snapshot()).unwrap();
    for forbidden in [
        "userTurnId", "threadId", "sessionId", "modelRef",
        "modelPath", "prompt", "toolArguments", "apiKey",
    ] {
        assert!(!json.contains(forbidden), "unexpected diagnostic content");
    }
    assert!(json.contains("native-model-loop-returned"));
    assert!(json.contains("elapsedMillis"));
}

#[test]
fn explicit_rejection_stages_do_not_grant_authority() {
    let mut trace = PassiveDiagnostics::default();
    trace.record(NativeStage::SavedUserRejected);
    trace.record(NativeStage::RecoveryUnavailable);
    trace.record(NativeStage::TurnFailed);
    assert_eq!(
        trace.snapshot().iter().map(|event| event.stage).collect::<Vec<_>>(),
        vec!["saved-user-rejected", "recovery-unavailable", "native-turn-failed"],
    );
}
