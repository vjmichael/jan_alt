# DX-15G — Native stream error redaction

The native chat stream previously rendered `String(error)` from the Tauri host in its error message. A host exception can contain a private model path, tool argument, prompt fragment or backend log. The stream now emits only a fixed, allowlisted recovery category through `explainLuNativeFailure`. Permission denials and invalid native response shapes retain specific fixed guidance; unsupported exceptions receive a generic safe message.

Regression coverage injects a host exception containing a Windows path and token-like marker, then confirms the stream error includes neither. This closes one UI disclosure path. It does not certify all diagnostic exports, native logs or installer privacy, and it does not change conversation authority or retry behavior.

Stacked on the AX/DX integration and clean worker probe. Exact-head frontend and Windows desktop CI remain required before this gate is verified.
