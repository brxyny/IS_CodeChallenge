export type Matrix = number[][];
export interface StatisticsInput {
  q: Matrix;
  r: Matrix;
}
export interface StatisticsResult {
  max: number;
  min: number;
  average: number;
  sum: number;
  count: number;
  diagonal: { q: boolean; r: boolean; any: boolean };
  epsilon: number;
}
