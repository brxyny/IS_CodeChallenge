import type { Matrix, StatisticsResult } from "../types/matrix.js";
import { validateStatisticsInput } from "../utils/validation.js";
import { ApiError } from "../utils/api-error.js";

export const EPSILON = 1e-10;

export function isDiagonal(matrix: Matrix): boolean {
  if (matrix.length !== matrix[0]?.length) return false;
  return matrix.every((row, rowIndex) =>
    row.every(
      (value, columnIndex) =>
        rowIndex === columnIndex || Math.abs(value) <= EPSILON,
    ),
  );
}

export function calculateStatistics(input: unknown): StatisticsResult {
  const { q, r } = validateStatisticsInput(input);
  let max = -Infinity;
  let min = Infinity;
  let sum = 0;
  let compensation = 0;
  let elementCount = 0;
  // Neumaier compensated summation preserves small terms during cancellation.
  for (const matrix of [q, r]) {
    for (const row of matrix) {
      for (const value of row) {
        max = Math.max(max, value);
        min = Math.min(min, value);
        const nextSum = sum + value;
        if (Math.abs(sum) >= Math.abs(value)) {
          compensation += sum - nextSum + value;
        } else {
          compensation += value - nextSum + sum;
        }
        sum = nextSum;
        elementCount++;
      }
    }
  }
  sum += compensation;
  if (!Number.isFinite(sum)) {
    throw new ApiError(
      422,
      "STATISTICS_FAILED",
      "Sum exceeds floating-point range",
    );
  }
  const qDiagonal = isDiagonal(q);
  const rDiagonal = isDiagonal(r);
  return {
    max,
    min,
    average: sum / elementCount,
    sum,
    count: elementCount,
    diagonal: { q: qDiagonal, r: rDiagonal, any: qDiagonal || rDiagonal },
    epsilon: EPSILON,
  };
}
