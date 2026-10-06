export type Matrix = number[][];
export interface ProcessResult {
  q: Matrix;
  r: Matrix;
  rotation: Matrix;
  statistics: {
    max: number;
    min: number;
    average: number;
    sum: number;
    count: number;
    diagonal: { q: boolean; r: boolean; any: boolean };
    epsilon: number;
  };
}
