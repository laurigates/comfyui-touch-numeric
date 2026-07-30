# comfyui-touch-numeric — task runner. Run `just` (or `just --list`) for recipes.

set positional-arguments

# Show available recipes.
default:
    @just --list

##########
# Assets
##########

# Requires rsvg-convert (librsvg): `brew install librsvg` / `apt-get install librsvg2-bin`.
# pyproject [tool.comfy] Icon/Banner point at the raw GitHub PNG URLs, so the
# registry shows a broken image until you rasterize and commit the PNGs.
#
# Rasterize icon.svg + banner.svg to the PNGs the registry serves (commit them).
[group: "assets"]
assets:
    # Placeholder gate: the scaffold ships a letter-initial glyph so the SVGs are
    # valid from commit one, but no pack may PUBLISH it — pyproject already points
    # Icon/Banner at the PNGs this recipe writes, so a forgotten placeholder ships
    # a generic letter tile to registry.comfy.org (nearly happened on
    # comfyui-output-swap). Draw the bespoke pictogram, delete the marker comment.
    grep -q 'PLACEHOLDER-GLYPH' icon.svg banner.svg && { echo "icon.svg/banner.svg still carry the PLACEHOLDER-GLYPH marker — replace the letter glyph with a bespoke pictogram (family spec: #ffb02e line-art on the dark tile) and delete the marker comment before rasterizing."; exit 1; } || true
    rsvg-convert -w 400 -h 400 icon.svg -o icon.png
    rsvg-convert -w 1344 -h 576 banner.svg -o banner.png
    # Consistency gate: the family tile must trim to 346x346+27+27 on a 400x400
    # canvas. A mismatch means the icon drifted off the family spec (wrong
    # canvas size or a full-bleed tile) — see comfy-registry-lifecycle. Skipped
    # when ImageMagick's `identify` is absent (rsvg-convert is the only hard dep).
    command -v identify >/dev/null 2>&1 && { test "$(identify -format '%wx%h/%@' icon.png)" = "400x400/346x346+27+27" || { echo "icon.png off family spec (want 400x400/346x346+27+27)"; exit 1; }; } || true

##########
# Build
##########

# Compile the TypeScript source to web/dist/index.js (ESM; kit inlined,
# /scripts/* external). See ADR-0001.
[group: "build"]
build:
    bun run build

# Typecheck the TypeScript source without emitting.
[group: "build"]
typecheck:
    bun run typecheck

##########
# Quality
##########

# Lint Python + TS/JSON (no changes).
[group: "quality"]
lint:
    uv run ruff check .
    bun run lint

# Auto-format Python + TS/JSON.
[group: "quality"]
format:
    uv run ruff format .
    uv run ruff check --fix .
    bunx @biomejs/biome check --write .

# Run the full test suite (pytest + Vitest) — the local CI gate.
[group: "quality"]
test:
    uv run pytest -v
    bun run test

# Unused exports / dependencies.
[group: "quality"]
knip:
    bun run knip

# Typecheck + build + lint + test + knip — the full local CI gate.
[group: "quality"]
check: typecheck build lint test knip

##########
# Documentation artifacts
##########

# Regenerate docs/seed.png via the containerized screenshot generator.
# Builds web/dist/ first — it is the served extension (WEB_DIRECTORY) and is
# git-ignored, so the Docker COPY needs it present on disk.
[group: "docs"]
screenshots: build
    docker build -f screenshots/Dockerfile -t comfyui-touch-numeric-screenshots .
    docker run --rm -v "$(pwd)/docs:/out" comfyui-touch-numeric-screenshots
