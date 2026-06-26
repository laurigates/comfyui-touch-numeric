// node_modules/@laurigates/comfy-modal-kit/dist/index.js
var STYLE_ID = "cmp-shell-style";
var ACTIVE = null;
var CSS = `
.cmp-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.55);
    z-index: 9998;
    backdrop-filter: blur(2px);
    touch-action: manipulation;
}
.cmp-dialog {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 9999;
    width: min(960px, calc(100vw - 24px));
    max-height: min(85vh, 800px);
    touch-action: manipulation;
    display: flex;
    flex-direction: column;
    background: #1a1a1f;
    color: #e8e8ea;
    border: 1px solid #3a3a44;
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.7);
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 13px;
    overflow: hidden;
}
.cmp-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid #2a2a32;
    background: #21212a;
    flex-shrink: 0;
}
.cmp-title {
    flex: 1;
    font-weight: 600;
    color: #9ec6ff;
    font-size: 14px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.cmp-subtitle {
    color: #888;
    font-weight: 400;
    font-size: 12px;
    margin-left: 6px;
}
.cmp-close {
    background: transparent;
    color: #aaa;
    border: 1px solid #3a3a44;
    border-radius: 4px;
    width: 36px;
    height: 36px;
    cursor: pointer;
    font-size: 20px;
    line-height: 1;
    flex-shrink: 0;
}
.cmp-close:hover {
    background: #2a2a32;
    color: #fff;
}
.cmp-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    padding: 8px 14px;
    border-bottom: 1px solid #2a2a32;
    background: #1f1f26;
    flex-shrink: 0;
}
.cmp-toolbar:empty {
    display: none;
}
.cmp-searchrow {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid #2a2a32;
    flex-shrink: 0;
}
.cmp-search {
    flex: 1;
    background: #12121a;
    border: 1px solid #3a3a44;
    border-radius: 4px;
    color: #e8e8ea;
    padding: 8px 12px;
    /* 16px prevents iOS auto-zoom on focus. */
    font-size: 16px;
    font-family: inherit;
    outline: none;
    min-width: 0;
}
.cmp-search:focus {
    border-color: #6ba6ff;
}
.cmp-status {
    color: #888;
    font-size: 12px;
    white-space: nowrap;
}
.cmp-body {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    padding: 8px;
    position: relative;
}
.cmp-body.is-busy {
    opacity: 0.5;
    pointer-events: none;
}
.cmp-footer {
    padding: 8px 14px;
    border-top: 1px solid #2a2a32;
    color: #777;
    font-size: 11px;
    background: #1f1f26;
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    gap: 12px;
}
.cmp-footer:empty {
    display: none;
}
.cmp-footer kbd {
    background: #2a2a36;
    border: 1px solid #3a3a44;
    border-bottom-width: 2px;
    border-radius: 3px;
    padding: 1px 5px;
    font-family: ui-monospace, monospace;
    font-size: 10px;
    color: #b8b8c0;
}
`;
function ensureStyle() {
  if (document.getElementById(STYLE_ID))
    return;
  const s = document.createElement("style");
  s.id = STYLE_ID;
  s.textContent = CSS;
  document.head.appendChild(s);
}
function dismissActive() {
  if (!ACTIVE)
    return;
  const a = ACTIVE;
  ACTIVE = null;
  try {
    a.backdrop.remove();
    a.dialog.remove();
    document.removeEventListener("keydown", a._onKey, true);
  } finally {
    try {
      a.opts.onClose?.();
    } catch (e) {
      console.warn("[modal-shell] onClose threw", e);
    }
  }
}
function openModalShell(opts = {}) {
  ensureStyle();
  dismissActive();
  const backdrop = document.createElement("div");
  backdrop.className = "cmp-backdrop";
  backdrop.addEventListener("pointerdown", dismissActive);
  const dialog = document.createElement("div");
  dialog.className = "cmp-dialog";
  if (opts.width)
    dialog.style.width = opts.width;
  if (opts.height)
    dialog.style.maxHeight = opts.height;
  const stop = (e) => e.stopPropagation();
  for (const ev of ["pointerdown", "pointerup", "click", "dblclick", "wheel"]) {
    dialog.addEventListener(ev, stop);
  }
  const headerEl = document.createElement("div");
  headerEl.className = "cmp-header";
  const titleEl = document.createElement("div");
  titleEl.className = "cmp-title";
  titleEl.textContent = opts.title || "";
  if (opts.subtitle) {
    const sub = document.createElement("span");
    sub.className = "cmp-subtitle";
    sub.textContent = opts.subtitle;
    titleEl.appendChild(sub);
  }
  const closeBtn = document.createElement("button");
  closeBtn.className = "cmp-close";
  closeBtn.type = "button";
  closeBtn.textContent = "×";
  closeBtn.title = "Close (Esc)";
  closeBtn.addEventListener("click", dismissActive);
  headerEl.append(titleEl, closeBtn);
  const toolbarEl = document.createElement("div");
  toolbarEl.className = "cmp-toolbar";
  const searchRow = document.createElement("div");
  searchRow.className = "cmp-searchrow";
  const searchEl = document.createElement("input");
  searchEl.type = "search";
  searchEl.className = "cmp-search";
  searchEl.placeholder = opts.placeholder || "Filter…";
  searchEl.spellcheck = false;
  searchEl.autocomplete = "off";
  const statusEl = document.createElement("div");
  statusEl.className = "cmp-status";
  searchRow.append(searchEl, statusEl);
  if (opts.showSearch === false)
    searchRow.style.display = "none";
  const bodyEl = document.createElement("div");
  bodyEl.className = "cmp-body";
  const footerEl = document.createElement("div");
  footerEl.className = "cmp-footer";
  if (opts.showFooter !== false) {
    const l = document.createElement("div");
    if (opts.footerLeftHTML)
      l.innerHTML = opts.footerLeftHTML;
    const r = document.createElement("div");
    if (opts.footerRightHTML)
      r.innerHTML = opts.footerRightHTML;
    footerEl.append(l, r);
  } else {
    footerEl.style.display = "none";
  }
  dialog.append(headerEl, toolbarEl, searchRow, bodyEl, footerEl);
  const onKey = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      dismissActive();
      return;
    }
    try {
      opts.onKeyDown?.(e);
    } catch (err) {
      console.warn("[modal-shell] onKeyDown threw", err);
    }
  };
  document.addEventListener("keydown", onKey, true);
  document.body.append(backdrop, dialog);
  const controller = {
    backdrop,
    dialog,
    headerEl,
    toolbarEl,
    searchEl,
    statusEl,
    bodyEl,
    footerEl,
    setBusy(b) {
      bodyEl.classList.toggle("is-busy", !!b);
    },
    setStatus(s) {
      statusEl.textContent = s || "";
    },
    close: dismissActive,
    _onKey: onKey,
    opts
  };
  ACTIVE = controller;
  if (opts.showSearch !== false) {
    requestAnimationFrame(() => {
      if (ACTIVE === controller)
        searchEl.focus();
    });
  }
  return controller;
}

// src/index.ts
import { app } from "/scripts/app.js";
var EXT_NAME = "comfyui-touch-numeric";
var STYLE_ID2 = "tn-style";
var SEED_WIDGET_NAMES = new Set(["seed", "noise_seed"]);
var CONTROL_WIDGET_NAME = "control_after_generate";
var CONTROL_OPTIONS = ["fixed", "increment", "decrement", "randomize"];
var MAX_SEED = (1n << 64n) - 1n;
var SEED_HISTORY = new Map;
var HISTORY_LIMIT = 24;
function randomSeed64() {
  const buf = new Uint32Array(2);
  crypto.getRandomValues(buf);
  return BigInt(buf[0]) << 32n | BigInt(buf[1]);
}
function randomSeedInRange(min, max) {
  let lo = typeof min === "bigint" ? min : 0n;
  let hi = typeof max === "bigint" ? max : MAX_SEED;
  if (lo < 0n)
    lo = 0n;
  if (hi > MAX_SEED)
    hi = MAX_SEED;
  if (hi <= lo)
    return lo;
  const span = hi - lo + 1n;
  const bits = span.toString(2).length;
  const bytes = Math.ceil(bits / 8);
  const mask = (1n << BigInt(bits)) - 1n;
  const buf = new Uint8Array(bytes);
  for (;; ) {
    crypto.getRandomValues(buf);
    let n = 0n;
    for (const b of buf)
      n = n << 8n | BigInt(b);
    n &= mask;
    if (n < span)
      return lo + n;
  }
}
function seedBounds(widget) {
  const opts = widget?.options ?? {};
  const toBig = (v, fallback) => {
    if (typeof v === "bigint")
      return v;
    if (typeof v === "number" && Number.isFinite(v))
      return BigInt(Math.trunc(v));
    if (typeof v === "string" && /^[+-]?\d+$/.test(v.trim()))
      return BigInt(v.trim());
    return fallback;
  };
  let min = toBig(opts.min, 0n);
  let max = toBig(opts.max, MAX_SEED);
  if (min < 0n)
    min = 0n;
  if (max > MAX_SEED)
    max = MAX_SEED;
  if (max < min)
    max = min;
  return { min, max };
}
function parseSeedInput(raw) {
  if (typeof raw !== "string")
    return null;
  const cleaned = raw.trim().replace(/[\s,_]/g, "");
  if (cleaned === "")
    return null;
  if (!/^\+?\d+$/.test(cleaned))
    return null;
  let n;
  try {
    n = BigInt(cleaned);
  } catch {
    return null;
  }
  return clampSeed(n);
}
function clampSeed(n) {
  if (n < 0n)
    return 0n;
  if (n > MAX_SEED)
    return MAX_SEED;
  return n;
}
function seedToWidgetValue(n) {
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n.toString();
}
function widgetValueToSeed(value) {
  if (typeof value === "bigint")
    return clampSeed(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    return clampSeed(BigInt(Math.trunc(value)));
  }
  if (typeof value === "string")
    return parseSeedInput(value);
  return null;
}
function nextSeedHistory(history, seed, limit = HISTORY_LIMIT) {
  const prev = Array.isArray(history) ? history : [];
  if (prev.length > 0 && prev[0] === seed)
    return prev.slice(0, limit);
  return [seed, ...prev.filter((s) => s !== seed)].slice(0, limit);
}
function findAdjacentWidget(node, name) {
  if (!node?.widgets)
    return null;
  for (const w of node.widgets) {
    if (w?.name === name)
      return w;
  }
  return null;
}
function widgetProfile(w) {
  if (w && SEED_WIDGET_NAMES.has(w.name))
    return "seed";
  return null;
}
var CSS2 = `
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
function ensureStyle2() {
  if (document.getElementById(STYLE_ID2))
    return;
  const s = document.createElement("style");
  s.id = STYLE_ID2;
  s.textContent = CSS2;
  document.head.appendChild(s);
}
function commitWidgetValue(widget, node, value) {
  widget.value = value;
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
function buildSeedBody(widget, node, controlWidget, modal) {
  const root = document.createElement("div");
  root.className = "tn-seed";
  const { min: seedMin, max: seedMax } = seedBounds(widget);
  const clampToBounds = (n) => {
    const c = clampSeed(n);
    return c < seedMin ? seedMin : c > seedMax ? seedMax : c;
  };
  let current = clampToBounds(widgetValueToSeed(widget.value) ?? 0n);
  let locked = false;
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
    current = clampToBounds(n);
    valueInput.value = current.toString();
  }
  valueInput.addEventListener("input", () => {
    if (locked) {
      valueInput.value = current.toString();
      return;
    }
    const parsed = parseSeedInput(valueInput.value);
    if (parsed !== null)
      current = clampToBounds(parsed);
  });
  const keypad = document.createElement("div");
  keypad.className = "tn-keypad";
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"];
  for (const k of keys) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tn-key";
    if (k === "clear" || k === "del")
      btn.classList.add("tn-key-wide");
    btn.textContent = k === "clear" ? "C" : k === "del" ? "⌫" : k;
    btn.addEventListener("click", () => {
      if (locked)
        return;
      if (k === "clear") {
        setCurrent(0n);
      } else if (k === "del") {
        const s = current.toString();
        setCurrent(s.length > 1 ? BigInt(s.slice(0, -1)) : 0n);
      } else {
        setCurrent(BigInt(current.toString() + k));
      }
    });
    keypad.appendChild(btn);
  }
  const actionRow = document.createElement("div");
  actionRow.className = "tn-row";
  const randomBtn = document.createElement("button");
  randomBtn.type = "button";
  randomBtn.className = "tn-btn tn-btn-primary";
  randomBtn.textContent = "\uD83C\uDFB2 Randomize";
  randomBtn.addEventListener("click", () => {
    if (locked)
      return;
    setCurrent(randomSeedInRange(seedMin, seedMax));
  });
  const lockBtn = document.createElement("button");
  lockBtn.type = "button";
  lockBtn.className = "tn-btn";
  function renderLock() {
    lockBtn.textContent = locked ? "\uD83D\uDD12 Locked" : "\uD83D\uDD13 Lock";
    lockBtn.classList.toggle("tn-on", locked);
    valueInput.disabled = locked;
  }
  lockBtn.addEventListener("click", () => {
    locked = !locked;
    renderLock();
  });
  renderLock();
  actionRow.append(randomBtn, lockBtn);
  let controlWrap = null;
  if (controlWidget && Array.isArray(controlWidget.options?.values)) {
    const optionValues = controlWidget.options.values.length ? controlWidget.options.values : CONTROL_OPTIONS;
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
      b.textContent = String(opt).charAt(0).toUpperCase() + String(opt).slice(1);
      b.addEventListener("click", () => {
        commitWidgetValue(controlWidget, node, String(opt));
        renderSeg();
      });
      seg.appendChild(b);
      segButtons.push(b);
    }
    renderSeg();
    controlWrap.append(controlLabel, seg);
  }
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
        if (locked)
          return;
        setCurrent(seed);
      });
      historyList.appendChild(item);
    }
  }
  renderHistory();
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
  if (controlWrap)
    root.append(controlWrap);
  root.append(historyWrap, commitRow);
  return root;
}
function openSeedModal(widget, node) {
  ensureStyle2();
  const controlWidget = findAdjacentWidget(node, CONTROL_WIDGET_NAME);
  const modal = openModalShell({
    title: "Seed",
    subtitle: widget.name,
    showSearch: false,
    footerLeftHTML: "<kbd>Esc</kbd> to dismiss without applying",
    footerRightHTML: "Touch Numeric"
  });
  modal.bodyEl.appendChild(buildSeedBody(widget, node, controlWidget, modal));
}
function openModal(widget, node) {
  const profile = widgetProfile(widget);
  if (profile === "seed") {
    openSeedModal(widget, node);
    return true;
  }
  return false;
}
function enhanceNode(node) {
  for (const w of node?.widgets ?? []) {
    if (widgetProfile(w) === null)
      continue;
    if (w._touchNumericPatched)
      continue;
    w._touchNumericPatched = true;
    const origDown = w.onPointerDown;
    w.onPointerDown = function(pointer, ownerNode, canvas) {
      try {
        if (typeof origDown === "function") {
          const consumed = origDown.call(this, pointer, ownerNode, canvas);
          if (consumed)
            return consumed;
        }
        return openModal(w, ownerNode || node);
      } catch (e) {
        console.warn(`[${EXT_NAME}] modal open failed`, e);
        return false;
      }
    };
  }
}
app.registerExtension({
  name: "comfy.touch-numeric",
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
  }
});
export {
  widgetValueToSeed,
  widgetProfile,
  seedToWidgetValue,
  seedBounds,
  randomSeedInRange,
  randomSeed64,
  parseSeedInput,
  nextSeedHistory,
  findAdjacentWidget,
  clampSeed
};
