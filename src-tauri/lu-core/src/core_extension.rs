//! Optional Lu-native Core Extensions (CEs), separate from full DLC Workspaces.
//!
//! This is a trusted-host lifecycle boundary, NOT an untrusted package loader.
//! Installing code, verifying signatures, dependency resolution, worker isolation,
//! and cancelling in-flight tool calls are deliberately not implemented here.
//! Registering a CE does not grant the model permission to call its tools.

use std::sync::Arc;

use crate::{
    contracts::{ModuleKind, ModuleManifest, NativeTool},
    registry::{NativeToolRegistry, RegistryError},
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CoreExtensionError {
    NotCoreExtensionModule,
    Registry(RegistryError),
}

/// A separately managed set of optional native capabilities. A CE can supply
/// tools to ordinary Lu chat and to Workspaces, subject to the same host policy.
/// The vanilla Lu Core remains available when all CEs are unloaded.
#[derive(Clone, Default)]
pub struct CoreExtensionHost {
    registry: NativeToolRegistry,
}

impl CoreExtensionHost {
    pub fn new(registry: NativeToolRegistry) -> Self {
        Self { registry }
    }

    pub fn registry(&self) -> &NativeToolRegistry {
        &self.registry
    }

    /// TRUSTED HOST ONLY: the caller must vet the module and construct its
    /// native implementations. No model or webview may install a CE directly.
    pub fn register_trusted(
        &self,
        manifest: ModuleManifest,
        implementations: Vec<Arc<dyn NativeTool>>,
    ) -> Result<(), CoreExtensionError> {
        if manifest.kind != ModuleKind::CoreExtension {
            return Err(CoreExtensionError::NotCoreExtensionModule);
        }
        self.registry
            .register(manifest, implementations)
            .map_err(CoreExtensionError::Registry)
    }

    /// Stops NEW calls; the eventual worker supervisor must cancel or drain
    /// calls already in flight before unloading executable code.
    pub fn unregister_trusted(&self, module_id: &str) -> Result<(), CoreExtensionError> {
        self.registry
            .unregister_extension(module_id)
            .map_err(CoreExtensionError::Registry)
    }

    pub fn extensions(&self) -> Result<Vec<ModuleManifest>, CoreExtensionError> {
        Ok(self
            .registry
            .modules()
            .map_err(CoreExtensionError::Registry)?
            .into_iter()
            .filter(|module| module.kind == ModuleKind::CoreExtension)
            .collect())
    }
}
