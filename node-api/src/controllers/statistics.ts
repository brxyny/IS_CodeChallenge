import type { Request, Response } from "express";
import { calculateStatistics } from "../services/statistics.js";

export function statisticsController(
  request: Request,
  response: Response,
): void {
  response.json(calculateStatistics(request.body));
}
