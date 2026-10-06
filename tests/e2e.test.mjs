import assert from "node:assert/strict";
import { test } from "node:test";

const goURL = process.env.E2E_BASE_URL || "http://localhost:8080";
const nodeURL = process.env.E2E_NODE_URL || "http://localhost:3000";
const tolerance = 1e-10;
let seed = 42;
const dense = Array.from({ length: 200 }, () =>
  Array.from({ length: 200 }, () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return Math.round((seed / 2 ** 32 - 0.5) * 1e6) / 1e5;
  }),
);

async function post(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}

function verifyResult(originalMatrix, result) {
  const { q, r, rotation, statistics } = result;
  const rowCount = originalMatrix.length,
    columnCount = originalMatrix[0].length,
    factorSize = Math.min(rowCount, columnCount);
  assert.equal(q.length, rowCount);
  assert.equal(q[0].length, factorSize);
  assert.equal(r.length, factorSize);
  assert.equal(r[0].length, columnCount);
  let maxResidual = 0;
  for (let i = 0; i < rowCount; i++)
    for (let j = 0; j < columnCount; j++) {
      const actual = q[i].reduce(
        (sum, value, factorIndex) => sum + value * r[factorIndex][j],
        0,
      );
      const residual = Math.abs(actual - originalMatrix[i][j]);
      maxResidual = Math.max(maxResidual, residual);
      assert.ok(
        residual <= tolerance * Math.max(1, Math.abs(originalMatrix[i][j])),
        `A != QR at ${i},${j}`,
      );
    }
  for (let i = 0; i < factorSize; i++)
    for (let j = 0; j < factorSize; j++) {
      const dot = q.reduce((sum, row) => sum + row[i] * row[j], 0);
      assert.ok(
        Math.abs(dot - (i === j ? 1 : 0)) < tolerance,
        "Q is not orthonormal",
      );
    }
  assert.deepEqual(
    rotation,
    Array.from({ length: columnCount }, (_, j) =>
      Array.from(
        { length: rowCount },
        (_, i) => originalMatrix[rowCount - 1 - i][j],
      ),
    ),
  );
  const values = [...q.flat(), ...r.flat()];
  assert.equal(statistics.count, values.length);
  assert.equal(statistics.max, Math.max(...values));
  assert.equal(statistics.min, Math.min(...values));
  const sum = values.reduce((total, value) => total + value, 0);
  assert.ok(
    Math.abs(statistics.sum - sum) <= tolerance * Math.max(1, Math.abs(sum)),
  );
  assert.ok(
    Math.abs(statistics.average - sum / values.length) <=
      tolerance * Math.max(1, Math.abs(sum / values.length)),
  );
  const diagonal = (matrix) =>
    matrix.length === matrix[0].length &&
    matrix.every((row, i) =>
      row.every((value, j) => i === j || Math.abs(value) <= statistics.epsilon),
    );
  assert.deepEqual(statistics.diagonal, {
    q: diagonal(q),
    r: diagonal(r),
    any: diagonal(q) || diagonal(r),
  });
  assert.equal(statistics.epsilon, 1e-10);
  return maxResidual;
}

for (const [name, url] of [
  ["Go", goURL],
  ["Node", nodeURL],
]) {
  test(`${name} health over real HTTP`, async () => {
    const response = await fetch(url + "/health", {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, "ok");
  });
}
for (const [name, matrix] of [
  [
    "square",
    [
      [1, 2],
      [3, 4],
    ],
  ],
  [
    "tall rectangular",
    [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
  ],
  [
    "wide rectangular",
    [
      [1, 2, 3],
      [4, 5, 6],
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
  [
    "singular",
    [
      [1, 2],
      [2, 4],
    ],
  ],
  [
    "zero",
    [
      [0, 0],
      [0, 0],
    ],
  ],
  ["dense 200x200", dense],
]) {
  test(`Go -> Node: ${name}`, async (context) => {
    const result = await post(goURL + "/api/v1/process", { matrix });
    assert.equal(result.status, 200);
    const residual = verifyResult(matrix, result.body);
    context.diagnostic(`maximum |A - QR| = ${residual}`);
  });
}
for (const [name, payload, code] of [
  ["irregular", { matrix: [[1], [2, 3]] }, "INVALID_MATRIX"],
  ["empty", { matrix: [] }, "INVALID_MATRIX"],
  ["empty row", { matrix: [[]] }, "INVALID_MATRIX"],
  ["null element", { matrix: [[null]] }, "INVALID_MATRIX"],
  ["string element", { matrix: [["1"]] }, "INVALID_MATRIX"],
  ["wrong object", {}, "INVALID_INPUT"],
]) {
  test(`Go rejects ${name}`, async () => {
    const result = await post(goURL + "/api/v1/process", payload);
    assert.equal(result.status, 400);
    assert.equal(result.body.error.code, code);
    assert.deepEqual(Object.keys(result.body.error).sort(), [
      "code",
      "message",
    ]);
  });
}
test("Go rejects malformed JSON", async () => {
  const response = await fetch(goURL + "/api/v1/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
    signal: AbortSignal.timeout(5000),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INVALID_JSON");
});
test("Node rejects irregular input directly", async () => {
  const result = await post(nodeURL + "/api/v1/statistics", {
    q: [[1], [2, 3]],
    r: [[1]],
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.error.code, "INVALID_MATRIX");
});
test("QR and rotation work independently", async () => {
  const qr = await post(goURL + "/api/v1/matrices/qr", {
    matrix: [
      [1, 2],
      [3, 4],
    ],
  });
  assert.equal(qr.status, 200);
  assert.ok(qr.body.q && qr.body.r);
  const rotation = await post(goURL + "/api/v1/matrices/rotate", {
    matrix: [
      [1, 2],
      [3, 4],
    ],
  });
  assert.equal(rotation.status, 200);
  assert.deepEqual(rotation.body.rotation, [
    [3, 1],
    [4, 2],
  ]);
});
