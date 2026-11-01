//! Lu-native inference runtime catalog and selection contracts.
//!
//! A runtime is a versioned, independently verified ENGINE PACKAGE. A compute
//! backend (CPU/Vulkan/HIP/CUDA/...) is one capability of that package, not
//! the application's identity. This registry never executes arbitrary paths,
//! downloads binaries, or accepts model-supplied runtime registrations.
//!
//! The trusted desktop adapter must first verify every complete package and
//! its immutable identity; it then registers the bounded capability record.
//! Selecting a runtime does not mean its GPU or a particular model has passed
//! an inference smoke test. Those are separate runtime observations.

use std::collections::BTreeSet;

pub const MAX_INSTALLED_RUNTIMES: usize = 32;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum RuntimeBackend {
    Cpu,
    Vulkan,
    Hip,
    Cuda,
    Sycl,
    Metal,
}

impl RuntimeBackend {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Cpu => "cpu",
            Self::Vulkan => "vulkan",
            Self::Hip => "hip",
            Self::Cuda => "cuda",
            Self::Sycl => "sycl",
            Self::Metal => "metal",
        }
    }
    pub const fn requires_gpu(self) -> bool {
        !matches!(self, Self::Cpu)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuntimeCapabilities {
    pub text: bool,
    pub vision_projector: bool,
    pub audio: bool,
    pub embeddings: bool,
}

impl RuntimeCapabilities {
    pub const TEXT: Self = Self {
        text: true,
        vision_projector: false,
        audio: false,
        embeddings: false,
    };
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstalledRuntime {
    /// Opaque, host-defined stable identifier. Never a filesystem path.
    pub id: String,
    /// Example: llama.cpp 0.5.0; distinct from backend and Lu version.
    pub version: String,
    pub backend: RuntimeBackend,
    pub platform: String,
    /// Pinned build provenance; the trusted host verifies binary + package.
    pub upstream_revision: String,
    pub capabilities: RuntimeCapabilities,
    pub verified_package: bool,
    /// Only a successfully initialized physical backend may set this.
    pub device_ready: bool,
    /// Only a real inference run may set this; never a static package flag.
    pub inference_verified: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeChoice {
    Automatic,
    Manual(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RuntimeError {
    InvalidId,
    InvalidManifest,
    Duplicate,
    TooMany,
    UnverifiedPackage,
    UnknownRuntime,
    Busy,
    NoCandidate,
    MissingCapability,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeDecision {
    pub id: String,
    pub backend: RuntimeBackend,
    /// Distinguishes runtime selection from successful GPU inference.
    pub physical_inference_verified: bool,
}

pub struct RuntimeRegistry {
    installed: Vec<InstalledRuntime>,
    choice: RuntimeChoice,
}

fn valid_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 96
        && !value.starts_with('.')
        && value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || matches!(byte, b'-' | b'_')
        })
}
fn valid_token(value: &str, max: usize) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'-' | b'_'))
}

impl RuntimeRegistry {
    pub fn new() -> Self {
        Self { installed: Vec::new(), choice: RuntimeChoice::Automatic }
    }
    /// Trusted-only registration after hash and file-identity validation.
    pub fn register(&mut self, runtime: InstalledRuntime) -> Result<(), RuntimeError> {
        if !valid_id(&runtime.id) {
            return Err(RuntimeError::InvalidId);
        }
        if !valid_token(&runtime.version, 60)
            || !valid_token(&runtime.platform, 80)
            || !valid_token(&runtime.upstream_revision, 80)
            || !runtime.capabilities.text
            || (runtime.inference_verified && !runtime.device_ready)
        {
            return Err(RuntimeError::InvalidManifest);
        }
        if !runtime.verified_package {
            return Err(RuntimeError::UnverifiedPackage);
        }
        if self.installed.iter().any(|r| r.id == runtime.id) {
            return Err(RuntimeError::Duplicate);
        }
        if self.installed.len() >= MAX_INSTALLED_RUNTIMES {
            return Err(RuntimeError::TooMany);
        }
        self.installed.push(runtime);
        self.installed.sort_by(|a, b| a.id.cmp(&b.id));
        Ok(())
    }
    pub fn installed(&self) -> &[InstalledRuntime] {
        &self.installed
    }
    pub fn choice(&self) -> &RuntimeChoice {
        &self.choice
    }
    /// The host must first ensure no model/session/worker is active. The
    /// boolean is host-derived, not taken from the WebView or model.
    pub fn set_choice(
        &mut self,
        choice: RuntimeChoice,
        session_active: bool,
    ) -> Result<(), RuntimeError> {
        if session_active {
            return Err(RuntimeError::Busy);
        }
        if let RuntimeChoice::Manual(id) = &choice {
            if !valid_id(id) {
                return Err(RuntimeError::InvalidId);
            }
            if !self.installed.iter().any(|runtime| &runtime.id == id) {
                return Err(RuntimeError::UnknownRuntime);
            }
        }
        self.choice = choice;
        Ok(())
    }
    pub fn select(
        &self,
        required_vision_projector: bool,
        auto_order: &[RuntimeBackend],
    ) -> Result<RuntimeDecision, RuntimeError> {
        let compatible = |r: &&InstalledRuntime| {
            r.verified_package
                && r.capabilities.text
                && (!required_vision_projector || r.capabilities.vision_projector)
        };
        let selected = match &self.choice {
            RuntimeChoice::Manual(id) => {
                let runtime = self.installed.iter().find(|r| &r.id == id)
                    .ok_or(RuntimeError::UnknownRuntime)?;
                if !compatible(&runtime) {
                    return Err(RuntimeError::MissingCapability);
                }
                runtime
            }
            RuntimeChoice::Automatic => {
                let mut uniq = BTreeSet::new();
                if !auto_order.iter().all(|item| uniq.insert(*item)) {
                    return Err(RuntimeError::InvalidManifest);
                }
                // Prefer physically initialized GPU backends. A packaged GPU
                // binary alone does not warrant an automatic GPU selection.
                let mut candidate = None;
                for backend in auto_order {
                    candidate = self.installed.iter()
                        .filter(compatible)
                        .filter(|r| r.backend == *backend)
                        .filter(|r| !backend.requires_gpu() || r.device_ready)
                        .max_by(|a, b| a.version.cmp(&b.version));
                    if candidate.is_some() { break; }
                }
                candidate.ok_or(RuntimeError::NoCandidate)?
            }
        };
        Ok(RuntimeDecision {
            id: selected.id.clone(),
            backend: selected.backend,
            physical_inference_verified: selected.inference_verified,
        })
    }
}
impl Default for RuntimeRegistry {
    fn default() -> Self { Self::new() }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn runtime(id: &str, backend: RuntimeBackend) -> InstalledRuntime {
        InstalledRuntime {
            id: id.into(), version: "0.5.0".into(), backend,
            platform: "x86_64-pc-windows-msvc".into(),
            upstream_revision: "7fe450e19305b828c199d602c23a8337aaa1f03b".into(),
            capabilities: RuntimeCapabilities::TEXT,
            verified_package: true,
            device_ready: !backend.requires_gpu(),
            inference_verified: false,
        }
    }

    #[test]
    fn multiple_backends_and_versions_coexist() {
        let mut registry = RuntimeRegistry::new();
        registry.register(runtime("llama-cpu-v050", RuntimeBackend::Cpu)).unwrap();
        registry.register(runtime("llama-vulkan-v050", RuntimeBackend::Vulkan)).unwrap();
        registry.register(InstalledRuntime {
            version: "0.6.0".into(),
            ..runtime("llama-vulkan-v060", RuntimeBackend::Vulkan)
        }).unwrap();
        assert_eq!(registry.installed().len(), 3);
        registry.set_choice(RuntimeChoice::Manual("llama-vulkan-v060".into()), false).unwrap();
        assert_eq!(registry.select(false, &[]).unwrap().id, "llama-vulkan-v060");
    }
    #[test]
    fn automatic_falls_back_to_verified_cpu_before_gpu_device_probe() {
        let mut registry = RuntimeRegistry::new();
        registry.register(runtime("cpu", RuntimeBackend::Cpu)).unwrap();
        registry.register(runtime("vk", RuntimeBackend::Vulkan)).unwrap();
        let order = [RuntimeBackend::Vulkan, RuntimeBackend::Cuda, RuntimeBackend::Cpu];
        assert_eq!(registry.select(false, &order).unwrap().backend, RuntimeBackend::Cpu);
        let mut ready = runtime("vk2", RuntimeBackend::Vulkan);
        ready.device_ready = true;
        registry.register(ready).unwrap();
        let decision = registry.select(false, &order).unwrap();
        assert_eq!(decision.backend, RuntimeBackend::Vulkan);
        assert!(!decision.physical_inference_verified);
    }
    #[test]
    fn explicit_choice_never_silently_falls_back() {
        let mut registry = RuntimeRegistry::new();
        registry.register(runtime("cpu", RuntimeBackend::Cpu)).unwrap();
        registry.register(runtime("cuda", RuntimeBackend::Cuda)).unwrap();
        registry.set_choice(RuntimeChoice::Manual("cuda".into()), false).unwrap();
        assert_eq!(registry.select(false, &[]).unwrap().id, "cuda");
    }
    #[test]
    fn switching_blocked_during_active_session_and_unknown_id_rejected() {
        let mut registry = RuntimeRegistry::new();
        registry.register(runtime("cpu", RuntimeBackend::Cpu)).unwrap();
        assert_eq!(registry.set_choice(RuntimeChoice::Manual("cpu".into()), true), Err(RuntimeError::Busy));
        assert_eq!(registry.set_choice(RuntimeChoice::Manual("../bad".into()), false), Err(RuntimeError::InvalidId));
        assert_eq!(registry.set_choice(RuntimeChoice::Manual("not-registered".into()), false), Err(RuntimeError::UnknownRuntime));
    }
    #[test]
    fn never_claims_unverified_or_nonexistent_package() {
        let mut registry = RuntimeRegistry::new();
        let mut value = runtime("fake", RuntimeBackend::Vulkan);
        value.verified_package = false;
        assert_eq!(registry.register(value), Err(RuntimeError::UnverifiedPackage));
        assert_eq!(registry.select(false, &[RuntimeBackend::Cpu]), Err(RuntimeError::NoCandidate));
        let mut contradictory = runtime("contradictory", RuntimeBackend::Vulkan);
        contradictory.inference_verified = true;
        assert_eq!(registry.register(contradictory), Err(RuntimeError::InvalidManifest));
    }
    #[test]
    fn projector_requires_explicit_runtime_capability() {
        let mut registry = RuntimeRegistry::new();
        registry.register(runtime("cpu", RuntimeBackend::Cpu)).unwrap();
        registry.set_choice(RuntimeChoice::Manual("cpu".into()), false).unwrap();
        assert_eq!(registry.select(true, &[]), Err(RuntimeError::MissingCapability));
    }
    #[test]
    fn static_runtime_identity_is_safe_not_a_path() {
        let mut registry = RuntimeRegistry::new();
        assert_eq!(registry.register(runtime("../vulkan", RuntimeBackend::Vulkan)), Err(RuntimeError::InvalidId));
        assert_eq!(registry.register(runtime("C:\\evil", RuntimeBackend::Vulkan)), Err(RuntimeError::InvalidId));
        registry.register(runtime("vulkan-v050", RuntimeBackend::Vulkan)).unwrap();
        assert_eq!(registry.register(runtime("vulkan-v050", RuntimeBackend::Vulkan)), Err(RuntimeError::Duplicate));
    }
}
