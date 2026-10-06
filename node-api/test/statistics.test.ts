import { describe, expect, it } from "vitest";
import {
  calculateStatistics,
  EPSILON,
  isDiagonal,
} from "../src/services/statistics.js";
import { loadPort } from "../src/utils/config.js";

describe("statistics", () => {
  it("aggregates every Q and R element, including zeros", () => {
    expect(
      calculateStatistics({
        q: [
          [1, 0],
          [0, 1],
        ],
        r: [
          [2, 3],
          [0, 4],
        ],
      }),
    ).toEqual({
      max: 4,
      min: 0,
      sum: 11,
      average: 11 / 8,
      count: 8,
      diagonal: { q: true, r: false, any: true },
      epsilon: EPSILON,
    });
  });
  it("handles only negative values", () => {
    expect(calculateStatistics({ q: [[-5, -2]], r: [[-3, -4]] })).toMatchObject(
      {
        max: -2,
        min: -5,
        sum: -14,
        average: -3.5,
        diagonal: { q: false, r: false, any: false },
      },
    );
  });
  it("handles decimals", () => {
    const result = calculateStatistics({ q: [[0.1, 0.2]], r: [[-0.3, 0.4]] });
    expect(result.sum).toBeCloseTo(0.4, 14);
    expect(result.average).toBeCloseTo(0.1, 14);
  });
  it("preserves small terms with cancellation", () => {
    expect(calculateStatistics({ q: [[1e16, 1]], r: [[-1e16]] }).sum).toBe(1);
  });
  it("rejects unrepresentable sum", () => {
    expect(() =>
      calculateStatistics({ q: [[Number.MAX_VALUE]], r: [[Number.MAX_VALUE]] }),
    ).toThrow("floating-point range");
  });
  it.each([
    [
      [
        [1, 0],
        [0, 2],
      ],
      true,
    ],
    [
      [
        [0, 0],
        [0, 0],
      ],
      true,
    ],
    [
      [
        [1, EPSILON],
        [-EPSILON, 2],
      ],
      true,
    ],
    [
      [
        [1, 2 * EPSILON],
        [0, 2],
      ],
      false,
    ],
    [
      [
        [1, 0, 0],
        [0, 2, 0],
      ],
      false,
    ],
    [[[1], [0]], false],
    [[[2]], true],
  ])("detects diagonal %j", (matrix, expected) => {
    expect(isDiagonal(matrix as number[][])).toBe(expected);
  });
  it.each([
    null,
    [],
    {},
    { q: [], r: [[1]] },
    { q: [[]], r: [[1]] },
    { q: [[1], [2, 3]], r: [[1]] },
    { q: [[null]], r: [[1]] },
    { q: [["1"]], r: [[1]] },
    { q: [[Infinity]], r: [[1]] },
    { q: [[NaN]], r: [[1]] },
    { q: [[true]], r: [[1]] },
    { q: [[1]], r: [[1]], extra: 1 },
  ])("rejects invalid input %j", (value) => {
    expect(() => calculateStatistics(value)).toThrow();
  });
  it("rejects excessive dimensions", () => {
    expect(() =>
      calculateStatistics({ q: [Array(257).fill(0)], r: [[1]] }),
    ).toThrow("256");
  });
});

describe("configuration", () => {
  it("uses defaults and Cloud Run PORT", () => {
    expect(loadPort({})).toBe(3000);
    expect(loadPort({ PORT: "8080" })).toBe(8080);
    expect(loadPort({ PORT: "8080", NODE_PORT: "3001" })).toBe(3001);
  });
  it.each(["abc", "0", "-1", "65536", "1.5", "3000suffix"])(
    "rejects port %s",
    (port) => {
      expect(() => loadPort({ NODE_PORT: port })).toThrow();
    },
  );
});
