"""Touch Numeric for ComfyUI.

Frontend-only pack: no Python nodes. The TypeScript source in `src/` is
compiled to ESM via `bun build` and emitted to `web/dist/` (the
@laurigates/comfy-modal-kit primitives are inlined). ComfyUI serves
`WEB_DIRECTORY` as the extension root. See ADR-0001.
"""

WEB_DIRECTORY = "./web/dist"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
