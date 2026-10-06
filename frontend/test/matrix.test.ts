import { describe, expect, it } from "vitest";
import { formatNumber, parseMatrix, reconstructionError } from "../src/matrix";

describe("matrix editor", () => {
  it("accepts rectangular matrices with negatives and decimals", () => {
    expect(parseMatrix("[[-1, 0.2, 3], [4, -5.5, 6]]")).toEqual([
      [-1, 0.2, 3],
      [4, -5.5, 6],
    ]);
  });
  it.each([
    "{",
    "[]",
    "[[]]",
    "[[1], [2,3]]",
    "[[null]]",
    '[["1"]]',
    "[[1e400]]",
    "{}",
  ])("rejects %s", (input) => {
    expect(() => parseMatrix(input)).toThrow();
  });
  it("limits large matrices before submitting them", () => {
    expect(() => parseMatrix(JSON.stringify([Array(257).fill(1)]))).toThrow(
      "256",
    );
  });
  it("measures reconstruction error independently of display rounding", () => {
    expect(reconstructionError([[1, 2]], [[1]], [[1, 2]])).toBe(0);
    expect(reconstructionError([[1, 2]], [[1]], [[1, 2.1]])).toBeCloseTo(0.1);
  });
  it("preserves tiny nonzero values in the display", () => {
    expect(formatNumber(-0)).toBe("0");
    expect(formatNumber(1e-15)).toBe("1.0000e-15");
  });
});
