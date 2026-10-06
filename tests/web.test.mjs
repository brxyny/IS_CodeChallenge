import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const baseURL = process.env.WEB_BASE_URL || "http://localhost:8081";
const credentials = readFileSync(
  new URL("../work/access-credentials.txt", import.meta.url),
  "utf8",
);
const username = credentials.match(/^Username: (.+)$/m)?.[1];
const password = credentials.match(/^Password: (.+)$/m)?.[1];
assert.ok(
  username && password,
  "Create local access credentials before testing the gateway",
);
const authorization =
  "Basic " + Buffer.from(`${username}:${password}`).toString("base64");

function request(path, options = {}, authenticated = true) {
  return fetch(baseURL + path, {
    ...options,
    headers: {
      ...(authenticated ? { Authorization: authorization } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(15000),
    redirect: "manual",
  });
}
function processMatrix(matrix, authenticated = true) {
  return request(
    "/api/v1/process",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matrix }),
    },
    authenticated,
  );
}

test("UI and processing require credentials", async () => {
  assert.equal((await request("/", {}, false)).status, 401);
  assert.equal((await processMatrix([[1]], false)).status, 401);
  assert.equal(
    (
      await request("/", {
        headers: {
          Authorization:
            "Basic " + Buffer.from("invalid:invalid").toString("base64"),
        },
      })
    ).status,
    401,
  );
});
test("authenticated UI, security headers and assets", async () => {
  const response = await request("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  assert.match(
    response.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  const html = await response.text();
  assert.match(html, /Matrix Lab/);
  assert.equal((await request("/favicon.svg")).status, 200);
  assert.equal((await request("/favicon.svg", {}, false)).status, 401);
  const paths = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)].map(
    (match) => match[1],
  );
  assert.ok(paths.length >= 2);
  for (const path of paths) {
    assert.equal((await request(path)).status, 200);
    assert.equal((await request(path, {}, false)).status, 401);
  }
});
for (const path of [
  "/.env",
  "/.git/config",
  "/admin",
  "/uploads",
  "/api/v1/statistics",
  "/health",
  "/index.html",
  "/api/v1/process/other",
]) {
  test(`unnecessary path is inaccessible: ${path}`, async () => {
    assert.equal((await request(path)).status, 404);
  });
}
test("gateway rejects unexpected methods", async () => {
  assert.equal((await request("/api/v1/process")).status, 403);
  assert.equal((await request("/", { method: "POST" })).status, 403);
});
for (const [name, matrix] of [
  [
    "square",
    [
      [1, 2],
      [3, 4],
    ],
  ],
  [
    "rectangular",
    [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
  ],
  [
    "negative",
    [
      [-1, -2],
      [-3, -4],
    ],
  ],
  [
    "decimal",
    [
      [0.1, 1.25],
      [-2.75, 4.5],
    ],
  ],
]) {
  test(`authenticated gateway -> Go -> Node: ${name}`, async () => {
    const response = await processMatrix(matrix);
    assert.equal(response.status, 200);
    const { q, r, statistics } = await response.json();
    for (let rowIndex = 0; rowIndex < matrix.length; rowIndex++) {
      for (let columnIndex = 0; columnIndex < matrix[0].length; columnIndex++) {
        const reconstructed = q[rowIndex].reduce(
          (sum, value, factorIndex) =>
            sum + value * r[factorIndex][columnIndex],
          0,
        );
        assert.ok(
          Math.abs(reconstructed - matrix[rowIndex][columnIndex]) < 1e-10,
        );
      }
    }
    assert.equal(statistics.count, q.flat().length + r.flat().length);
  });
}
for (const [name, matrix] of [
  ["empty", []],
  ["irregular", [[1], [2, 3]]],
]) {
  test(`authenticated gateway preserves ${name} input errors`, async () => {
    const response = await processMatrix(matrix);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_MATRIX");
  });
}
