# DX-14 — Fail closed on conflicting typed terminal evidence

## Fault class
A typed Protobuf diagnostic trace can have valid ordinals, parent links
and clocks yet contain contradictory same-attempt outcomes. The localizer
previously selected the *first observed failure* and could assign
`ObservedFailure` even where a subsequent success, a same-stage success,
or a second unrelated failure was also recorded.

## Change
Before granting `ObservedFailure`, test that the selected failure does
not coexist (in the same attempt) with a later successful checkpoint, a
successful outcome for the same stage, or a second failure. If such
incompatible evidence exists, report `InsufficientEvidence`; retain the
safe fixed-category next probe without certifying a unique root cause.
The valid single-failure case still reports its observed failure.

Regression fixtures cover: success followed by contradictory failure,
failure followed by later successful stages, and two distinct failures.
Windows x64 targeted typed-contract/localization tests plus strict Clippy
and full native-core CI are mandatory.

## Boundaries
This does not assert that observed native worker failures actually
occurred; it strengthens analysis of *synthetic and future typed traces*.
No changes to worker task authority, diagnostic producer, WebView UI,
Cognitum, AX/Cowork or protected main. Stacks on DX-13 PR #75.
