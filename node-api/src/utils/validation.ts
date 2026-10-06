import { ApiError } from "./api-error.js";
import type { Matrix, StatisticsInput } from "../types/matrix.js";

export const MAX_DIMENSION = 256;

export function validateMatrix(value: unknown): Matrix {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ApiError(
      400,
      "INVALID_MATRIX",
      "Matrix must be a non-empty array",
    );
  }
  let columnCount: number | undefined;
  for (const row of value) {
    if (!Array.isArray(row) || row.length === 0) {
      throw new ApiError(
        400,
        "INVALID_MATRIX",
        "Rows must be non-empty arrays",
      );
    }
    columnCount ??= row.length;
    if (row.length !== columnCount) {
      throw new ApiError(
        400,
        "INVALID_MATRIX",
        "All rows must have the same number of columns",
      );
    }
    if (value.length > MAX_DIMENSION || columnCount > MAX_DIMENSION) {
      throw new ApiError(
        413,
        "MATRIX_TOO_LARGE",
        "Matrix dimensions must not exceed 256",
      );
    }
    for (const element of row) {
      if (typeof element !== "number" || !Number.isFinite(element)) {
        throw new ApiError(
          400,
          "INVALID_MATRIX",
          "All values must be finite numbers",
        );
      }
    }
  }
  return value as Matrix;
}

export function validateStatisticsInput(value: unknown): StatisticsInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(
      400,
      "INVALID_INPUT",
      "Expected an object with q and r fields",
    );
  }
  const requestBody = value as Record<string, unknown>;
  if (
    Object.keys(requestBody).length !== 2 ||
    !("q" in requestBody) ||
    !("r" in requestBody)
  ) {
    throw new ApiError(400, "INVALID_INPUT", "Expected only q and r fields");
  }
  return { q: validateMatrix(requestBody.q), r: validateMatrix(requestBody.r) };
}
