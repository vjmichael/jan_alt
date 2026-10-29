//! Build-level admission for the legacy Cowork session IPC.
//! Lu alpha has no host-attested Cowork origin; direct session calls deny.

pub(crate) fn legacy_ipc_is_cowork_session(scope: Option<&str>) -> bool {
    cfg!(not(feature = "lu-distribution")) && matches!(scope, Some("session"))
}

#[cfg(test)]
mod tests {
    use super::legacy_ipc_is_cowork_session;

    #[test]
    fn only_non_lu_cowork_session_is_admitted() {
        assert!(!legacy_ipc_is_cowork_session(None));
        assert!(!legacy_ipc_is_cowork_session(Some("thread")));
        assert!(!legacy_ipc_is_cowork_session(Some("other")));
        assert_eq!(
            legacy_ipc_is_cowork_session(Some("session")),
            cfg!(not(feature = "lu-distribution"))
        );
    }
}
