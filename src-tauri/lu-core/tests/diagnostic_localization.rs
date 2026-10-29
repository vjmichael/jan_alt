//! DX-03 synthetic fault localization fixtures; NOT installed Windows proof.
use lu_core::diagnostic_localization::{localize_normal_turn, EvidenceStrength};
use lu_core::wire::proto;

fn all_success() -> proto::DiagnosticTrace {
    let stages = [1, 2, 3, 4, 19, 5, 6, 7, 8, 9, 10, 11, 12, 13];
    let mut previous = 0;
    let events = stages.iter().enumerate().map(|(index, stage)| {
        let sequence = index as u64 + 1;
        let event = proto::DiagnosticEvent {
            sequence,
            parent_sequence: previous,
            stage: *stage,
            outcome: 2,
            elapsed_millis: sequence * 10,
            clock_domain: 2,
            failure_code: 0,
            attempt: 1,
        };
        previous = sequence;
        event
    }).collect();
    proto::DiagnosticTrace {
        protocol_version: 1,
        trace_ref: "abcdef0123456789abcdef0123456789".into(),
        dropped_events: 0,
        events,
    }
}

#[test]
fn a_complete_trace_is_a_completed_operation_not_a_failure() {
    let report = localize_normal_turn(&all_success()).unwrap();
    assert_eq!(report.evidence_strength, EvidenceStrength::Complete);
    assert_eq!(report.first_unconfirmed, "none");
    assert_eq!(report.confirmed_until, "assistant_rendered");
}

#[test]
fn stopped_after_host_model_loop_points_to_return_boundary_not_react() {
    let mut trace = all_success();
    trace.events.truncate(9);
    let report = localize_normal_turn(&trace).unwrap();
    assert_eq!(report.confirmed_until, "model_loop_entered");
    assert_eq!(report.first_unconfirmed, "model_loop_returned");
    assert_eq!(report.fault_region, "model_runtime");
    assert_eq!(report.evidence_strength, EvidenceStrength::BoundedToNextStage);
}

#[test]
fn observed_model_entry_without_a_return_localizes_to_model_completion() {
    let mut trace = all_success();
    trace.events.truncate(9);
    trace.events[7].outcome = 1; // Worker entry is not a worker success.
    trace.events[8].outcome = 1; // Model loop began; no completion observed.
    let report = localize_normal_turn(&trace).unwrap();
    assert_eq!(report.confirmed_until, "model_loop_entered");
    assert_eq!(report.first_unconfirmed, "model_loop_returned");
    assert_eq!(report.evidence_strength, EvidenceStrength::BoundedToNextStage);
}

#[test]
fn actual_transport_failure_is_observed_not_inferred() {
    let mut trace = all_success();
    trace.events.truncate(11);
    let failed = trace.events.last_mut().unwrap();
    failed.outcome = 3;
    failed.failure_code = 7;
    let report = localize_normal_turn(&trace).unwrap();
    assert_eq!(report.confirmed_until, "model_loop_returned");
    assert_eq!(report.first_unconfirmed, "native_ipc_returned");
    assert_eq!(report.fault_region, "tauri_ipc");
    assert_eq!(report.failure_code, "transport");
    assert_eq!(report.evidence_strength, EvidenceStrength::ObservedFailure);
}

#[test]
fn missing_records_or_out_of_order_confirmation_never_claim_a_root_cause() {
    let mut trace = all_success();
    trace.dropped_events = 1;
    trace.events.remove(8);
    let report = localize_normal_turn(&trace).unwrap();
    assert_eq!(report.first_unconfirmed, "model_loop_entered");
    assert_eq!(report.evidence_strength, EvidenceStrength::InsufficientEvidence);
    let mut trace = all_success();
    trace.events.remove(8);
    // Even without an explicit drop counter, later success does not prove
    // a missing predecessor was skipped. Fix the recorded parent edge.
    trace.events[8].parent_sequence = 8;
    let report = localize_normal_turn(&trace).unwrap();
    assert_eq!(report.evidence_strength, EvidenceStrength::InsufficientEvidence);
}

#[test]
fn abandoned_tool_dispatch_localizes_the_native_tool_boundary() {
    let mut trace = all_success();
    trace.events.truncate(9);
    trace.events.push(proto::DiagnosticEvent {
        sequence: 10,
        parent_sequence: 9,
        stage: 14,
        outcome: 1,
        elapsed_millis: 100,
        clock_domain: 2,
        failure_code: 0,
        attempt: 1,
    });
    let report = localize_normal_turn(&trace).unwrap();
    assert_eq!(report.confirmed_until, "tool_dispatch_entered");
    assert_eq!(report.first_unconfirmed, "tool_dispatch_returned");
    assert_eq!(report.fault_region, "native_tool");
}

#[test]
fn cancelled_request_requires_terminal_worker_state_evidence() {
    let mut trace = all_success();
    trace.events.truncate(8);
    trace.events.push(proto::DiagnosticEvent {
        sequence: 9,
        parent_sequence: 8,
        stage: 16,
        outcome: 1,
        elapsed_millis: 100,
        clock_domain: 2,
        failure_code: 0,
        attempt: 1,
    });
    let report = localize_normal_turn(&trace).unwrap();
    assert_eq!(report.first_unconfirmed, "worker_terminated");
    assert_eq!(report.fault_region, "worker_recovery");
}

#[test]
fn never_merge_an_earlier_attempt_with_the_last_retry() {
    let mut trace = all_success();
    let next = proto::DiagnosticEvent {
        sequence: 15,
        parent_sequence: 14,
        stage: 1,
        outcome: 2,
        elapsed_millis: 1,
        clock_domain: 1,
        failure_code: 0,
        attempt: 2,
    };
    trace.events.push(next);
    let report = localize_normal_turn(&trace).unwrap();
    assert_eq!(report.attempt, 2);
    assert_eq!(report.confirmed_until, "user_submitted");
    assert_eq!(report.first_unconfirmed, "user_saved");
}

#[test]
fn invalid_observations_are_rejected_before_analysis() {
    let mut trace = all_success();
    trace.events[3].stage = 99;
    assert!(localize_normal_turn(&trace).is_err());
}
