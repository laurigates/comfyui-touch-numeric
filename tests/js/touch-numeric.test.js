import { beforeAll, describe, expect, it } from "vitest";

// crypto.getRandomValues exists in Node's global webcrypto (Node 19+), but
// be defensive: the helper module reads `crypto` at call time.
beforeAll(async () => {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    const { webcrypto } = await import("node:crypto");
    globalThis.crypto = webcrypto;
  }
});

import {
  clampSeed,
  findAdjacentWidget,
  nextSeedHistory,
  parseSeedInput,
  randomSeed64,
  seedToWidgetValue,
  widgetProfile,
  widgetValueToSeed,
} from "../../web/js/touch-numeric.js";

const MAX_SEED = (1n << 64n) - 1n;

describe("randomSeed64", () => {
  it("stays within [0, MAX_SEED] across many draws", () => {
    for (let i = 0; i < 500; i++) {
      const s = randomSeed64();
      expect(typeof s).toBe("bigint");
      expect(s >= 0n).toBe(true);
      expect(s <= MAX_SEED).toBe(true);
    }
  });

  it("can produce values above Number.MAX_SAFE_INTEGER (full 64-bit range)", () => {
    const safe = BigInt(Number.MAX_SAFE_INTEGER);
    let sawLarge = false;
    for (let i = 0; i < 2000 && !sawLarge; i++) {
      if (randomSeed64() > safe) sawLarge = true;
    }
    expect(sawLarge).toBe(true);
  });

  it("does not repeat trivially", () => {
    const a = randomSeed64();
    const b = randomSeed64();
    // Collision probability over 2^64 is negligible.
    expect(a === b).toBe(false);
  });
});

describe("parseSeedInput", () => {
  it("parses the 18-digit value the native scrub cannot land", () => {
    expect(parseSeedInput("123456789012345678")).toBe(123456789012345678n);
  });

  it("tolerates whitespace, thousands separators, and a leading +", () => {
    expect(parseSeedInput("  1,234,567  ")).toBe(1234567n);
    expect(parseSeedInput("+42")).toBe(42n);
    expect(parseSeedInput("1_000")).toBe(1000n);
  });

  it("clamps above the 64-bit ceiling", () => {
    expect(parseSeedInput("99999999999999999999999")).toBe(MAX_SEED);
  });

  it("rejects non-integers, negatives, hex, and empties", () => {
    expect(parseSeedInput("")).toBeNull();
    expect(parseSeedInput("   ")).toBeNull();
    expect(parseSeedInput("-5")).toBeNull();
    expect(parseSeedInput("3.14")).toBeNull();
    expect(parseSeedInput("0xff")).toBeNull();
    expect(parseSeedInput("abc")).toBeNull();
    expect(parseSeedInput("1e9")).toBeNull();
    expect(parseSeedInput(null)).toBeNull();
    expect(parseSeedInput(123)).toBeNull();
  });
});

describe("clampSeed", () => {
  it("clamps below 0 and above MAX_SEED, passes through interior values", () => {
    expect(clampSeed(-1n)).toBe(0n);
    expect(clampSeed(0n)).toBe(0n);
    expect(clampSeed(7n)).toBe(7n);
    expect(clampSeed(MAX_SEED)).toBe(MAX_SEED);
    expect(clampSeed(MAX_SEED + 1n)).toBe(MAX_SEED);
  });
});

describe("seedToWidgetValue", () => {
  it("returns a Number when the seed fits in a safe integer", () => {
    const v = seedToWidgetValue(42n);
    expect(typeof v).toBe("number");
    expect(v).toBe(42);
  });

  it("returns a decimal string for values beyond safe-integer range", () => {
    const big = BigInt(Number.MAX_SAFE_INTEGER) + 10n;
    const v = seedToWidgetValue(big);
    expect(typeof v).toBe("string");
    expect(v).toBe(big.toString());
  });

  it("never loses precision on the 18-digit case", () => {
    const s = 123456789012345678n;
    expect(seedToWidgetValue(s)).toBe("123456789012345678");
  });
});

describe("widgetValueToSeed", () => {
  it("reads Number, string, and bigint seed values", () => {
    expect(widgetValueToSeed(42)).toBe(42n);
    expect(widgetValueToSeed("123")).toBe(123n);
    expect(widgetValueToSeed(7n)).toBe(7n);
  });

  it("truncates fractional Numbers and clamps", () => {
    expect(widgetValueToSeed(3.9)).toBe(3n);
    expect(widgetValueToSeed(-2)).toBe(0n);
  });

  it("returns null for unparseable inputs", () => {
    expect(widgetValueToSeed(null)).toBeNull();
    expect(widgetValueToSeed(undefined)).toBeNull();
    expect(widgetValueToSeed(Number.NaN)).toBeNull();
    expect(widgetValueToSeed("nope")).toBeNull();
  });
});

describe("nextSeedHistory", () => {
  it("prepends newest first", () => {
    let h = [];
    h = nextSeedHistory(h, 1n);
    h = nextSeedHistory(h, 2n);
    expect(h).toEqual([2n, 1n]);
  });

  it("de-duplicates an immediate repeat (no-op)", () => {
    const h = nextSeedHistory([5n, 4n], 5n);
    expect(h).toEqual([5n, 4n]);
  });

  it("moves a re-used older seed back to the front", () => {
    const h = nextSeedHistory([3n, 2n, 1n], 1n);
    expect(h).toEqual([1n, 3n, 2n]);
  });

  it("caps at the limit", () => {
    let h = [];
    for (let i = 0; i < 10; i++) h = nextSeedHistory(h, BigInt(i), 3);
    expect(h).toEqual([9n, 8n, 7n]);
  });

  it("tolerates a non-array history", () => {
    expect(nextSeedHistory(undefined, 1n)).toEqual([1n]);
  });
});

describe("findAdjacentWidget", () => {
  it("finds a widget by name on the same node", () => {
    const ctrl = { name: "control_after_generate" };
    const node = { widgets: [{ name: "seed" }, ctrl] };
    expect(findAdjacentWidget(node, "control_after_generate")).toBe(ctrl);
  });

  it("returns null when absent or node has no widgets", () => {
    expect(
      findAdjacentWidget({ widgets: [{ name: "seed" }] }, "control_after_generate"),
    ).toBeNull();
    expect(findAdjacentWidget(null, "x")).toBeNull();
    expect(findAdjacentWidget({}, "x")).toBeNull();
  });
});

describe("widgetProfile", () => {
  it("classifies seed and noise_seed as the seed profile", () => {
    expect(widgetProfile({ name: "seed" })).toBe("seed");
    expect(widgetProfile({ name: "noise_seed" })).toBe("seed");
  });

  it("returns null for non-target widgets (v0.2 numeric not yet wired)", () => {
    expect(widgetProfile({ name: "cfg" })).toBeNull();
    expect(widgetProfile({ name: "control_after_generate" })).toBeNull();
    expect(widgetProfile(null)).toBeNull();
  });
});
