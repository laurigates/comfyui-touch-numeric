// Touch Numeric — ComfyUI frontend extension.
//
// Served at /extensions/comfyui-touch-numeric/js/touch-numeric.js — the pack
// directory name IS this URL segment. Do not rename the pack dir without
// syncing EXT_NAME below (used for log prefixes).
//
// Pattern (shared with gallery-loader / sampler-info):
//   registerExtension -> enhance each node (on create AND on graph load) ->
//   wrap widget.onPointerDown on widgets matched BY NAME -> open an HTML
//   modal instead of the native LiteGraph control. Additive + mobile-first;
//   always chain to the original handler and fall back to the native control.
//   Requires the modern Vue frontend's onPointerDown hook
//   (comfyui-frontend-package >= 1.40).
//
// v0.1 ships the SEED profile only:
//   - keypad / paste field that lands the 18-digit value the native
//     drag-scrub cannot,
//   - one-tap Randomize (crypto.getRandomValues, 64-bit-safe integer),
//   - Lock toggle,
//   - the adjacent `control_after_generate` combo rendered as a 4-state
//     segmented control (Fixed / Increment / Decrement / Randomize),
//   - in-memory per-session seed history with tap-to-restore (numbers only).
//
// The v0.2 generic numeric profile (cfg/steps/denoise/... keypad + steppers +
// bounded slider) slots into the profile dispatch in enhanceNode() — see the
// `WIDGET_PROFILE` resolver and the TODO marker in openModal().

import { app } from "../../../scripts/app.js";
import { openModalShell } from "./modal-shell.js";

const EXT_NAME = "comfyui-touch-numeric";
const STYLE_ID = "tn-style";

// Seed widgets, detected by NAME (generic across node packs). The native
// horizontal drag-scrub cannot land an 18-digit 64-bit value by finger; the
// keypad/paste modal can.
const SEED_WIDGET_NAMES = new Set(["seed", "noise_seed"]);

// The combo ComfyUI core splits the seed behaviour into. We fold it into the
// seed modal as a segmented control. Detected as an adjacent widget on the
// same node (not patched itself).
const CONTROL_WIDGET_NAME = "control_after_generate";

// The 4 canonical states of `control_after_generate` (core ComfyUI order).
const CONTROL_OPTIONS = ["fixed", "increment", "decrement", "randomize"];

// 64-bit unsigned ceiling: ComfyUI's seed INT max is 0xffffffffffffffff.
// We generate and clamp within [0, MAX_SEED]. Values are kept as BigInt for
// exactness (18 digits exceeds Number.MAX_SAFE_INTEGER) and only narrowed to
// Number for widget.value when they fit, preserving the native INT contract.
const MAX_SEED = (1n << 64n) - 1n;

// Per-session seed history, keyed by widget identity. In-memory only (cleared
// on reload) per the plan's v0.1 decision; localStorage persistence is a
// later milestone. Map<widget, bigint[]> — newest first.
const SEED_HISTORY = new Map();
const HISTORY_LIMIT = 24;

// ============================================================
// Pure helpers (unit-tested in tests/js/touch-numeric.test.js)
// ============================================================

/**
 * Cryptographically-random 64-bit-safe unsigned integer in [0, MAX_SEED].
 * Uses crypto.getRandomValues (two uint32 words) — never Math.random.
 * @returns {bigint}
 */
export function randomSeed64() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return (BigInt(buf[0]) << 32n) | BigInt(buf[1]);
}

/**
 * Parse a free-form seed input (keypad digits or a pasted value) into a
 * clamped BigInt, or null when it isn't a usable non-negative integer.
 * Tolerates surrounding whitespace, thousands separators, and a leading "+".
 * @param {string} raw
 * @returns {bigint | null}
 */
export function parseSeedInput(raw) {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/[\s,_]/g, "");
  if (cleaned === "") return null;
  // Non-negative integer only (digits, optional leading +). The native widget
  // is an unsigned INT; reject signs, decimals, hex, exponents.
  if (!/^\+?\d+$/.test(cleaned)) return null;
  let n;
  try {
    n = BigInt(cleaned);
  } catch {
    return null;
  }
  return clampSeed(n);
}

/**
 * Clamp a BigInt seed into [0, MAX_SEED].
 * @param {bigint} n
 * @returns {bigint}
 */
export function clampSeed(n) {
  if (n < 0n) return 0n;
  if (n > MAX_SEED) return MAX_SEED;
  return n;
}

/**
 * Narrow a BigInt seed to the value written to widget.value. ComfyUI seed
 * widgets are Numbers; when the value fits in a safe integer we hand back a
 * Number to match the native contract. Above that we keep a decimal string so
 * the exact 18-digit value survives (never fabricate / round).
 * @param {bigint} n
 * @returns {number | string}
 */
export function seedToWidgetValue(n) {
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n.toString();
}

/**
 * Read a widget's current value as a BigInt seed, or null when unparseable.
 * Accepts Number or string (serialized graphs may carry either).
 * @param {number | string | bigint | null | undefined} value
 * @returns {bigint | null}
 */
export function widgetValueToSeed(value) {
  if (typeof value === "bigint") return clampSeed(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampSeed(BigInt(Math.trunc(value)));
  }
  if (typeof value === "string") return parseSeedInput(value);
  return null;
}

/**
 * Push a seed onto a history ring (newest first), de-duplicating an
 * immediate repeat and capping length. Pure — returns a NEW array.
 * @param {bigint[]} history
 * @param {bigint} seed
 * @param {number} [limit=HISTORY_LIMIT]
 * @returns {bigint[]}
 */
export function nextSeedHistory(history, seed, limit = HISTORY_LIMIT) {
  const prev = Array.isArray(history) ? history : [];
  if (prev.length > 0 && prev[0] === seed) return prev.slice(0, limit);
  return [seed, ...prev.filter((s) => s !== seed)].slice(0, limit);
}

/**
 * Find an adjacent widget by name on the same node (e.g. the
 * control_after_generate combo next to a seed). Returns null when absent.
 * @param {object} node
 * @param {string} name
 * @returns {object | null}
 */
export function findAdjacentWidget(node, name) {
  if (!node?.widgets) return null;
  for (const w of node.widgets) {
    if (w?.name === name) return w;
  }
  return null;
}

/**
 * Resolve which modal profile a widget gets. v0.1 only knows "seed". The
 * generic numeric profile lands here in v0.2 (keyed on name set / widget
 * type), which is why dispatch is centralised rather than inlined.
 * @param {object} w
 * @returns {"seed" | null}
 */
export function widgetProfile(w) {
  if (w && SEED_WIDGET_NAMES.has(w.name)) return "seed";
  return null;
}

// ============================================================
// CSS (pack-specific; modal-shell injects its own .cmp-* styles)
// ============================================================

const CSS = `
.tn-seed {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 4px;
}
.tn-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
}
.tn-label {
    color: #9ec6ff;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 4px;
}
.tn-value {
    width: 100%;
    box-sizing: border-box;
    background: #12121a;
    border: 1px solid #3a3a44;
    border-radius: 6px;
    color: #e8e8ea;
    padding: 12px 14px;
    /* 16px prevents iOS auto-zoom on focus. */
    font-size: 16px;
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    letter-spacing: 0.02em;
    outline: none;
    text-align: right;
}
.tn-value:focus {
    border-color: #6ba6ff;
}
.tn-value:disabled {
    opacity: 0.55;
    cursor: not-allowed;
}
.tn-keypad {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
}
.tn-key {
    min-height: 48px;
    background: #21212a;
    border: 1px solid #3a3a44;
    border-radius: 8px;
    color: #e8e8ea;
    font-size: 20px;
    font-family: ui-monospace, monospace;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
}
.tn-key:hover {
    background: #2a2a36;
}
.tn-key:active {
    background: #34344a;
}
.tn-key.tn-key-wide {
    font-size: 15px;
}
.tn-btn {
    flex: 1;
    min-height: 48px;
    min-width: 110px;
    background: #21212a;
    border: 1px solid #3a3a44;
    border-radius: 8px;
    color: #e8e8ea;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
}
.tn-btn:hover {
    background: #2a2a36;
}
.tn-btn-primary {
    background: #2d4a7a;
    border-color: #3d63a8;
    color: #dce8ff;
}
.tn-btn-primary:hover {
    background: #345592;
}
.tn-btn.tn-on {
    background: #4a3a16;
    border-color: #a8842d;
    color: #ffe9bd;
}
.tn-seg {
    display: flex;
    width: 100%;
    border: 1px solid #3a3a44;
    border-radius: 8px;
    overflow: hidden;
}
.tn-seg-btn {
    flex: 1;
    min-height: 48px;
    background: #1a1a22;
    border: none;
    border-right: 1px solid #3a3a44;
    color: #b8b8c0;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
}
.tn-seg-btn:last-child {
    border-right: none;
}
.tn-seg-btn.tn-seg-active {
    background: #2d4a7a;
    color: #dce8ff;
}
.tn-history {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 180px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
}
.tn-history-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    background: #12121a;
    border: 1px solid #2a2a32;
    border-radius: 6px;
    color: #e8e8ea;
    padding: 6px 12px;
    font-family: ui-monospace, monospace;
    font-size: 14px;
    cursor: pointer;
    touch-action: manipulation;
    text-align: left;
}
.tn-history-item:hover {
    background: #1f1f2a;
    border-color: #3a3a44;
}
.tn-history-restore {
    color: #9ec6ff;
    font-size: 12px;
    flex-shrink: 0;
}
.tn-history-empty {
    color: #777;
    font-size: 12px;
    padding: 8px 2px;
}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}

// ============================================================
// Widget commit
// ============================================================

/**
 * Write a value back through the widget and fire its callback, matching the
 * native commit path (so downstream listeners + canvas redraw behave). Never
 * mutates the graph except through this explicit user action.
 */
function commitWidgetValue(widget, node, value) {
  widget.value = value;
  // STRING-rendered widgets keep a DOM copy; sync it so the user sees the
  // new value before the canvas redraws.
  if (widget.inputEl && typeof widget.inputEl.value === "string") {
    widget.inputEl.value = String(value);
  }
  try {
    widget.callback?.call(widget, value, app.canvas, node);
  } catch (e) {
    console.warn(`[${EXT_NAME}] widget callback threw`, e);
  }
  node?.setDirtyCanvas?.(true, true);
  app.graph?.setDirtyCanvas?.(true, true);
}

// ============================================================
// Seed modal
// ============================================================

function buildSeedBody(widget, node, controlWidget, modal) {
  const root = document.createElement("div");
  root.className = "tn-seed";

  // Working value as BigInt; falls back to 0 when the widget value is
  // unparseable (never fabricate — 0 is the documented default seed).
  let current = widgetValueToSeed(widget.value) ?? 0n;
  let locked = false;

  // --- value field --------------------------------------------------
  const valueWrap = document.createElement("div");
  const valueLabel = document.createElement("div");
  valueLabel.className = "tn-label";
  valueLabel.textContent = widget.name;
  const valueInput = document.createElement("input");
  valueInput.className = "tn-value";
  valueInput.type = "text";
  valueInput.inputMode = "numeric";
  valueInput.autocomplete = "off";
  valueInput.spellcheck = false;
  valueInput.value = current.toString();
  valueWrap.append(valueLabel, valueInput);

  function setCurrent(n) {
    current = clampSeed(n);
    valueInput.value = current.toString();
  }

  // Re-parse on manual edit / paste so the keypad and field stay in sync.
  valueInput.addEventListener("input", () => {
    if (locked) {
      valueInput.value = current.toString();
      return;
    }
    const parsed = parseSeedInput(valueInput.value);
    if (parsed !== null) current = parsed;
  });

  // --- keypad -------------------------------------------------------
  const keypad = document.createElement("div");
  keypad.className = "tn-keypad";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"];
  for (const k of keys) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tn-key";
    if (k === "clear" || k === "del") btn.classList.add("tn-key-wide");
    btn.textContent = k === "clear" ? "C" : k === "del" ? "⌫" : k;
    btn.addEventListener("click", () => {
      if (locked) return;
      if (k === "clear") {
        setCurrent(0n);
      } else if (k === "del") {
        const s = current.toString();
        setCurrent(s.length > 1 ? BigInt(s.slice(0, -1)) : 0n);
      } else {
        // Append digit; clamp swallows overflow past the 64-bit ceiling.
        setCurrent(BigInt(current.toString() + k));
      }
    });
    keypad.appendChild(btn);
  }

  // --- randomize / lock --------------------------------------------
  const actionRow = document.createElement("div");
  actionRow.className = "tn-row";
  const randomBtn = document.createElement("button");
  randomBtn.type = "button";
  randomBtn.className = "tn-btn tn-btn-primary";
  randomBtn.textContent = "\u{1F3B2} Randomize";
  randomBtn.addEventListener("click", () => {
    if (locked) return;
    setCurrent(randomSeed64());
  });

  const lockBtn = document.createElement("button");
  lockBtn.type = "button";
  lockBtn.className = "tn-btn";
  function renderLock() {
    lockBtn.textContent = locked ? "\u{1F512} Locked" : "\u{1F513} Lock";
    lockBtn.classList.toggle("tn-on", locked);
    valueInput.disabled = locked;
  }
  lockBtn.addEventListener("click", () => {
    locked = !locked;
    renderLock();
  });
  renderLock();
  actionRow.append(randomBtn, lockBtn);

  // --- control_after_generate segmented control ---------------------
  let controlWrap = null;
  if (controlWidget && Array.isArray(controlWidget.options?.values)) {
    // Use the node's own option order when present; else the core default.
    const optionValues = controlWidget.options.values.length
      ? controlWidget.options.values
      : CONTROL_OPTIONS;
    controlWrap = document.createElement("div");
    const controlLabel = document.createElement("div");
    controlLabel.className = "tn-label";
    controlLabel.textContent = "After generate";
    const seg = document.createElement("div");
    seg.className = "tn-seg";
    const segButtons = [];
    const renderSeg = () => {
      const active = String(controlWidget.value);
      for (const b of segButtons) {
        b.classList.toggle("tn-seg-active", b.dataset.value === active);
      }
    };
    for (const opt of optionValues) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tn-seg-btn";
      b.dataset.value = String(opt);
      // Title-case the canonical lowercase option for display.
      b.textContent = String(opt).charAt(0).toUpperCase() + String(opt).slice(1);
      b.addEventListener("click", () => {
        commitWidgetValue(controlWidget, node, opt);
        renderSeg();
      });
      seg.appendChild(b);
      segButtons.push(b);
    }
    renderSeg();
    controlWrap.append(controlLabel, seg);
  }

  // --- history ------------------------------------------------------
  const historyWrap = document.createElement("div");
  const historyLabel = document.createElement("div");
  historyLabel.className = "tn-label";
  historyLabel.textContent = "History";
  const historyList = document.createElement("div");
  historyList.className = "tn-history";
  historyWrap.append(historyLabel, historyList);

  function renderHistory() {
    const hist = SEED_HISTORY.get(widget) ?? [];
    historyList.replaceChildren();
    if (hist.length === 0) {
      const empty = document.createElement("div");
      empty.className = "tn-history-empty";
      empty.textContent = "No seeds this session yet.";
      historyList.appendChild(empty);
      return;
    }
    for (const seed of hist) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "tn-history-item";
      const num = document.createElement("span");
      num.textContent = seed.toString();
      const restore = document.createElement("span");
      restore.className = "tn-history-restore";
      restore.textContent = "Restore";
      item.append(num, restore);
      item.addEventListener("click", () => {
        if (locked) return;
        setCurrent(seed);
      });
      historyList.appendChild(item);
    }
  }
  renderHistory();

  // --- footer apply / cancel ---------------------------------------
  // The modal-shell footer is a status strip; commit happens via an explicit
  // Apply button so the user can dial in a value before writing it back
  // (additive — dismiss without Apply leaves the workflow untouched).
  const commitRow = document.createElement("div");
  commitRow.className = "tn-row";
  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.className = "tn-btn tn-btn-primary";
  applyBtn.textContent = "Apply seed";
  applyBtn.addEventListener("click", () => {
    const value = seedToWidgetValue(current);
    commitWidgetValue(widget, node, value);
    SEED_HISTORY.set(widget, nextSeedHistory(SEED_HISTORY.get(widget) ?? [], current));
    renderHistory();
    modal.close();
  });
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "tn-btn";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", () => modal.close());
  commitRow.append(applyBtn, cancelBtn);

  root.append(valueWrap, keypad, actionRow);
  if (controlWrap) root.append(controlWrap);
  root.append(historyWrap, commitRow);
  return root;
}

function openSeedModal(widget, node) {
  ensureStyle();
  const controlWidget = findAdjacentWidget(node, CONTROL_WIDGET_NAME);
  const modal = openModalShell({
    title: "Seed",
    subtitle: widget.name,
    showSearch: false,
    footerLeftHTML: "<kbd>Esc</kbd> to dismiss without applying",
    footerRightHTML: "Touch Numeric",
  });
  modal.bodyEl.appendChild(buildSeedBody(widget, node, controlWidget, modal));
}

// ============================================================
// Modal dispatch (profile -> opener)
// ============================================================

function openModal(widget, node) {
  const profile = widgetProfile(widget);
  if (profile === "seed") {
    openSeedModal(widget, node);
    return true;
  }
  // TODO(v0.2): profile === "numeric" -> openNumericModal(widget, node).
  return false;
}

// ============================================================
// Wiring
// ============================================================

function enhanceNode(node) {
  for (const w of node?.widgets ?? []) {
    if (widgetProfile(w) === null) continue;
    if (w._touchNumericPatched) continue; // guard against double-patching
    w._touchNumericPatched = true;

    // Strategy A: wrap onPointerDown. Chain to the original first; only open
    // our modal if the original didn't consume the event. Fall back to the
    // native control on dismiss/error (additive — never break the widget).
    const origDown = w.onPointerDown;
    w.onPointerDown = function (pointer, ownerNode, canvas) {
      try {
        if (typeof origDown === "function") {
          const consumed = origDown.call(this, pointer, ownerNode, canvas);
          if (consumed) return consumed;
        }
        // openModal returns a boolean; consume the event only when we took over.
        return openModal(w, ownerNode || node);
      } catch (e) {
        console.warn(`[${EXT_NAME}] modal open failed`, e);
        return false; // fall back to native on error
      }
    };
  }
}

app.registerExtension({
  name: "comfy.touch-numeric",
  // Handle freshly created nodes AND nodes restored from a saved graph.
  async nodeCreated(node) {
    try {
      enhanceNode(node);
    } catch (e) {
      console.warn(`[${EXT_NAME}] nodeCreated enhance failed`, e);
    }
  },
  async loadedGraphNode(node) {
    try {
      enhanceNode(node);
    } catch (e) {
      console.warn(`[${EXT_NAME}] loadedGraphNode enhance failed`, e);
    }
  },
});
