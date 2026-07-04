# comfyui-touch-numeric

Touch-friendly keypad, steppers, and slider modal for seed and INT/FLOAT widgets — seed history, lock, and control_after_generate folded in.

> Part of a family of mobile-first ComfyUI usability packs — touch-friendly HTML
> modals that replace clunky native LiteGraph controls, detected by widget name,
> additive and non-clobbering. They share the
> [`@laurigates/comfy-modal-kit`](https://github.com/laurigates/comfy-modal-kit)
> modal primitives and its cross-pack field-provider registry, so this keypad
> also renders **inline** inside the
> [prompt-editor](https://github.com/laurigates/comfyui-prompt-editor). Siblings:
> [gallery-loader](https://github.com/laurigates/comfyui-gallery-loader),
> [model-gallery](https://github.com/laurigates/comfyui-model-gallery),
> [prompt-editor](https://github.com/laurigates/comfyui-prompt-editor),
> [sampler-info](https://github.com/laurigates/comfyui-sampler-info),
> [touch-connect](https://github.com/laurigates/comfyui-touch-connect),
> [touch-resize](https://github.com/laurigates/comfyui-touch-resize),
> [touch-tooltips](https://github.com/laurigates/comfyui-touch-tooltips).

![Seed keypad modal](docs/seed.png)

*The touch keypad modal for `seed` / `noise_seed` widgets: paste or tap an
18-digit value, one-tap Randomize, Lock, `control_after_generate` as a
segmented control, and per-session seed history.*

## Install

```sh
cd <ComfyUI>/custom_nodes
git clone https://github.com/laurigates/comfyui-touch-numeric
```

Restart ComfyUI; hard-refresh the browser tab (Ctrl+Shift+R / Cmd+Shift+R).

## What it does

Detects `seed` / `noise_seed` widgets (and other INT/FLOAT numeric widgets)
**by name** and folds their controls into one touch-friendly modal opened via
`widget.onPointerDown` — additive, with graceful fallback to the native widget
when there's no match. The modal gives you:

- **A big keypad + paste field** — tap the digits or paste an 18-digit value;
  input is parsed and clamped to the widget's bounds (`[0, 0xffffffffffffffff]`
  for seeds), kept as an exact BigInt so no precision is lost.
- **One-tap Randomize** — a cryptographically-random (`crypto.getRandomValues`)
  64-bit-safe integer, generated and clamped within the widget's bounds.
- **Lock** — freeze the value so Randomize and edits are ignored until unlocked.
- **`control_after_generate` as a segmented control** — the adjacent core combo
  rendered as a 4-state toggle (Fixed / Increment / Decrement / Randomize).
- **Per-session seed history** — recent values (newest first), tap-to-restore;
  in-memory only, cleared on reload.

Because it registers a `seed` field provider with
[`@laurigates/comfy-modal-kit`](https://github.com/laurigates/comfy-modal-kit),
the same keypad also renders **inline** inside the
[prompt-editor](https://github.com/laurigates/comfyui-prompt-editor) modal — no
separate integration needed.

## Compatibility

- ComfyUI: modern Vue frontend (`comfyui-frontend-package >= 1.40`) for the
  `widget.onPointerDown` interception hook.
- Frontend changes (JS/CSS) take effect on browser hard-refresh — no restart.

## License

MIT — see `LICENSE`.
