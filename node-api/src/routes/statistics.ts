import { Router } from "express";
import { statisticsController } from "../controllers/statistics.js";

export const statisticsRouter = Router();
statisticsRouter.post("/statistics", statisticsController);
