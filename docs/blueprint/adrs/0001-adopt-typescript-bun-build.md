---
id: ADR-0001
date: 2026-06-06
status: Accepted
deciders: Lauri Gates
domain: build-tooling
supersedes: []
relates-to: []
github-issues: []
name: blueprint-derive-adr
---

# ADR-0001: Adopt TypeScript + bun build (supersedes the single-file vanilla-JS architecture)

This is the first numbered ADR for `comfyui-touch-numeric`. It formalizes — and
**supersedes** — the two architecture decisions that were previously implicit in
`docs/IMPLEMENTATION-PLAN.md` rather than recorded as numbered ADRs:

- **No-bundler / single-file vanilla JS** (`web/js/touch-numeric.js` served
  directly as a static ES module).
- **Vendored shared primitives** (`web/js/modal-shell.js` + `web/js/modal-fuzzy.js`
  copied in from gallery-loader).

Both are now retired. The status of those prior approaches is **Superseded** by
this ADR.

## Decision Drivers

- The single-file vanilla-JS implementation carried the well-known negative
  consequence of frontend-only ComfyUI packs: **no static type checking**. The
  pack reaches deep into the minified ComfyUI frontend's LiteGraph widget/node
  objects (`widget.onPointerDown`, `widget.callback`, `widget.options.min/max`,
  `node.widgets`, `node.setDirtyCanvas`, `app.graph`, `app.canvas`). Those
  accesses are exactly where a frontend-version bump silently breaks the pack
  (the "Frontend hook is version-sensitive" hard rule). Type checking against
  `@comfyorg/comfyui-frontend-types` turns a class of those breakages into
  compile errors.
- A bun-externalization spike confirmed the toolchain keeps the
  zero-runtime-bundle property for the runtime API while **inlining** the shared
  modal primitives:
  `bun build ./src/index.ts --target browser --format esm --outdir web/dist
  --external '/scripts/*'` emits browser-clean ESM with the `/scripts/app.js`
  runtime import left **unbundled** (resolved at runtime against ComfyUI's
  served module), and the `@laurigates/comfy-modal-kit` import **inlined** into
  the single emitted `index.js`.
- The vendored `modal-shell.js` / `modal-fuzzy.js` copies were a maintenance
  liability — drift between this pack's copy and the gallery-loader source had
  no enforcement. Consuming `@laurigates/comfy-modal-kit` (which preserves the
  original export names, `openModalShell` / `closeModalShell` / `fuzzyScore` /
  `fuzzyRank` / `highlightMatches`) single-sources the primitives. Inlining at
  build time keeps the served artifact self-contained — ComfyUI still loads one
  static ES module, with no second extension to install.

## Considered Options

1. **TypeScript source in `src/`, built to `web/dist/` via `bun build`,
   consuming `@laurigates/comfy-modal-kit`** — typed authoring, browser-ESM
   output, `/scripts/*` externalized, the kit inlined.
2. **Stay on single-file vanilla JS with vendored primitives (status quo)** —
   no build, no types, copies that drift.
3. **TypeScript with `tsc` emit instead of `bun build`** — `tsc` can emit ESM,
   but does not understand the `--external '/scripts/*'` runtime-import concept
   and does not bundle the kit dependency; it is a type checker first, a bundler
   never.

## Decision Outcome

**Chosen option**: option 1. The spike proved the output preserves the runtime
contract (the `/scripts/app.js` import stays external) while inlining the shared
kit, and the type checker pays for itself at the frontend seam. `tsc --noEmit`
is the type gate; `bun build` is the emit. The two are decoupled — `tsc` never
emits, `bun` never type-checks — which keeps each fast and single-purpose.

### Build & serve mechanics

- **Source**: `src/index.ts` (the port of the former
  `web/js/touch-numeric.js`) plus `src/comfyui-shims.d.ts`.
- **Type gate**: `bun run typecheck` → `tsc --noEmit` against
  `@comfyorg/comfyui-frontend-types` (dev dependency).
- **Emit**: `bun run build` →
  `bun build ./src/index.ts --target browser --format esm --outdir web/dist
  --external '/scripts/*'`. The kit is a regular (non-dev) dependency so the
  bundler inlines it; only `/scripts/*` is externalized. This pack ships no
  static JSON corpus, so there is no `cp web/data …` step.
- **Serve**: `__init__.py` sets `WEB_DIRECTORY = "./web/dist"`. ComfyUI serves
  that tree at `/extensions/comfyui-touch-numeric/`, so the built JS is at
  `/extensions/comfyui-touch-numeric/index.js`. `EXT_NAME` is unchanged — it
  still derives from the pack directory name, not the JS file location.
- **Distribution**: `web/dist/` is git-ignored (it is generated). The Comfy
  Registry tarball includes it via `[tool.comfy] includes = ["web/dist"]`, and
  CI (`publish.yml`) runs `bun run build` before `publish-node-action` so the
  artifact exists at publish time.

### Type-seam notes (for future maintainers)

- `@comfyorg/comfyui-frontend-types` exports `ComfyApp` and `ComfyExtension` at
  the module root, but **not** `LGraphNode` / `LGraphCanvas` / the widget
  interfaces (they are declared internally, un-exported). The pack therefore
  models the small surface it touches with local structural interfaces
  (`NumericNode`, `PatchedWidget`) rather than importing un-exportable types.
- TypeScript will not match an ambient `declare module` against a rooted
  (`/scripts/app.js`) path specifier. A `paths` mapping in `tsconfig.json`
  points that import at `src/comfyui-shims.d.ts` for type resolution; the
  emitted import string stays `/scripts/app.js` and `--external '/scripts/*'`
  keeps it unbundled.
- `@laurigates/comfy-modal-kit` is consumed by bare-package specifier
  (`import { openModalShell } from "@laurigates/comfy-modal-kit"`) and ships
  its own `.d.ts`, so `tsc` types it directly and `bun build` inlines it.

### Positive Consequences

- Static type checking at the version-sensitive frontend seam — the single
  largest source of silent breakage now has a compile-time gate.
- Output is still plain browser ESM served as a static file; no runtime
  bundler, no framework, no change to how ComfyUI loads the extension. Just one
  external import (`/scripts/app.js`).
- The shared modal primitives are single-sourced via the kit instead of
  vendored copies that drift.
- The pure helper functions keep their exact export names (`clampSeed`,
  `findAdjacentWidget`, `nextSeedHistory`, `parseSeedInput`, `randomSeed64`,
  `randomSeedInRange`, `seedBounds`, `seedToWidgetValue`, `widgetProfile`,
  `widgetValueToSeed`), so the Vitest suite imports the `.ts` source directly
  with no build dependency in tests.
- `knip` + `tsc` + Vitest + Biome give a complete local gate chain.

### Negative Consequences

- The "edit → hard-refresh" loop now requires a `bun run build` step (the served
  file is `web/dist/index.js`, not the source). Mitigated by `just build` and a
  fast (~5ms) build.
- A build artifact must be present for the screenshot pipeline and the registry
  publish; both are wired to build first, but a fresh checkout has no
  `web/dist/` until `bun run build` runs.
- One more dev dependency set (`typescript`,
  `@comfyorg/comfyui-frontend-types`, `knip`), one runtime dependency
  (`@laurigates/comfy-modal-kit`), and a `tsconfig.json` to maintain.

## Pros and Cons of Options

### TypeScript + bun build (consume the kit)

- ✅ Static types at the frontend seam
- ✅ Browser-ESM output preserves the runtime contract (spike-confirmed)
- ✅ Shared primitives single-sourced, inlined into the served artifact
- ✅ Decoupled type gate (`tsc --noEmit`) and emit (`bun build`)
- ❌ Adds a build step to the edit-refresh loop
- ❌ Generated artifact must be built before publish / screenshots

### Stay on single-file vanilla JS + vendored primitives

- ✅ Zero build toolchain
- ❌ No type safety at the exact place breakage happens
- ❌ Vendored modal copies drift from their source with no enforcement

### TypeScript with `tsc` emit

- ✅ Single tool for typecheck + emit
- ❌ `tsc` is not a bundler; `--external '/scripts/*'` and inlining the kit are
  bundler features
- ❌ Worse fit than `bun build` for the browser-ESM-with-external target

## Links

- Bun externalization spike: `bun build ./src/index.ts --target browser
  --format esm --outdir web/dist --external '/scripts/*'` (PASSED — 2 modules
  bundled: `src/index.ts` + the inlined kit; `/scripts/app.js` left external)
- `@laurigates/comfy-modal-kit@^0.2.0` (npm) — shared modal-shell + fuzzy
  primitives
- `CLAUDE.md` § "File layout", § "Dev workflow", § "ADRs"
- `docs/IMPLEMENTATION-PLAN.md` — the prior single-file vanilla-JS + vendored-
  primitives architecture this ADR supersedes
- Sibling pilot: `comfyui-sampler-info` ADR-0010 (same TypeScript + bun build
  migration; sampler-info does not consume the kit)

---
*Authored as part of the TypeScript + bun build migration.*
