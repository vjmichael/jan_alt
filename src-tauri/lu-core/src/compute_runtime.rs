//! Model-neutral inference backend selection contract.
//! The OS GPU driver is always outside Lu's managed package boundary.
//! Driver probes and binary signatures must be implemented by trusted adapters.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum ComputeBackend {
    Cpu,
    Vulkan,
    Rocm,
    Cuda,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendProbe {
    pub backend: ComputeBackend,
    pub package_present: bool,
    pub driver_compatible: bool,
    pub model_compatible: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackendPreference {
    Automatic,
    Require(ComputeBackend),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SelectionError {
    NoCompatibleBackend,
    RequestedBackendUnavailable(ComputeBackend),
    DuplicateProbe(ComputeBackend),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackendSelection {
    pub backend: ComputeBackend,
    pub reason: &'static str,
}

impl BackendProbe {
    pub fn ready(&self) -> bool {
        self.package_present && self.driver_compatible && self.model_compatible
    }
}

/// This orders *compatible* backends only. It is NOT a performance ranking;
/// a future measured preference can override it after controlled benchmarks.
/// It never executes or downloads a package, installs a driver, or silently
/// degrades a strictly required backend to another backend.
pub fn select_backend(
    probes: &[BackendProbe],
    preference: BackendPreference,
    auto_order: &[ComputeBackend],
) -> Result<BackendSelection, SelectionError> {
    let mut observed = std::collections::BTreeMap::new();
    for probe in probes {
        if observed.insert(probe.backend, probe).is_some() {
            return Err(SelectionError::DuplicateProbe(probe.backend));
        }
    }
    match preference {
        BackendPreference::Require(backend) => {
            if observed.get(&backend).is_some_and(|probe| probe.ready()) {
                Ok(BackendSelection { backend, reason: "explicitly selected compatible backend" })
            } else {
                Err(SelectionError::RequestedBackendUnavailable(backend))
            }
        }
        BackendPreference::Automatic => {
            for backend in auto_order {
                if observed.get(backend).is_some_and(|probe| probe.ready()) {
                    return Ok(BackendSelection { backend: *backend, reason: "first compatible backend in configured order" });
                }
            }
            Err(SelectionError::NoCompatibleBackend)
        }
    }
}
