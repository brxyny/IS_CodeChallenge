import request from "supertest";
import express from "express";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { errorHandler } from "../src/middleware/errors.js";

const app = createApp();
describe("HTTP API", () => {
  it("health", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
  it("statistics", async () => {
    const res = await request(app)
      .post("/api/v1/statistics")
      .send({ q: [[1]], r: [[2]] });
    expect(res.status).toBe(200);
    expect(res.body.sum).toBe(3);
  });
  it("invalid JSON", async () => {
    const res = await request(app)
      .post("/api/v1/statistics")
      .set("Content-Type", "application/json")
      .send("{");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
  it.each([
    [],
    null,
    { q: [[1]] },
    { q: [[1], [2, 3]], r: [[1]] },
    { q: [[null]], r: [[1]] },
  ])("invalid input %j", async (input) => {
    const res = await request(app)
      .post("/api/v1/statistics")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(input));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBeTypeOf("string");
    expect(res.body.error.stack).toBeUndefined();
  });
  it("JSON numeric overflow is invalid", async () => {
    const res = await request(app)
      .post("/api/v1/statistics")
      .set("Content-Type", "application/json")
      .send('{"q":[[1e400]],"r":[[1]]}');
    expect(res.status).toBe(400);
  });
  it("content type", async () => {
    const res = await request(app)
      .post("/api/v1/statistics")
      .set("Content-Type", "text/plain")
      .send("hello");
    expect(res.status).toBe(415);
  });
  it("body limit", async () => {
    const res = await request(app)
      .post("/api/v1/statistics")
      .set("Content-Type", "application/json")
      .send(" ".repeat(4 * 1024 * 1024 + 1));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });
  it("unknown route", async () => {
    const res = await request(app).get("/missing");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
  it("internal error never leaks details", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const broken = express();
      broken.get("/", () => {
        throw new Error("sensitive details");
      });
      broken.use(errorHandler);
      const res = await request(broken).get("/");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred",
        },
      });
    } finally {
      spy.mockRestore();
    }
  });
});
