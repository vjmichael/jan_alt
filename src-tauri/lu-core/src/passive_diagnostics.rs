//! Content-free diagnostic checkpoints for an already authorized Lu operation.
//! Never store user text, identifiers, file paths, model output, or raw errors.
//! This is an in-memory ring, NOT an active repair/benchmarking agent.
use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Mutex,
    },
    time::Instant,
};

pub const MAX_PASSIVE_EVENTS: usize = 64;

/// The exhaustive, compiled-in vocabulary prevents model/external data from
/// becoming diagnostics. Stage codes describe observation, not authorization.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NativeStage {
    TurnReceived,
    RecoveryReady,
    RecoveryUnavailable,
    SessionReady,
    SessionRejected,
    SavedUserAttested,
    SavedUserRejected,
    TurnRegistered,
    TurnBusy,
    WorkerEntered,
    TaskAuthorized,
    ModelLoopEntered,
    ModelLoopReturned,
    TurnSucceeded,
    TurnFailed,
    CancelSignalled,
}
impl NativeStage {
    pub fn code(self) -> &'static str {
        match self {
            Self::TurnReceived => "native-turn-received",
            Self::RecoveryReady => "recovery-ready",
            Self::RecoveryUnavailable => "recovery-unavailable",
            Self::SessionReady => "native-session-ready",
            Self::SessionRejected => "native-session-rejected",
            Self::SavedUserAttested => "saved-user-attested",
            Self::SavedUserRejected => "saved-user-rejected",
            Self::TurnRegistered => "native-turn-registered",
            Self::TurnBusy => "native-turn-busy",
            Self::WorkerEntered => "native-worker-entered",
            Self::TaskAuthorized => "native-task-authorized",
            Self::ModelLoopEntered => "native-model-loop-entered",
            Self::ModelLoopReturned => "native-model-loop-returned",
            Self::TurnSucceeded => "native-turn-succeeded",
            Self::TurnFailed => "native-turn-failed",
            Self::CancelSignalled => "native-cancel-signalled",
        }
    }
}

/// Safe to show to a verified main WebView only. No operation identifiers.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PassiveEvent {
    pub sequence: u64,
    pub elapsed_millis: u64,
    pub stage: &'static str,
}

#[derive(Debug)]
pub struct PassiveDiagnostics {
    started: Instant,
    sequence: u64,
    events: VecDeque<PassiveEvent>,
}
impl Default for PassiveDiagnostics {
    fn default() -> Self {
        Self {
            started: Instant::now(),
            sequence: 0,
            events: VecDeque::with_capacity(MAX_PASSIVE_EVENTS),
        }
    }
}
impl PassiveDiagnostics {
    /// The caller should use try_lock: these breadcrumbs must never delay
    /// inference, cancellation, authorization or worker shutdown.
    pub fn record(&mut self, stage: NativeStage) {
        self.sequence = self.sequence.saturating_add(1);
        if self.events.len() == MAX_PASSIVE_EVENTS {
            self.events.pop_front();
        }
        self.events.push_back(PassiveEvent {
            sequence: self.sequence,
            elapsed_millis: self
                .started
                .elapsed()
                .as_millis()
                .try_into()
                .unwrap_or(u64::MAX),
            stage: stage.code(),
        });
    }

    pub fn snapshot(&self) -> Vec<PassiveEvent> {
        self.events.iter().cloned().collect()
    }
}

/// Redacted host-only snapshot for the trusted primary Lu WebView.
/// The random host trace reference is correlation metadata, NOT authority.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PassiveTraceSnapshot {
    pub schema: &'static str,
    pub trace_ref: Option<String>,
    // Accepted turn, no admitted turn, or a lock-race with no reliable trace.
    pub recording_state: &'static str,
    pub clock_domain: &'static str,
    pub dropped_events: u64,
    pub events: Vec<PassiveEvent>,
}

#[derive(Debug, Default)]
struct HostTraceState {
    active_ref: Option<String>,
    records: PassiveDiagnostics,
    overwritten_events: u64,
    // A native turn has exactly one terminal outcome. A later same-turn
    // observation invalidates certainty instead of rewriting success.
    terminal_recorded: bool,
}

/// A nonblocking, single-active-turn diagnostic ledger, separate from the
/// generation/worker mutex. Stale observations from earlier turns are ignored.
/// Successful IPC receipt does not imply a saved or rendered assistant answer.
#[derive(Debug, Default)]
pub struct PassiveTraceJournal {
    inner: Mutex<HostTraceState>,
    // If an event cannot acquire the independent trace mutex, account for
    // evidence loss without blocking generation, cancellation, or revocation.
    contention_losses: AtomicU64,
    // Set without acquiring the collector mutex when start observation
    // fails. Prevents any earlier accepted turn being misreported as latest.
    unobserved_admission: AtomicBool,
}

impl PassiveTraceJournal {
    /// The caller MUST supply a fresh host-minted v4 UUID in 32-hex form.
    /// This does not authenticate a user, task, permission, or model action.
    pub fn begin(&self, trace_ref: &str) -> bool {
        if trace_ref.len() != 32
            || !trace_ref
                .bytes()
                .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
        {
            return false;
        }
        let Ok(mut trace) = self.inner.try_lock() else {
            self.unobserved_admission.store(true, Ordering::Release);
            self.contention_losses.fetch_add(1, Ordering::Relaxed);
            return false;
        };
        // Clear stale losses BEFORE publishing the newly admitted trace,
        // without blocking inference callbacks that may contend.
        self.contention_losses.store(0, Ordering::Relaxed);
        trace.active_ref = Some(trace_ref.to_owned());
        trace.records = PassiveDiagnostics::default();
        trace.overwritten_events = 0;
        trace.terminal_recorded = false;
        self.unobserved_admission.store(false, Ordering::Release);
        true
    }

    /// Record only stages belonging to this live host-minted trace.
    /// This is best effort; it never runs a model or changes authorization.
    pub fn record(&self, trace_ref: &str, stage: NativeStage) {
        let Ok(mut trace) = self.inner.try_lock() else {
            self.contention_losses.fetch_add(1, Ordering::Relaxed);
            return;
        };
        if trace.active_ref.as_deref() != Some(trace_ref) {
            return;
        }
        if trace.terminal_recorded {
            // Preserve the first final result, but explicitly mark its
            // evidence compromised. The interpreter must return
            // insufficient_evidence instead of an apparent success.
            trace.overwritten_events = trace.overwritten_events.saturating_add(1);
            return;
        }
        if matches!(stage, NativeStage::TurnSucceeded | NativeStage::TurnFailed) {
            trace.terminal_recorded = true;
        }
        if trace.records.events.len() == MAX_PASSIVE_EVENTS {
            trace.overwritten_events = trace.overwritten_events.saturating_add(1);
        }
        trace.records.record(stage);
    }

    /// Only call after the host validated this cancellation belongs to the
    /// currently running turn; a model cannot use this to stop a task.
    pub fn record_current_cancel(&self) {
        let Ok(mut trace) = self.inner.try_lock() else {
            self.contention_losses.fetch_add(1, Ordering::Relaxed);
            return;
        };
        if trace.active_ref.is_none() {
            return;
        }
        if trace.terminal_recorded {
            // A late cancellation is not proof that a completed task was
            // cancelled. Mark the trace incomplete rather than changing it.
            trace.overwritten_events = trace.overwritten_events.saturating_add(1);
            return;
        }
        if trace.records.events.len() == MAX_PASSIVE_EVENTS {
            trace.overwritten_events = trace.overwritten_events.saturating_add(1);
        }
        trace.records.record(NativeStage::CancelSignalled);
    }

    /// Privacy-preserving snapshot: contains no model output, file path,
    /// thread/message ID or raw exception string. Absent lock = unavailable,
    /// not a forged empty trace or evidence that generation never started.
    pub fn snapshot(&self) -> Option<PassiveTraceSnapshot> {
        // The last accepted ring is NOT evidence for a newer admission whose
        // trace initialization failed. Make this explicit, even if the old
        // mutex contents are readable again by the time of export.
        if self.unobserved_admission.load(Ordering::Acquire) {
            return Some(PassiveTraceSnapshot {
                schema: "lu.native.host-trace.v2",
                trace_ref: None,
                recording_state: "admission_unobserved",
                clock_domain: "host",
                dropped_events: self.contention_losses.load(Ordering::Relaxed).max(1),
                events: Vec::new(),
            });
        }
        let trace = self.inner.try_lock().ok()?;
        Some(PassiveTraceSnapshot {
            schema: "lu.native.host-trace.v2",
            trace_ref: trace.active_ref.clone(),
            recording_state: if trace.active_ref.is_some() {
                "accepted_turn"
            } else {
                "no_accepted_turn"
            },
            clock_domain: "host",
            dropped_events: trace
                .overwritten_events
                .saturating_add(self.contention_losses.load(Ordering::Relaxed)),
            events: trace.records.snapshot(),
        })
    }
}

#[cfg(test)]
mod journal_internal_tests {
    use super::*;

    #[test]
    fn conflicting_terminal_does_not_forge_host_success_or_hide_evidence_loss() {
        use crate::passive_localization::localize_passive_host_trace;

        let journal = PassiveTraceJournal::default();
        let trace = "0123456789abcdef0123456789abcdef";
        assert!(journal.begin(trace));
        journal.record(trace, NativeStage::ModelLoopEntered);
        journal.record(trace, NativeStage::ModelLoopReturned);
        journal.record(trace, NativeStage::TurnSucceeded);
        let first = journal.snapshot().unwrap();
        assert_eq!(first.dropped_events, 0);
        assert_eq!(
            localize_passive_host_trace(&first).status,
            "host_turn_returned"
        );

        // A duplicate, contradictory or out-of-order checkpoint from the
        // same accepted turn must invalidate confidence in that snapshot.
        journal.record(trace, NativeStage::TurnFailed);
        let after = journal.snapshot().unwrap();
        assert_eq!(after.dropped_events, 1);
        assert_eq!(after.events.len(), first.events.len());
        assert_eq!(
            localize_passive_host_trace(&after).status,
            "insufficient_evidence"
        );
        journal.record_current_cancel();
        assert_eq!(journal.snapshot().unwrap().dropped_events, 2);
    }

    #[test]
    fn terminal_guard_resets_on_fresh_host_admission_but_ignores_stale_turn() {
        use crate::passive_localization::localize_passive_host_trace;

        let journal = PassiveTraceJournal::default();
        let a = "0123456789abcdef0123456789abcdef";
        let b = "fedcba9876543210fedcba9876543210";
        assert!(journal.begin(a));
        journal.record(a, NativeStage::TurnFailed);
        assert!(journal.begin(b));
        journal.record(a, NativeStage::TurnSucceeded);
        journal.record(b, NativeStage::ModelLoopEntered);
        journal.record(b, NativeStage::TurnFailed);
        let snapshot = journal.snapshot().unwrap();
        assert_eq!(snapshot.dropped_events, 0);
        assert_eq!(snapshot.events.len(), 2);
        assert_eq!(
            localize_passive_host_trace(&snapshot).status,
            "bounded_host_boundary"
        );
    }

    #[test]
    fn admission_lock_race_cannot_expose_stale_accepted_turn_evidence() {
        let journal = PassiveTraceJournal::default();
        assert!(journal.begin("0123456789abcdef0123456789abcdef"));
        journal.record(
            "0123456789abcdef0123456789abcdef",
            NativeStage::ModelLoopReturned,
        );
        let locked = journal.inner.lock().unwrap();
        assert!(!journal.begin("fedcba9876543210fedcba9876543210"));
        drop(locked);

        let snapshot = journal.snapshot().unwrap();
        assert_eq!(snapshot.recording_state, "admission_unobserved");
        assert_eq!(snapshot.trace_ref, None);
        assert!(snapshot.events.is_empty());
        assert!(snapshot.dropped_events > 0);

        assert!(journal.begin("fedcba9876543210fedcba9876543210"));
        journal.record(
            "fedcba9876543210fedcba9876543210",
            NativeStage::TurnReceived,
        );
        let snapshot = journal.snapshot().unwrap();
        assert_eq!(snapshot.recording_state, "accepted_turn");
        assert_eq!(
            snapshot.trace_ref.as_deref(),
            Some("fedcba9876543210fedcba9876543210")
        );
        assert_eq!(snapshot.dropped_events, 0);
        assert_eq!(snapshot.events.len(), 1);
    }
}
