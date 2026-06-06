# CLAUDE.md

Frontend-only ComfyUI custom-node pack. `__init__.py` is a loader stub; the extension is TypeScript in `src/`, built to `web/dist/` via `bun build`. See ADR-0001.

## The pattern ("the vein")

A mobile-first ComfyUI usability pack: a frontend JS extension that
intercepts a widget interaction (`widget.onPointerDown`, modern Vue
frontend) and opens a touch-friendly HTML modal in place of a clunky
native LiteGraph control. Widgets are matched **by name** (generic across
node packs), the enhancement is **additive** (graceful fallback to the
native control, never breaks serialized workflows), and the modal is
**touch-first** (16px inputs to avoid iOS zoom, big tap targets, momentum
scroll). Reuses the shared modal primitives from
`@laurigates/comfy-modal-kit` (`openModalShell` / `closeModalShell` /
`fuzzyScore` / `fuzzyRank` / `highlightMatches`), which `bun build` inlines
into the served `web/dist/index.js`. The vendored `modal-shell.js` /
`modal-fuzzy.js` copies were removed in the TypeScript migration (ADR-0001);
this pack only uses `openModalShell`.

## File layout

| Path | Purpose |
|------|---------|
| `__init__.py` | Loader stub. Empty `NODE_CLASS_MAPPINGS`; exports `WEB_DIRECTORY = "./web/dist"`. |
| `src/index.ts` | The extension: widget interception + seed modal. The build entry. |
| `src/comfyui-shims.d.ts` | Types the served `/scripts/app.js` runtime import (via tsconfig `paths`). |
| `web/dist/index.js` | **Generated** by `bun run build` (git-ignored). Served by ComfyUI. The kit is inlined here. |
| `tsconfig.json` | strict typecheck config (`noEmit` — bun emits, tsc only checks). |
| `knip.json` | Unused-export / dependency check (entry `src/index.ts`). |
| `package.json` | bun scripts (`build`, `typecheck`, `test`, `lint`, `knip`); kit is a runtime dep. |
| `pyproject.toml` | Comfy Registry metadata. `[tool.comfy] includes = ["web/dist"]`. `PublisherId` + `version` are the fields you touch. |
| `.github/workflows/` | `ci.yml` (ruff/biome/typecheck+build/pytest/vitest/gitleaks), `publish.yml` (bun build then auto-publish on version bump), `release-please.yml`. |
| `tests/` | pytest backend suite. `tests/js/` Vitest suite imports the pure helpers from `src/index.ts`. |
| `justfile` | `lint`, `format`, `test`, `check` recipes — the local CI gate. |

## Hard rules

- **Pack directory name is part of the URL.** The built `web/dist/index.js` is
  served at `/extensions/comfyui-touch-numeric/index.js`. Renaming the pack dir
  breaks every fetch. If unavoidable, sync `EXT_NAME` in `src/index.ts`.
- **`web/dist/` is generated — never edit it.** Edit `src/index.ts` and run
  `bun run build`. The dist tree is git-ignored and force-shipped to the
  registry via `[tool.comfy] includes`.
- **No Python dependencies. The pack is frontend-only; a feature genuinely needing Python belongs in a separate companion pack.**
- **Additive only.** Never clobber an existing tooltip/control; fall back to
  the native widget when there's no match. Never fabricate data.
- **Frontend hook is version-sensitive.** The modal opens via
  `widget.onPointerDown`. Keep an explicit button-widget fallback (Strategy
  B) if you depend on the modal being reachable.

## Dev workflow

```sh
uv sync --group dev          # ruff, pytest, pre-commit
bun install                  # typescript, biome, vitest, knip, the modal kit
pre-commit install
just check                   # lint + test — the local CI gate
```

The five local gates (mirror CI):

```sh
bun run typecheck            # tsc --noEmit (strict)
bun run build                # emit web/dist/index.js (kit inlined, /scripts/* external)
bun run test                 # vitest run
bun run lint                 # biome check
bun run knip                 # unused exports / deps
```

Iterating on `src/` needs a `bun run build` (the served file is the built
`web/dist/index.js`), then hard-refresh the tab — **no ComfyUI restart**.


### Endpoint reachability check

```sh
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8188/extensions/comfyui-touch-numeric/index.js
```

## ADRs

Architecture decisions live in `docs/blueprint/adrs/`.

| ADR | Status | Decision |
|-----|--------|----------|
| [ADR-0001](docs/blueprint/adrs/0001-adopt-typescript-bun-build.md) | Accepted | Adopt TypeScript + `bun build`; consume `@laurigates/comfy-modal-kit` (inlined). Supersedes the prior single-file vanilla-JS + vendored-primitives architecture documented in `docs/IMPLEMENTATION-PLAN.md`. |

The single-file vanilla-JS approach and the vendored `modal-shell.js` /
`modal-fuzzy.js` copies (previously described in `docs/IMPLEMENTATION-PLAN.md`)
are **Superseded** by ADR-0001.

## Releases

Bump `version` in `pyproject.toml` and push to `main` →
`Comfy-Org/publish-node-action` publishes to the Comfy Registry. Requires
the `REGISTRY_ACCESS_TOKEN` repo secret. Use conventional commits;
release-please maintains `CHANGELOG.md` and the version bump PR.
