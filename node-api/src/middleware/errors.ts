import type { ErrorRequestHandler } from "express";
import { ApiError } from "../utils/api-error.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  let publicError =
    error instanceof ApiError
      ? error
      : new ApiError(500, "INTERNAL_ERROR", "An internal error occurred");
  const parserError = error as { type?: string; status?: number } | null;
  if (parserError?.type === "entity.parse.failed") {
    publicError = new ApiError(
      400,
      "INVALID_JSON",
      "Request body must be valid JSON",
    );
  }
  if (parserError?.type === "entity.too.large") {
    publicError = new ApiError(
      413,
      "PAYLOAD_TOO_LARGE",
      "Request body exceeds 4 MiB",
    );
  }
  if (parserError?.status === 415) {
    publicError = new ApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Unsupported request encoding",
    );
  }
  if (publicError.status >= 500) {
    console.error(
      JSON.stringify({
        level: "error",
        event: "request_failed",
        code: publicError.code,
        path: request.path,
      }),
    );
  }
  response
    .status(publicError.status)
    .json({ error: { code: publicError.code, message: publicError.message } });
};
