//! Lu-owned capability routing. Selection is NOT a grant, effect or tool call.
//! Only immutable host-reviewed rules can trigger dispatch. C05/C10 proposals
//! from Cognitum are discovery-only; they never enroll a tool or a worker.
//! All executable routes still go through NativeToolTurn, registered codec,
//! conversation-scoped authorization, host policy and the effect journal.

use crate::{
    contracts::ToolEffect,
    model::ModelToolCatalog,
    registry::NativeToolRegistry,
};
use serde_json::{json, Value};

pub const COGNITUM_RATIONAL_PUBLIC_NAME: &str = "lu_cognitum_rational";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ReviewedMatcher {
    BoundedExactFractionV1,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ReviewedHostRouteRule {
    pub rule_id: &'static str,
    pub public_name: &'static str,
    pub native_tool_id: &'static str,
    pub effect: ToolEffect,
    pub input_type_url: &'static str,
    pub argument_name: &'static str,
    pub matcher: ReviewedMatcher,
}

/// Only registered, reviewed, first-party code may add executable rules.
/// The fixed Cognitum rational worker is absent from vanilla Lu; matching
/// this constant alone never installs/enables it or grants ExecuteCode.
pub const TRUSTED_HOST_ROUTES: &[ReviewedHostRouteRule] = &[ReviewedHostRouteRule {
    rule_id: "lu.route.cognitum.exact_rational.v1",
    public_name: COGNITUM_RATIONAL_PUBLIC_NAME,
    native_tool_id: "lu.cognitum.dev_rational",
    effect: ToolEffect::ExecuteCode,
    input_type_url: "type.googleapis.com/cognitum.v1.CalculateRationalRequest",
    argument_name: "expression",
    matcher: ReviewedMatcher::BoundedExactFractionV1,
}];

#[derive(Debug, Clone, PartialEq)]
pub struct ReviewedRouteCandidate {
    pub rule_id: &'static str,
    pub public_name: &'static str,
    pub arguments: Value,
}

/// C05/C10 reviewed metadata from Cognitum's P25 research is *discovery only*.
/// No execution effect, registration, Protobuf conversion, or authorization
/// is encoded in this type. A later host-owned integration needs separate
/// signed schemas, exact codecs, tool enrollment and current-turn permission.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DiscoveryOnlyProposal {
    pub operation: &'static str,
    pub rule_id: &'static str,
}

pub fn user_declines_tools(prompt: &str) -> bool {
    let lower = prompt.to_ascii_lowercase();
    [
        "no tools", "no tool", "without tools", "without any tools",
        "without using tools", "do not use tools", "don't use tools",
        "do not call tools", "don't call tools", "without cognitum",
        "do not use cognitum", "don't use cognitum",
        "without specialists", "without any specialists",
        "do not use specialists", "never call a tool",
    ].iter().any(|refusal| lower.contains(refusal))
}

/// A strictly inert, at-most-one relevance suggestion. It is deliberately
/// not consumed by the executable host router or native dispatcher.
pub fn suggest_cognitum_discovery(user_text: &str) -> Option<DiscoveryOnlyProposal> {
    if user_text.is_empty() || user_text.len() > 2048
        || user_declines_tools(user_text)
    {
        return None;
    }
    let text = user_text.to_ascii_lowercase();
    let mut proposed = None;
    let cues = [
        (text.contains("determinant") && text.contains("matrix"),
            "cognitum.math.linear", "c05.determinant"),
        (text.contains("expand") && text.contains("polynomial"),
            "cognitum.math.symbolic", "c05.expand"),
        (text.contains("calculate") && text.contains("exactly as a decimal"),
            "cognitum.math.precision", "c05.decimal"),
        (text.contains("boolean") &&
            (text.contains("satisfy") || text.contains("satisfiable")),
            "cognitum.formal.finite", "c10.boolean"),
    ];
    for (matches, operation, rule_id) in cues {
        if matches {
            if proposed.is_some() {
                return None; // overlapping reviewed capabilities: deny
            }
            proposed = Some(DiscoveryOnlyProposal { operation, rule_id });
        }
    }
    proposed
}

/// Reject code, filesystem requests and combined tasks before selecting even
/// a narrowly bounded route. False negatives are intentional: the model can
/// still answer normally without this host-selected call.
fn eligible_fraction_prompt(text: &str) -> bool {
    if text.len() > 4096 || text.trim().is_empty() || user_declines_tools(text) {
        return false;
    }
    let lower = text.to_ascii_lowercase();
    ![
        "://", "file", "directory", "path", "python", "shell", "script",
        "execute", "run code", "upload", "download", "delete", "remove",
        "email", "send ", "calendar", "date", " then ", " also ",
        "and calculate", "and compute", "and evaluate",
    ].iter().any(|s| lower.contains(s))
}

/// Recognize a positive, finite, bounded numerator/denominator with no path
/// or numeric-prefix ambiguity. Only ASCII numeric syntax is admitted.
fn fraction_end(bytes: &[u8], start: usize) -> Option<usize> {
    if start >= bytes.len() || !bytes[start].is_ascii_digit()
        || (start > 0 && (bytes[start - 1].is_ascii_alphanumeric()
            || matches!(bytes[start - 1], b'/' | b'.' | b'_')))
    {
        return None;
    }
    let mut pos = start;
    while pos < bytes.len() && bytes[pos].is_ascii_digit() { pos += 1; }
    if pos - start > 9 || pos == start || bytes.get(pos) != Some(&b'/') {
        return None;
    }
    pos += 1;
    let denominator_start = pos;
    while pos < bytes.len() && bytes[pos].is_ascii_digit() { pos += 1; }
    if pos == denominator_start || pos - denominator_start > 9
        || bytes[denominator_start..pos].iter().all(|x| *x == b'0')
        || bytes.get(pos) == Some(&b'/')
    {
        return None;
    }
    Some(pos)
}

pub fn extract_bounded_fraction_expression(text: &str) -> Option<String> {
    if !eligible_fraction_prompt(text) {
        return None;
    }
    let bytes = text.as_bytes();
    let parts: Vec<(usize, usize)> = (0..bytes.len())
        .filter_map(|start| fraction_end(bytes, start).map(|end| (start, end)))
        .collect();
    if parts.len() != 2 {
        return None;
    }
    let (a_start, a_end) = parts[0];
    let (b_start, b_end) = parts[1];
    let between = text.get(a_end..b_start)?;
    if !matches!(between.trim(), "+" | "-" | "*")
        || !between.starts_with(' ') || !between.ends_with(' ')
    {
        return None;
    }
    let tail = text.get(b_end..)?.trim_start();
    if tail.starts_with(|c: char| c.is_ascii_digit() || "+-*/^%".contains(c)) {
        return None;
    }
    let expression = text.get(a_start..b_end)?.trim();
    if expression.len() > 256 || expression.contains('\n') {
        return None;
    }
    Some(expression.to_owned())
}

pub fn select_reviewed_host_route(
    user_text: &str,
    catalog: &ModelToolCatalog,
    registry: &NativeToolRegistry,
    schemas: &[Value],
) -> Option<ReviewedRouteCandidate> {
    select_from_reviewed_rules(user_text, catalog, registry, schemas, TRUSTED_HOST_ROUTES)
}

pub fn select_from_reviewed_rules(
    user_text: &str,
    catalog: &ModelToolCatalog,
    registry: &NativeToolRegistry,
    schemas: &[Value],
    rules: &[ReviewedHostRouteRule],
) -> Option<ReviewedRouteCandidate> {
    if user_declines_tools(user_text) {
        return None;
    }
    let mut found = None;
    for rule in rules {
        if !catalog.matches_reviewed_route(
            registry, schemas, rule.public_name, rule.native_tool_id,
            rule.effect, rule.input_type_url, rule.argument_name,
        ) {
            continue;
        }
        let expression = match rule.matcher {
            ReviewedMatcher::BoundedExactFractionV1 =>
                extract_bounded_fraction_expression(user_text),
        };
        if let Some(expression) = expression {
            if found.is_some() {
                return None; // conflicting eligible rules fail closed
            }
            found = Some(ReviewedRouteCandidate {
                rule_id: rule.rule_id,
                public_name: rule.public_name,
                arguments: json!({ rule.argument_name: expression }),
            });
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_one_exact_expression_and_refuses_multitask() {
        for (question, expected) in [
            ("Compute exactly: 9/14 + 5/21. Simplify.", Some("9/14 + 5/21")),
            ("Evaluate 7/12 * 15/28.", Some("7/12 * 15/28")),
            ("Calculate 13/17 - 4/51", Some("13/17 - 4/51")),
            ("How much is 1/2 + 1/3? Also calculate 2/7 + 3/9.", None),
            ("Read a file containing 1/2 + 1/3", None),
            ("Do not use tools. Compute 1/2 + 1/3", None),
            ("What date was 10/31/2026?", None),
            ("https://example.test/1/2 + 3/4", None),
            ("Compute 1/2 + 3/4 + 5", None),
            ("Compute 1/0 + 3/4", None),
            ("Compute 9999999999/2 + 3/4", None),
        ] {
            assert_eq!(extract_bounded_fraction_expression(question).as_deref(), expected,
                "{question}");
        }
    }

    #[test]
    fn discovery_is_inert_and_ambiguous_or_refused_requests_do_not_route() {
        assert_eq!(
            suggest_cognitum_discovery("Compute the determinant of matrix [[1,2],[3,4]]"),
            Some(DiscoveryOnlyProposal {
                operation: "cognitum.math.linear", rule_id: "c05.determinant",
            })
        );
        assert_eq!(
            suggest_cognitum_discovery("Expand this polynomial"),
            Some(DiscoveryOnlyProposal {
                operation: "cognitum.math.symbolic", rule_id: "c05.expand",
            })
        );
        assert!(suggest_cognitum_discovery(
            "Compute determinant of matrix and expand polynomial").is_none());
        assert!(suggest_cognitum_discovery(
            "Calculate exactly as a decimal without tools").is_none());
        assert!(suggest_cognitum_discovery("Execute a custom Python script").is_none());
        assert_eq!(TRUSTED_HOST_ROUTES.len(), 1);
    }

    #[test]
    fn unknown_or_empty_rules_cannot_propose_execution() {
        let catalog = ModelToolCatalog::new();
        let registry = NativeToolRegistry::new();
        assert!(select_from_reviewed_rules("1/2 + 2/3",
            &catalog, &registry, &[], TRUSTED_HOST_ROUTES).is_none());
        assert!(select_from_reviewed_rules("1/2 + 2/3",
            &catalog, &registry, &[], &[]).is_none());
    }
}
