//! DX-00 synthetic schema/negative fixtures. Not Windows process evidence.
use lu_core::diagnostic_contract::{
    decode_diagnostic_trace, encode_diagnostic_trace, DiagnosticWireError,
    DIAGNOSTIC_PROTOCOL_VERSION, MAX_DIAGNOSTIC_EVENTS, MAX_DIAGNOSTIC_FRAME_BYTES,
};
use lu_core::wire::proto;

fn sample() -> proto::DiagnosticTrace {
    proto::DiagnosticTrace {
        protocol_version: DIAGNOSTIC_PROTOCOL_VERSION,
        trace_ref: "0123456789abcdef0123456789abcdef".into(),
        dropped_events: 0,
        events: vec![
            proto::DiagnosticEvent {
                sequence: 1,
                parent_sequence: 0,
                stage: 1,
                outcome: 2,
                elapsed_millis: 30,
                clock_domain: 1,
                failure_code: 0,
                attempt: 1,
            },
            proto::DiagnosticEvent {
                sequence: 2,
                parent_sequence: 1,
                stage: 2,
                outcome: 2,
                elapsed_millis: 45,
                clock_domain: 1,
                failure_code: 0,
                attempt: 1,
            },
            proto::DiagnosticEvent {
                sequence: 3,
                parent_sequence: 2,
                stage: 3,
                outcome: 3,
                elapsed_millis: 100,
                clock_domain: 2,
                failure_code: 7,
                attempt: 1,
            },
        ],
    }
}

#[test]
fn codec_roundtrips_a_strictly_bounded_trace() {
    let original = sample();
    let bytes = encode_diagnostic_trace(&original).unwrap();
    assert_eq!(decode_diagnostic_trace(&bytes).unwrap(), original);
    assert!(bytes.len() < MAX_DIAGNOSTIC_FRAME_BYTES);
    // Provenance is an ephemeral, non-authorizing opaque reference.
    assert!(!format!("{original:?}").contains("user_turn_id"));
}

#[test]
fn reject_invalid_version_reference_and_missing_events() {
    let mut trace = sample();
    trace.protocol_version = 0;
    assert_eq!(
        encode_diagnostic_trace(&trace),
        Err(DiagnosticWireError::InvalidVersion)
    );
    let mut trace = sample();
    trace.trace_ref = "C:\\Users\\secret\\path".into();
    assert_eq!(
        encode_diagnostic_trace(&trace),
        Err(DiagnosticWireError::InvalidReference)
    );
    let mut trace = sample();
    trace.events.clear();
    assert_eq!(
        encode_diagnostic_trace(&trace),
        Err(DiagnosticWireError::MissingEvents)
    );
}

#[test]
fn reject_unspecified_event_fields_and_invalid_failure_codes() {
    for field in 0..5 {
        let mut trace = sample();
        match field {
            0 => trace.events[1].stage = 0,
            1 => trace.events[1].outcome = 99,
            2 => trace.events[1].clock_domain = 0,
            3 => trace.events[1].failure_code = 3,
            _ => trace.events[1].attempt = 0,
        }
        assert_eq!(
            encode_diagnostic_trace(&trace),
            Err(DiagnosticWireError::InvalidEvent)
        );
    }
    let mut trace = sample();
    trace.events[2].failure_code = 0;
    assert_eq!(
        encode_diagnostic_trace(&trace),
        Err(DiagnosticWireError::InvalidEvent)
    );
}

#[test]
fn reject_reordered_missing_parents_and_forged_cross_clock_timings() {
    let mut trace = sample();
    trace.events[1].sequence = 1;
    assert_eq!(
        encode_diagnostic_trace(&trace),
        Err(DiagnosticWireError::InvalidSequence)
    );
    let mut trace = sample();
    trace.events[1].parent_sequence = 999;
    assert_eq!(
        encode_diagnostic_trace(&trace),
        Err(DiagnosticWireError::InvalidSequence)
    );
    let mut trace = sample();
    trace.events[1].elapsed_millis = 20;
    assert_eq!(
        encode_diagnostic_trace(&trace),
        Err(DiagnosticWireError::InvalidClock)
    );

    let mut trace = sample();
    // Clocks from WebView and host legitimately overlap in absolute numbers.
    trace.events[2].elapsed_millis = 1;
    assert!(encode_diagnostic_trace(&trace).is_ok());
}

#[test]
fn allow_explicitly_recorded_loss_but_never_treat_loss_as_success() {
    let mut trace = sample();
    trace.events.remove(1);
    assert_eq!(
        encode_diagnostic_trace(&trace),
        Err(DiagnosticWireError::InvalidSequence)
    );
    trace.dropped_events = 1;
    assert!(encode_diagnostic_trace(&trace).is_ok());
}

#[test]
fn oversized_and_noncanonical_fields_are_rejected() {
    let mut trace = sample();
    trace.events = vec![trace.events[0].clone(); MAX_DIAGNOSTIC_EVENTS + 1];
    assert_eq!(
        encode_diagnostic_trace(&trace),
        Err(DiagnosticWireError::Oversized)
    );
    assert_eq!(
        decode_diagnostic_trace(&vec![0; MAX_DIAGNOSTIC_FRAME_BYTES + 1]),
        Err(DiagnosticWireError::Oversized)
    );
    let valid = encode_diagnostic_trace(&sample()).unwrap();
    let mut with_unknown = valid.clone();
    with_unknown.extend_from_slice(&[0x98, 0x06, 0x01]);
    assert_eq!(
        decode_diagnostic_trace(&with_unknown),
        Err(DiagnosticWireError::Noncanonical)
    );
    let mut with_duplicate = valid;
    with_duplicate.extend_from_slice(&[0x08, 0x01]);
    assert_eq!(
        decode_diagnostic_trace(&with_duplicate),
        Err(DiagnosticWireError::Noncanonical)
    );
}
