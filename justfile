# comfyui-touch-numeric — task runner. Run `just` (or `just --list`) for recipes.

set positional-arguments

# Show available recipes.
default:
    @just --list

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
