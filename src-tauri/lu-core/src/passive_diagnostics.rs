//! Content-free diagnostic checkpoints for an already authorized Lu operation.
//! Never store user text, identifiers, file paths, model output, or raw errors.
//! This is an in-memory ring, NOT an active repair/benchmarking agent.
use serde::Serialize;
use std::{
    collections::VecDeque,
    sync::{
        atomic::{AtomicU64, Ordering},
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
    pub clock_domain: &'static str,
    pub dropped_events: u64,
    pub events: Vec<PassiveEvent>,
}

#[derive(Debug, Default)]
struct HostTraceState {
    active_ref: Option<String>,
    records: PassiveDiagnostics,
    overwritten_events: u64,
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
            self.contention_losses.fetch_add(1, Ordering::Relaxed);
            return false;
        };
        trace.active_ref = Some(trace_ref.to_owned());
        trace.records = PassiveDiagnostics::default();
        trace.overwritten_events = 0;
        self.contention_losses.store(0, Ordering::Relaxed);
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
        if trace.records.events.len() == MAX_PASSIVE_EVENTS {
            trace.overwritten_events = trace.overwritten_events.saturating_add(1);
        }
        trace.records.record(NativeStage::CancelSignalled);
    }

    /// Privacy-preserving snapshot: contains no model output, file path,
    /// thread/message ID or raw exception string. Absent lock = unavailable,
    /// not a forged empty trace or evidence that generation never started.
    pub fn snapshot(&self) -> Option<PassiveTraceSnapshot> {
        let trace = self.inner.try_lock().ok()?;
        Some(PassiveTraceSnapshot {
            schema: "lu.native.host-trace.v2",
            trace_ref: trace.active_ref.clone(),
            clock_domain: "host",
            dropped_events: trace
                .overwritten_events
                .saturating_add(self.contention_losses.load(Ordering::Relaxed)),
            events: trace.records.snapshot(),
        })
    }
}
