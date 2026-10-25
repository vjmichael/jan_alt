//! Model-facing tool catalog: external JSON -> validated internal Protobuf.
//!
//! The model sees only explicitly selected, bounded JSON schemas. The catalog
//! is inert: it cannot execute a tool, authorize an effect, or start MCP.
//! Dedicated codecs must validate *every* argument, including unknown fields,
//! before producing an internal generated Protobuf message.

use std::{
    collections::{BTreeMap, BTreeSet},
    sync::Arc,
};

use serde_json::{Map, Value};

use crate::{
    contracts::{ProtoPayload, ToolInvocation},
    registry::NativeToolRegistry,
};

pub const MAX_MODEL_TOOL_ARGS_BYTES: usize = 64 * 1024;
pub const MAX_ADVERTISED_TOOLS: usize = 16;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelToolError {
    InvalidToolName,
    DuplicateToolName(String),
    UnknownTool(String),
    NoNativeImplementation(String),
    TypeMismatch(String),
    InvalidSchema(String),
    InvalidArguments(String),
    OversizedArguments,
    ToolBudgetExceeded,
    RegistryUnavailable,
}

pub trait ModelToolCodec: Send + Sync {
    /// Exact type URL that must match the registered native tool descriptor.
    fn input_type_url(&self) -> &'static str;
    fn encode(&self, args: &Map<String, Value>) -> Result<ProtoPayload, ModelToolError>;
}

pub struct ModelToolDefinition {
    /// OpenAI-compatible short tool name; must be unique among advertised tools.
    pub name: String,
    pub native_tool_id: String,
    pub description: String,
    /// External, model-visible JSON Schema. Schemas are not an authority grant.
    pub parameters: Value,
    pub codec: Arc<dyn ModelToolCodec>,
}

pub struct ModelToolCatalog {
    definitions: BTreeMap<String, ModelToolDefinition>,
}

impl ModelToolCatalog {
    pub fn new() -> Self {
        Self {
            definitions: BTreeMap::new(),
        }
    }

    /// Register a model boundary ONLY for a tool that already exists in the
    /// native registry. Keeping this separate prevents schema/name drift.
    pub fn insert(
        &mut self,
        registry: &NativeToolRegistry,
        definition: ModelToolDefinition,
    ) -> Result<(), ModelToolError> {
        let valid_name = !definition.name.is_empty()
            && definition.name.len() <= 64
            && definition.name.bytes().enumerate().all(|(index, c)| {
                c.is_ascii_alphabetic() || (index > 0 && (c.is_ascii_digit() || c == b'_'))
            });
        if !valid_name {
            return Err(ModelToolError::InvalidToolName);
        }
        if self.definitions.contains_key(&definition.name) {
            return Err(ModelToolError::DuplicateToolName(definition.name));
        }
        if definition.description.trim().is_empty() {
            return Err(ModelToolError::InvalidSchema(definition.name));
        }
        // An explicit object schema with no additional properties is mandatory
        // for first-party codecs. Model servers may ignore it; codecs must not.
        if definition.parameters.get("type").and_then(Value::as_str) != Some("object")
            || definition.parameters.get("additionalProperties") != Some(&Value::Bool(false))
        {
            return Err(ModelToolError::InvalidSchema(definition.name));
        }
        let descriptor = registry
            .tools()
            .map_err(|_| ModelToolError::RegistryUnavailable)?
            .into_iter()
            .find(|desc| desc.id == definition.native_tool_id)
            .ok_or_else(|| {
                ModelToolError::NoNativeImplementation(definition.native_tool_id.clone())
            })?;
        if descriptor.input_type_url != definition.codec.input_type_url() {
            return Err(ModelToolError::TypeMismatch(definition.native_tool_id));
        }
        self.definitions.insert(definition.name.clone(), definition);
        Ok(())
    }

    /// Only publish an explicit allow-list, e.g. the current chat context,
    /// installed workspace, and model capability. No accidental "all tools".
    pub fn schemas(&self, allowed: &BTreeSet<String>) -> Result<Vec<Value>, ModelToolError> {
        if allowed.len() > MAX_ADVERTISED_TOOLS {
            return Err(ModelToolError::ToolBudgetExceeded);
        }
        let mut schemas = Vec::new();
        for name in allowed {
            let definition = self
                .definitions
                .get(name)
                .ok_or_else(|| ModelToolError::UnknownTool(name.clone()))?;
            schemas.push(serde_json::json!({
                "type": "function",
                "function": {
                    "name": definition.name,
                    "description": definition.description,
                    "parameters": definition.parameters
                }
            }));
        }
        Ok(schemas)
    }

    /// Parse untrusted model tool-call JSON without repair/coercion; the caller
    /// must check the public tool name is in this turn's advertised allow-list.
    /// This returns a typed invocation, NOT an authorization decision.
    pub fn encode_call(
        &self,
        allowed: &BTreeSet<String>,
        public_name: &str,
        call_id: &str,
        workspace_id: Option<&str>,
        raw_json: &str,
    ) -> Result<ToolInvocation, ModelToolError> {
        if !allowed.contains(public_name) {
            return Err(ModelToolError::UnknownTool(public_name.to_string()));
        }
        if raw_json.len() > MAX_MODEL_TOOL_ARGS_BYTES {
            return Err(ModelToolError::OversizedArguments);
        }
        if call_id.trim().is_empty() || call_id.len() > 128 {
            return Err(ModelToolError::InvalidArguments("invalid call ID".into()));
        }
        let definition = self
            .definitions
            .get(public_name)
            .ok_or_else(|| ModelToolError::UnknownTool(public_name.to_string()))?;
        let value: Value = serde_json::from_str(raw_json)
            .map_err(|e| ModelToolError::InvalidArguments(format!("malformed JSON: {e}")))?;
        let arguments = value
            .as_object()
            .ok_or_else(|| ModelToolError::InvalidArguments("expected JSON object".into()))?;
        let input = definition.codec.encode(arguments)?;
        if input.type_url != definition.codec.input_type_url() {
            return Err(ModelToolError::TypeMismatch(
                definition.native_tool_id.clone(),
            ));
        }
        Ok(ToolInvocation {
            call_id: call_id.into(),
            tool_id: definition.native_tool_id.clone(),
            workspace_id: workspace_id.map(str::to_string),
            input,
        })
    }
}

impl Default for ModelToolCatalog {
    fn default() -> Self {
        Self::new()
    }
}

/// Shared strict argument helpers for bundled first-party model codecs.
pub fn expect_fields(
    args: &Map<String, Value>,
    allowed: &[&str],
    required: &[&str],
) -> Result<(), ModelToolError> {
    for key in args.keys() {
        if !allowed.contains(&key.as_str()) {
            return Err(ModelToolError::InvalidArguments(format!(
                "unexpected argument: {key}"
            )));
        }
    }
    for field in required {
        if !args.contains_key(*field) {
            return Err(ModelToolError::InvalidArguments(format!(
                "missing required argument: {field}"
            )));
        }
    }
    Ok(())
}

pub fn optional_uint(
    args: &Map<String, Value>,
    name: &str,
    default: u32,
    maximum: u32,
) -> Result<u32, ModelToolError> {
    match args.get(name) {
        None => Ok(default),
        Some(value) => {
            let n = value.as_u64().ok_or_else(|| {
                ModelToolError::InvalidArguments(format!("{name} must be a positive integer"))
            })?;
            if n == 0 || n > u64::from(maximum) {
                return Err(ModelToolError::InvalidArguments(format!(
                    "{name} must be between 1 and {maximum}"
                )));
            }
            Ok(n as u32)
        }
    }
}
