---
id: ADR-0002
date: 2026-07-02
status: Accepted
deciders: Lauri Gates
domain: api-design
supersedes: []
relates-to: [ADR-0001]
github-issues: [41]
name: adopt-field-provider-and-click-coordination
---

# ADR-0002: Adopt the comfy-modal-kit field-provider registry & click coordination

Touch Numeric becomes a **provider** for the `seed` widget in the cross-pack
field-provider registry + click-coordination API shipping in
`@laurigates/comfy-modal-kit@0.4.0`. This extends the TypeScript + inlined-kit
architecture established in [ADR-0001](0001-adopt-typescript-bun-build.md) and
references the kit's decision record, **ADR-0001: Cross-Pack Field-Provider
Registry & Click Coordination** (`comfy-modal-kit`
`docs/blueprint/adrs/0001-cross-pack-field-provider-and-click-coordination.md`).

## Decision Drivers

- **The packs don't compose.** `comfyui-prompt-editor` is an all-fields node
  editor: it renders a dumb `<input type=number>` for `seed`, even when Touch
  Numeric is installed and owns a far richer keypad for exactly that widget. The
  keypad was reachable only by tapping the widget on the canvas, never from
  inside the editor.
- **Every pack hand-rolls the same pointer wrapper.** Touch Numeric's
  `enhanceNode` carried a bespoke `onPointerDown` wrapper (chain the original,
  honor its consumed-return, open our modal otherwise, fall back to native on
  error). Each sibling pack duplicated this contract with subtle drift, and an
  open modal could not coordinate with the window-level gesture packs.
- The kit now defines a **single shared runtime rendezvous** (`Symbol.for`) that
  fixes both at the root — see kit ADR-0001 for the full analysis.

## Considered Options

1. **Adopt the kit's provider registry + `patchWidgetPointer` (chosen).**
   Register a `seed` field provider returning an inline `FieldControl`, and
   replace the hand-rolled pointer wrapper with the kit's shared one.
2. **Stay canvas-only.** Keep the on-canvas modal as the sole entry point and
   the hand-rolled wrapper. Cheap, but the keypad stays invisible inside the
   editor and the divergent wrapper persists across packs.
3. **Direct pack-to-pack wiring.** Have the editor import Touch Numeric and call
   into it. Rejected in kit ADR-0001: dependency web, coupled release cycles,
   and the inlined-copy modal-stacking bug persists.

## Decision Outcome

**Chosen option 1.** Two additive seams, both preserving every existing behavior
(BigInt clamp to the widget's `[min, max]`, parse/paste, lock, randomize within
bounds, `control_after_generate` segmented control, session history):

- **Split `buildSeedBody` into a reusable inline DOM builder + value accessor,
  separate from the self-committing modal wrapper.** `buildSeedControl` builds
  the value field, keypad, randomize/lock, segmented control, and history, and
  exposes `getValue()` / `getSeed()` / `focus()` / `recordHistory()` /
  `destroy()` — but never writes back to the seed widget. The on-canvas path
  (`openSeedModal` → `buildSeedBody`) keeps the self-committing Apply button; the
  provider path hands the control to a host editor that drives write-back.
- **Register `touch-numeric:seed`** (`priority: 10`,
  `match: (w) => widgetProfile(w) === "seed"`). `create()` returns a
  `FieldControl` whose `getValue()` yields the seed in the widget's native type
  (Number when it fits `Number.MAX_SAFE_INTEGER`, else a decimal string),
  `hasChanged()` compares the working seed to the captured `initialValue`, and
  `destroy()` tears down every listener (one `AbortController` per control).
- **Replace the hand-rolled `onPointerDown` wrapper with `patchWidgetPointer`.**
  The kit's wrapper mirrors the previous chain-then-consume-with-native-fallback
  contract exactly, so on-canvas behavior is identical. The
  `_touchNumericPatched` double-patch guard and additive semantics are retained.

### Constraint: inline control, not a nested modal

The host editor mounts the provider's `FieldControl.el` inline in the field row;
it does **not** open Touch Numeric's on-canvas modal. This upholds the
single-active-modal invariant (one backdrop, the editor's) — see kit ADR-0001.

### Out of scope

The v0.2 generic `numeric` profile (a `TODO` in `openModal`) would register a
second provider (`touch-numeric:numeric`) once the profile lands. It is out of
scope for this decision.

### Positive Consequences

- The seed keypad renders **inline** inside `comfyui-prompt-editor`, not only on
  canvas tap.
- The bespoke pointer wrapper is gone; the shared, tested kit contract replaces
  it.
- Purely additive: the on-canvas modal path is byte-for-byte behaviorally
  unchanged, and if the kit provider API is absent the canvas path still works.

### Negative Consequences

- Touch Numeric now depends on `@laurigates/comfy-modal-kit@^0.4.0` (was
  `^0.2.0`) and participates in the kit's shared-global compatibility surface,
  which must evolve additively (kit ADR-0001).

## Links

- Kit ADR-0001: `comfy-modal-kit`
  `docs/blueprint/adrs/0001-cross-pack-field-provider-and-click-coordination.md`
- Kit onboarding: `comfy-modal-kit/docs/ONBOARDING.md` (provider section)
- GitHub issue: laurigates/comfyui-touch-numeric#41
- Source: `src/index.ts` (`buildSeedControl`, `buildSeedBody`,
  `registerFieldProvider`, `patchWidgetPointer` adoption)
