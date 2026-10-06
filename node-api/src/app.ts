import express from "express";
import { statisticsRouter } from "./routes/statistics.js";
import { errorHandler } from "./middleware/errors.js";
import { ApiError } from "./utils/api-error.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "node-api" });
  });
  app.use("/api/v1", (request, _response, next) => {
    if (request.method === "POST" && !request.is("application/json")) {
      return next(
        new ApiError(
          415,
          "UNSUPPORTED_MEDIA_TYPE",
          "Content-Type must be application/json",
        ),
      );
    }
    next();
  });
  app.use(express.json({ limit: "4mb", strict: false, inflate: false }));
  app.use("/api/v1", statisticsRouter);
  app.use((_request, _response, next) => {
    next(new ApiError(404, "NOT_FOUND", "Route not found"));
  });
  app.use(errorHandler);
  return app;
}
