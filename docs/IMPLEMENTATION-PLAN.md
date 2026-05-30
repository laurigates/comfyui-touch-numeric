# comfyui-touch-numeric — implementation plan

*Derived from the brainstorm report
`/Users/lgates/repos/laurigates/comfyui-node-ideas.md` (candidates
`comfyui-touch-seed` + `comfyui-touch-numpad`, merged here into one pack —
the seed is the 64-bit special case of the generic numeric editor).*

## The pain

Numeric editing is the worst-frequency × worst-touch combination in ComfyUI:

- **Seed / noise_seed** — an INT with max `0xffffffffffffffff` edited by
  horizontal drag-scrub (you cannot land an 18-digit value by finger) or a
  tiny inline field that triggers iOS zoom and mispositions on a transformed
  canvas. No seed lock, no history, no "reuse the seed that made this image,"
  and `control_after_generate` is split into a *separate* touch-hostile combo.
- **cfg / steps / denoise** and ~700 other generic INT/FLOAT widgets
  (`width`, `height`, `strength`, `start_percent`, `batch_size`, `scale_by`…)
  use the same per-pixel drag-scrub that fights canvas pan on touch and makes
  precise bounded fractional values (`denoise=0.55`, `start_percent=0.001`)
  impractical. The frontend supports a slider `display_mode` but it is opt-in
  and essentially never set on these high-traffic widgets.

## Target widgets

Two profiles, detected by widget **name** (generic across node packs):

| Profile | Widgets | Modal |
|---------|---------|-------|
| **seed** | `seed`, `noise_seed` (+ adjacent `control_after_generate` combo) | keypad/paste, one-tap randomize, lock, history, segmented control_after_generate |
| **numeric** | `cfg`, `steps`, `denoise`, `width`, `height`, `strength`, `batch_size`, `start_percent`, `end_percent`, `scale_by`, `guidance`, … (and a generic INT/FLOAT fallback by widget type) | keypad, ± steppers, bounded slider when `min`/`max`/`step` are finite |

## Approach (established pattern)

`app.registerExtension` → `nodeCreated` + `loadedGraphNode` → wrap
`widget.onPointerDown` on matched widgets (chain the original first; see
`web/js/touch-numeric.js` skeleton) → open an HTML modal via
`openModalShell` from the copied `modal-shell.js`. Frontend-only, no Python.
16px inputs (no iOS zoom), 44px tap targets, momentum scroll. Additive: write
back through `widget.value`, never alter serialized values except by explicit
user action, fall back to the native control on dismiss/error.

### Seed modal

- 16px numeric **keypad / paste field** (handles the 18-digit case the native
  scrub cannot).
- **Randomize** (one tap), **Lock** toggle.
- `control_after_generate` rendered as a 4-state **segmented control**
  (Fixed / Increment / Decrement / Randomize), detected via the adjacent combo
  on the same node — unifies seed value + behaviour that the native UI splits.
- **Seed history**: last N seeds, tap to restore. Thumbnails when the node's
  output images are available via the standard UI result channel (degrade to
  numbers-only for v1).

### Numeric modal

- 16px number input + thumb-sized **± steppers**.
- A coarse+fine **big-thumb slider** when the widget carries finite
  `min`/`max`/`step` (read from `widget.options`).
- Generic INT/FLOAT fast-path keyed on widget **type**, with the named
  high-traffic widgets (`cfg`/`steps`/`denoise`) getting first-class treatment.

## Mobile benefit

Unblocks the most-touched numeric widget in every workflow (seed) and the
most-adjusted generation knobs (cfg/steps/denoise). The iterate-on-a-good-seed
loop — currently impossible on touch — becomes one-tap (history + restore +
lock). Precise bounded entry becomes trivial via keypad/slider.

## Differs from existing packs

`ComfyUI-MobileFriendly` adds a floating slider to exactly one widget (zoom %)
and leaves all other numeric widgets alone; core `NumberDisplay.slider` exists
but is per-widget opt-in and unset on the high-traffic widgets. No pack offers
a touch seed editor, seed history/restore, `control_after_generate` folded into
the seed surface, or a generic numeric keypad/stepper modal.

## Milestones

1. **v0.1 — seed modal, frontend-only.** keypad + randomize + lock + segmented
   control_after_generate. No history yet. Ship.
2. **v0.2 — seed history (numbers).** ring buffer in module state; tap-restore.
3. **v0.3 — numeric modal.** keypad + steppers + bounded slider for the named
   high-traffic set, then the generic INT/FLOAT type fallback.
4. **v0.4 — seed-history thumbnails** from the output UI channel (optional;
   degrade gracefully when absent).

## Open decisions

- One pack vs two: shipped as **one** pack (`touch-numeric`) with two widget
  profiles to share the modal shell — confirm this is the desired packaging
  before first publish.
- History persistence: in-memory per session vs `localStorage` (cross-reload).
  Start in-memory.
- Whether to add the Strategy-B explicit button fallback (the seed/numeric
  modal is a convenience, so native scrub remains a fine fallback — likely skip
  the button).

## References

- Brainstorm report: `../comfyui-node-ideas.md` (rows: touch-seed #1, touch-numpad #4).
- Pattern reference packs: `../comfyui-sampler-info` (modal), `../comfyui-gallery-loader` (`modal-shell.js`, `modal-fuzzy.js`).
- taskwarrior: `project:comfyui-nodes` task 151.
