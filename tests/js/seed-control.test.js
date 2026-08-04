// @vitest-environment jsdom
//
// DOM-level tests for the seed control's TWO mount surfaces, which have
// different contracts and had silently diverged:
//
//   - the "modal" variant, opened from the canvas by this pack. It owns its
//     own commit (Apply/Cancel), so a live-writing segmented control and a
//     keypad-guard latch are coherent here.
//   - the "inline" variant, mounted by a HOST editor (comfyui-prompt-editor)
//     through the kit's field registry. The host owns commit and renders its
//     own row for every widget on the node — so anything this control renders
//     for a SIBLING widget is a duplicate, and any state the host cannot read
//     through getValue()/hasChanged() is invisible to Save.
//
// The inline assertions below are reached through the real registry
// (resolveFieldProvider), not by calling the builder directly, because that is
// exactly the path comfyui-prompt-editor takes. Neither repo had a test that
// exercised it, which is why the duplicate control shipped.

import { resolveFieldProvider } from "@laurigates/comfy-modal-kit";
import { beforeAll, describe, expect, it } from "vitest";

// Importing for side effects: the module registers "touch-numeric:seed" on the
// kit's shared provider list at load time.
import { buildSeedControl } from "../../src/index.ts";

beforeAll(async () => {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    const { webcrypto } = await import("node:crypto");
    globalThis.crypto = webcrypto;
  }
});

const CONTROL_VALUES = ["fixed", "increment", "decrement", "randomize"];

/** A KSampler-shaped node: a seed widget plus its adjacent control combo. */
function makeNode({ seedValue = 12345, controlValue = "fixed", seedOptions } = {}) {
  const seed = { name: "seed", value: seedValue, options: seedOptions ?? {} };
  const control = {
    name: "control_after_generate",
    value: controlValue,
    options: { values: [...CONTROL_VALUES] },
  };
  return { node: { widgets: [seed, control] }, seed, control };
}

/** Mount the inline control the way comfyui-prompt-editor does. */
function mountInline(fixture) {
  const provider = resolveFieldProvider(fixture.seed, fixture.node);
  expect(provider, "touch-numeric:seed should resolve for a seed widget").not.toBeNull();
  return provider.create({
    widget: fixture.seed,
    node: fixture.node,
    initialValue: fixture.seed.value,
  });
}

/** The lock latch, found by label so the test survives the rename. */
function lockButton(root) {
  return [...root.querySelectorAll("button")].find((b) => /lock/i.test(b.textContent));
}

describe("inline field control (mounted by a host editor)", () => {
  it("omits the control_after_generate segmented control", () => {
    // The host renders its own row for control_after_generate — it is a
    // sibling widget on the same node. Rendering it here too puts two controls
    // for one widget on screen, with opposite commit timing.
    const control = mountInline(makeNode());
    expect(control.el.querySelector(".tn-seg")).toBeNull();
    expect(control.el.textContent).not.toMatch(/after generate/i);
  });

  it("omits the lock latch", () => {
    // `locked` is closure-local and gates neither getValue() nor hasChanged(),
    // so the host commits on Save regardless of what the padlock shows.
    const control = mountInline(makeNode());
    expect(lockButton(control.el)).toBeUndefined();
  });

  it("still offers the keypad, randomize and history", () => {
    // Guard against over-removal: the keypad IS the reason a host mounts this.
    const control = mountInline(makeNode());
    expect(control.el.querySelectorAll(".tn-key").length).toBe(12);
    expect(control.el.querySelector(".tn-history")).not.toBeNull();
    expect(control.el.textContent).toMatch(/randomize/i);
  });

  it("never writes to the sibling widget while mounted", () => {
    // The host owns commit. A live write from here bypasses Save/Cancel and
    // loses to a staler deferred value in the host's write-back.
    const fixture = makeNode({ controlValue: "fixed" });
    const control = mountInline(fixture);
    for (const btn of control.el.querySelectorAll("button")) btn.click();
    expect(fixture.control.value).toBe("fixed");
  });
});

describe("inline hasChanged() baseline", () => {
  it("reports unchanged for an untouched unparseable seed", () => {
    // Regression: the baseline was the raw parse of initialValue, which is
    // null for an unparseable seed while getSeed() is never null — so
    // hasChanged() was always true and every Save churned the seed to 0
    // without the user touching the field.
    const control = mountInline(makeNode({ seedValue: "not-a-seed" }));
    expect(control.hasChanged()).toBe(false);
  });

  it("reports changed once the user edits an unparseable seed", () => {
    const control = mountInline(makeNode({ seedValue: "not-a-seed" }));
    const key = [...control.el.querySelectorAll(".tn-key")].find((b) => b.textContent === "7");
    key.click();
    expect(control.hasChanged()).toBe(true);
    expect(control.getValue()).toBe(7);
  });

  it("reports changed when a parseable out-of-range seed was clamped on open", () => {
    // The clamp IS a repair the host should write back — distinct from the
    // unparseable case, where 0 would be a fabricated value.
    const control = mountInline(makeNode({ seedValue: 500, seedOptions: { min: 0, max: 100 } }));
    expect(control.hasChanged()).toBe(true);
    expect(control.getValue()).toBe(100);
  });

  it("reports unchanged for an untouched in-range seed", () => {
    const control = mountInline(makeNode({ seedValue: 12345 }));
    expect(control.hasChanged()).toBe(false);
  });
});

describe("inline layout contract (the host owns the only scroll region)", () => {
  // The kit's field-registry documents this: a control mounted inline never
  // gets a definite height, so an internal scroller has nothing to scroll — yet
  // it still swallows the touch-scroll gesture, and overscroll-behavior:contain
  // stops that gesture chaining back out to the host's scroll region. The field
  // and everything below it become unscrollable. Cross-pack harm: authored
  // here, suffered in comfyui-prompt-editor.
  //
  // ensureStyleOnce injects the pack's stylesheet during create(), and jsdom
  // resolves stylesheet rules through getComputedStyle — so this reads the
  // REAL cascade, not inline styles (which never carried these declarations).
  function scrollersIn(el) {
    return [el, ...el.querySelectorAll("*")]
      .filter((n) => /auto|scroll/.test(getComputedStyle(n).overflowY))
      .map((n) => n.className);
  }

  it("mounts no scroll container anywhere inside the field row", () => {
    const control = mountInline(makeNode());
    expect(scrollersIn(control.el)).toEqual([]);
  });

  it("keeps the scroller in the pack's own modal, where the height IS definite", () => {
    mountInline(makeNode()); // ensure the stylesheet is injected
    const fixture = makeNode();
    const control = buildSeedControl(fixture.seed, fixture.node, fixture.control, {
      variant: "modal",
    });
    document.body.appendChild(control.el);
    expect(scrollersIn(control.el)).toContain("tn-history");
  });

  it("caps how many history rows it renders inline", () => {
    // Resetting overflow alone would let 24 entries push the rest of the host's
    // field list far below the fold.
    mountInline(makeNode());
    const fixture = makeNode({ seedValue: 1 });
    const control = buildSeedControl(fixture.seed, fixture.node, fixture.control, {
      variant: "inline",
    });
    const keys = [...control.el.querySelectorAll(".tn-key")];
    for (let i = 1; i <= 9; i++) {
      keys.find((k) => k.textContent === "C").click();
      keys.find((k) => k.textContent === String(i)).click();
      control.recordHistory();
    }
    const rows = control.el.querySelectorAll(".tn-history-item").length;
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(5);
    expect(control.el.textContent).toMatch(/more/i);
  });
});

describe("modal variant (this pack's own canvas modal)", () => {
  it("keeps the segmented control — it owns its own commit here", () => {
    const fixture = makeNode();
    const control = buildSeedControl(fixture.seed, fixture.node, fixture.control, {
      variant: "modal",
    });
    const seg = control.el.querySelector(".tn-seg");
    expect(seg).not.toBeNull();
    expect(seg.querySelectorAll(".tn-seg-btn").length).toBe(CONTROL_VALUES.length);
  });

  it("names the latch for what it actually guards", () => {
    // It gates the keypad, the value field, Randomize and history restore —
    // not `control_after_generate: fixed`, and not Apply. "Lock" next to an
    // "After generate" control invites the generation-time reading.
    const fixture = makeNode();
    const control = buildSeedControl(fixture.seed, fixture.node, fixture.control, {
      variant: "modal",
    });
    expect(lockButton(control.el).textContent).toMatch(/keypad lock/i);
  });

  it("the latch blocks the keypad while engaged", () => {
    const fixture = makeNode({ seedValue: 42 });
    const control = buildSeedControl(fixture.seed, fixture.node, fixture.control, {
      variant: "modal",
    });
    lockButton(control.el).click();
    [...control.el.querySelectorAll(".tn-key")].find((b) => b.textContent === "7").click();
    expect(control.getSeed()).toBe(42n);
  });
});
