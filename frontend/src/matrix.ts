import type { Matrix } from "./types";

export function parseMatrix(text: string): Matrix {
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new Error(
      "Ingresa una matriz en JSON válido, por ejemplo [[1, 2], [3, 4]].",
    );
  }
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("La matriz debe contener al menos una fila.");
  }
  if (!Array.isArray(input[0]) || input[0].length === 0) {
    throw new Error("Cada fila debe contener al menos un número.");
  }
  const columnCount = input[0].length;
  if (input.length > 256 || columnCount > 256) {
    throw new Error("El límite de esta demo es de 256 filas y 256 columnas.");
  }
  for (const row of input) {
    if (!Array.isArray(row) || row.length !== columnCount) {
      throw new Error(
        "Todas las filas deben tener la misma cantidad de columnas.",
      );
    }
    if (
      row.some((value) => typeof value !== "number" || !Number.isFinite(value))
    ) {
      throw new Error(
        "Los elementos deben ser números finitos; no se aceptan strings ni null.",
      );
    }
  }
  return input as Matrix;
}

export function reconstructionError(
  original: Matrix,
  q: Matrix,
  r: Matrix,
): number {
  let maximum = 0;
  for (let rowIndex = 0; rowIndex < original.length; rowIndex++) {
    for (let columnIndex = 0; columnIndex < original[0].length; columnIndex++) {
      const reconstructed = q[rowIndex].reduce(
        (sum, value, factorIndex) => sum + value * r[factorIndex][columnIndex],
        0,
      );
      const residual = Math.abs(
        original[rowIndex][columnIndex] - reconstructed,
      );
      if (!Number.isFinite(residual)) return Infinity;
      maximum = Math.max(maximum, residual);
    }
  }
  return maximum;
}

export function formatNumber(value: number): string {
  if (value === 0 || Object.is(value, -0)) return "0";
  const magnitude = Math.abs(value);
  if (magnitude < 1e-4 || magnitude >= 1e6) return value.toExponential(4);
  return new Intl.NumberFormat("es-PE", { maximumFractionDigits: 6 }).format(
    value,
  );
}
