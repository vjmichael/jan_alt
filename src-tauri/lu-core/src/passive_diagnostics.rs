//! Content-free diagnostic checkpoints for an already authorized Lu operation.
//! Never store user text, identifiers, file paths, model output, or raw errors.
//! This is an in-memory ring, NOT an active repair/benchmarking agent.
use serde::Serialize;
use std::{collections::VecDeque, time::Instant};

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
            elapsed_millis: self.started.elapsed().as_millis().try_into().unwrap_or(u64::MAX),
            stage: stage.code(),
        });
    }

    pub fn snapshot(&self) -> Vec<PassiveEvent> {
        self.events.iter().cloned().collect()
    }
}
