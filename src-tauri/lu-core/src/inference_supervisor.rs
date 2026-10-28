//! Host-owned single-model inference supervisor (P3).
//! Caller must supply a trusted engine factory, approved model handles, and
//! host-minted IDs. No model-controlled path or executable is accepted here.
use crate::{
    inference_bridge::{BridgeError, InferenceBridge},
    inference_host::{Cancellation, EnginePhase, InferenceBackend},
    inference_wire::{validate_frame, INFERENCE_PROTOCOL_VERSION},
    model_admission::AdmittedModel,
    wire::proto,
};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};

#[derive(Debug, PartialEq, Eq)]
pub enum SupervisorError {
    Unavailable,
    Busy,
    UnknownModel,
    WrongSession,
    WrongGeneration,
    InvalidRequest,
    Poisoned,
    Backend,
    Bridge(BridgeError),
}
impl From<BridgeError> for SupervisorError {
    fn from(value: BridgeError) -> Self { Self::Bridge(value) }
}
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SupervisorStatus {
    pub session_id: Option<String>,
    pub model_ref: Option<String>,
    pub generation_id: Option<String>,
    pub phase: EnginePhase,
    pub pid: Option<u32>,
}
struct Active {
    generation_id: String,
    cancellation: Cancellation,
}
struct SessionControl {
    active: Option<Active>,
    closing: bool,
}
struct Session<B: InferenceBackend> {
    session_id: String,
    model_ref: String,
    pid: Option<u32>,
    engine: Mutex<InferenceBridge<B>>,
    control: Mutex<SessionControl>,
}
/// Always release a generation reservation on return or panic; never leave
/// the session permanently busy after an engine worker fails.
struct GenerationCleanup<B: InferenceBackend> {
    session: Arc<Session<B>>,
    generation_id: String,
}
impl<B: InferenceBackend> Drop for GenerationCleanup<B> {
    fn drop(&mut self) {
        if let Ok(mut control) = self.session.control.lock() {
            if control.active.as_ref().is_some_and(|a| a.generation_id == self.generation_id) {
                control.active = None;
            }
        }
    }
}

/// All work that might block on the model belongs on a host-owned worker
/// thread. Cancellation reads only the small session-control mutex and can
/// therefore interrupt a running generate call without waiting for the engine.
pub struct TrustedInferenceSupervisor<B: InferenceBackend + Send + 'static> {
    backend_id: String,
    context_tokens: u32,
    models: HashMap<String, AdmittedModel>,
    factory: Arc<dyn Fn() -> Result<B, String> + Send + Sync>,
    current: Mutex<Option<Arc<Session<B>>>>,
}
impl<B: InferenceBackend + Send + 'static> TrustedInferenceSupervisor<B> {
    pub fn new(
        backend_id: String,
        context_tokens: u32,
        models: Vec<(String, AdmittedModel)>,
        factory: impl Fn() -> Result<B, String> + Send + Sync + 'static,
    ) -> Result<Self, SupervisorError> {
        if models.is_empty() || models.len() > 64 || context_tokens < 256 {
            return Err(SupervisorError::InvalidRequest);
        }
        let mut catalog = HashMap::new();
        for (id, model) in models {
            let frame = Self::frame("catalog-check", proto::inference_frame::Body::Load(
                proto::InferenceLoadRequest {
                    model_ref: id.clone(), backend_id: backend_id.clone(),
                    projector_ref: None, context_tokens,
                },
            ));
            validate_frame(&frame).map_err(|_| SupervisorError::InvalidRequest)?;
            if catalog.insert(id, model).is_some() {
                return Err(SupervisorError::InvalidRequest);
            }
        }
        Ok(Self {
            backend_id, context_tokens, models: catalog,
            factory: Arc::new(factory), current: Mutex::new(None),
        })
    }
    fn frame(request_id: &str, body: proto::inference_frame::Body) -> proto::InferenceFrame {
        proto::InferenceFrame {
            protocol_version: INFERENCE_PROTOCOL_VERSION,
            request_id: request_id.into(),
            body: Some(body),
        }
    }
    pub fn model_ids(&self) -> Vec<String> {
        let mut ids: Vec<_> = self.models.keys().cloned().collect();
        ids.sort();
        ids
    }
    fn session(&self, session_id: &str) -> Result<Arc<Session<B>>, SupervisorError> {
        let guard = self.current.lock().map_err(|_| SupervisorError::Poisoned)?;
        let session = guard.as_ref().ok_or(SupervisorError::Unavailable)?;
        if session.session_id != session_id {
            return Err(SupervisorError::WrongSession);
        }
        Ok(Arc::clone(session))
    }
    pub fn load(
        &self, model_ref: &str, session_id: String, request_id: &str,
    ) -> Result<Vec<u8>, SupervisorError> {
        let model = self.models.get(model_ref).ok_or(SupervisorError::UnknownModel)?;
        let mut current = self.current.lock().map_err(|_| SupervisorError::Poisoned)?;
        if current.is_some() { return Err(SupervisorError::Busy); }
        let backend = (self.factory)().map_err(|_| SupervisorError::Backend)?;
        let mut engine = InferenceBridge::new(
            backend, session_id.clone(), self.backend_id.clone(), self.context_tokens,
        )?;
        let request = Self::frame(request_id, proto::inference_frame::Body::Load(
            proto::InferenceLoadRequest {
                model_ref: model_ref.into(), backend_id: self.backend_id.clone(),
                projector_ref: None, context_tokens: self.context_tokens,
            },
        ));
        let frame = engine.load(&request, model_ref, model)?;
        let pid = engine.process_id();
        *current = Some(Arc::new(Session {
            session_id, model_ref: model_ref.into(), pid,
            engine: Mutex::new(engine),
            control: Mutex::new(SessionControl { active: None, closing: false }),
        }));
        Ok(frame)
    }
    /// Reserves exactly one host generation before returning a job ID to UI.
    /// Cancellation can be requested immediately, even before worker startup.
    pub fn reserve_generation(
        &self, session_id: &str, generation_id: &str, request_id: &str,
        prompt: &str, max_new_tokens: u32,
    ) -> Result<(), SupervisorError> {
        let session = self.session(session_id)?;
        let frame = Self::frame(request_id, proto::inference_frame::Body::Generate(
            proto::InferenceGenerateRequest {
                session_id: session_id.into(), generation_id: generation_id.into(),
                prompt: prompt.into(), max_new_tokens,
            },
        ));
        validate_frame(&frame).map_err(|_| SupervisorError::InvalidRequest)?;
        let mut control = session.control.lock().map_err(|_| SupervisorError::Poisoned)?;
        if control.closing || control.active.is_some() { return Err(SupervisorError::Busy); }
        control.active = Some(Active {
            generation_id: generation_id.into(),
            cancellation: Cancellation::default(),
        });
        Ok(())
    }
    /// Called on a blocking worker after reservation. Does not acquire a model
    /// lock for cancellation. The cleanup guard also handles a backend panic.
    pub fn run_reserved(
        &self, session_id: &str, generation_id: &str, request_id: &str,
        prompt: String, max_new_tokens: u32,
        emit: impl FnMut(Vec<u8>) -> Result<(), BridgeError>,
    ) -> Result<(), SupervisorError> {
        let session = self.session(session_id)?;
        let frame = Self::frame(request_id, proto::inference_frame::Body::Generate(
            proto::InferenceGenerateRequest {
                session_id: session_id.into(), generation_id: generation_id.into(),
                prompt, max_new_tokens,
            },
        ));
        validate_frame(&frame).map_err(|_| SupervisorError::InvalidRequest)?;
        let cancellation = {
            let control = session.control.lock().map_err(|_| SupervisorError::Poisoned)?;
            let active = control.active.as_ref().ok_or(SupervisorError::WrongGeneration)?;
            if active.generation_id != generation_id {
                return Err(SupervisorError::WrongGeneration);
            }
            active.cancellation.clone()
        };
        let _cleanup = GenerationCleanup {
            session: Arc::clone(&session), generation_id: generation_id.into(),
        };
        // Never hold session control while the actual inference runs.
        match session.engine.lock() {
            Ok(mut engine) => engine.generate(&frame, cancellation, emit).map_err(Into::into),
            Err(_) => Err(SupervisorError::Poisoned),
        }
    }
    pub fn generate(
        &self,
        session_id: &str, generation_id: String, request_id: &str,
        prompt: String, max_new_tokens: u32,
        emit: impl FnMut(Vec<u8>) -> Result<(), BridgeError>,
    ) -> Result<(), SupervisorError> {
        self.reserve_generation(session_id, &generation_id, request_id, &prompt, max_new_tokens)?;
        self.run_reserved(session_id, &generation_id, request_id, prompt, max_new_tokens, emit)
    }
    pub fn cancel(
        &self, session_id: &str, generation_id: &str, request_id: &str,
    ) -> Result<(), SupervisorError> {
        let session = self.session(session_id)?;
        let control = session.control.lock().map_err(|_| SupervisorError::Poisoned)?;
        let active = control.active.as_ref().ok_or(SupervisorError::WrongGeneration)?;
        let request = Self::frame(request_id, proto::inference_frame::Body::Cancel(
            proto::InferenceCancelRequest {
                session_id: session_id.into(), generation_id: generation_id.into(),
            },
        ));
        InferenceBridge::<B>::signal_cancel(
            &request, session_id, &active.generation_id, &active.cancellation,
        )?;
        Ok(())
    }
    pub fn unload(&self, session_id: &str, request_id: &str)
        -> Result<Vec<u8>, SupervisorError> {
        let mut current = self.current.lock().map_err(|_| SupervisorError::Poisoned)?;
        let session = current.as_ref().ok_or(SupervisorError::Unavailable)?;
        if session.session_id != session_id { return Err(SupervisorError::WrongSession); }
        {
            let mut control = session.control.lock().map_err(|_| SupervisorError::Poisoned)?;
            if control.closing || control.active.is_some() { return Err(SupervisorError::Busy); }
            control.closing = true;
        }
        let frame = Self::frame(request_id, proto::inference_frame::Body::Unload(
            proto::InferenceUnloadRequest { session_id: session_id.into() },
        ));
        let result = session.engine.lock()
            .map_err(|_| SupervisorError::Poisoned)?
            .unload(&frame).map_err(SupervisorError::Bridge);
        if result.is_ok() {
            *current = None;
        } else if let Ok(mut control) = session.control.lock() {
            control.closing = false;
        }
        result
    }
    pub fn status(&self) -> Result<SupervisorStatus, SupervisorError> {
        let current = self.current.lock().map_err(|_| SupervisorError::Poisoned)?;
        let Some(session) = current.as_ref() else {
            return Ok(SupervisorStatus {
                session_id: None, model_ref: None, generation_id: None,
                phase: EnginePhase::Idle, pid: None,
            });
        };
        let control = session.control.lock().map_err(|_| SupervisorError::Poisoned)?;
        Ok(SupervisorStatus {
            session_id: Some(session.session_id.clone()),
            model_ref: Some(session.model_ref.clone()),
            generation_id: control.active.as_ref().map(|a| a.generation_id.clone()),
            phase: if control.active.is_some() { EnginePhase::Generating } else {
                EnginePhase::Ready
            },
            pid: session.pid,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference_host::{GenerationRequest, TokenChunk, EngineError};
    use crate::model_admission::ModelAdmissionManager;
    use std::{fs, io::Write};

    struct FakeBackend;
    impl InferenceBackend for FakeBackend {
        fn load(&mut self, _: &AdmittedModel) -> Result<(), String> { Ok(()) }
        fn unload(&mut self) {}
        fn generate(&mut self, _: &GenerationRequest, cancel: &Cancellation,
            emit: &mut dyn FnMut(TokenChunk) -> Result<(), EngineError>) -> Result<(), String> {
            emit(TokenChunk { text: "token".into(), index: 0 }).map_err(|e| format!("{e:?}"))?;
            if cancel.is_cancelled() { return Err("cancelled".into()); }
            Ok(())
        }
    }
    #[test]
    fn authorized_model_and_cancellation_without_deadlock() {
        let directory = std::env::temp_dir().join(format!("lu-supervisor-{}-{:?}",
            std::process::id(), std::thread::current().id()));
        fs::create_dir_all(&directory).unwrap();
        let mut file = fs::File::create(directory.join("model.gguf")).unwrap();
        file.write_all(b"GGUF").unwrap();
        file.write_all(&3u32.to_le_bytes()).unwrap();
        file.write_all(&1u64.to_le_bytes()).unwrap();
        file.write_all(&1u64.to_le_bytes()).unwrap();
        drop(file);
        let mut admission = ModelAdmissionManager::new();
        let model = admission.admit(&directory, "model.gguf").unwrap().clone();
        let supervisor = Arc::new(TrustedInferenceSupervisor::new(
            "llama-cpu".into(), 512, vec![("model-1".into(), model)],
            || Ok(FakeBackend),
        ).unwrap());
        assert_eq!(supervisor.load("not-a-model", "s-1".into(), "load-0"),
            Err(SupervisorError::UnknownModel));
        supervisor.load("model-1", "s-1".into(), "load-1").unwrap();
        assert_eq!(supervisor.load("model-1", "s-2".into(), "load-2"),
            Err(SupervisorError::Busy));
        let ctrl = Arc::clone(&supervisor);
        let result = supervisor.generate(
            "s-1", "g-1".into(), "gen-1", "hello".into(), 32,
            move |_frame| {
                // Exercised synchronously while the engine mutex is locked.
                ctrl.cancel("s-1", "g-1", "cancel-1")
                    .map_err(|_| BridgeError::Consumer)
            },
        );
        assert!(result.is_err());
        assert_eq!(supervisor.status().unwrap().phase, EnginePhase::Ready);
        // Immediate reservation exposes the active generation to cancellation
        // before a worker has even acquired the inference engine mutex.
        supervisor.reserve_generation("s-1", "g-2", "gen-2", "hello", 32).unwrap();
        assert_eq!(supervisor.cancel("s-1", "g-nope", "cancel-bad"),
            Err(SupervisorError::Bridge(BridgeError::UnauthorizedGeneration)));
        supervisor.cancel("s-1", "g-2", "cancel-2").unwrap();
        assert!(supervisor.run_reserved("s-1", "g-2", "gen-2", "hello".into(), 32,
            |_| Ok(())).is_err());

        assert_eq!(supervisor.unload("wrong", "unload-0"),
            Err(SupervisorError::WrongSession));
        supervisor.unload("s-1", "unload-1").unwrap();
        assert_eq!(supervisor.status().unwrap().phase, EnginePhase::Idle);
        fs::remove_dir_all(directory).unwrap();
    }
}
