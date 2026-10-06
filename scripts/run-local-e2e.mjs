import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
const nodePort = await freePort(),
  goPort = await freePort();
const nodeURL = `http://127.0.0.1:${nodePort}`,
  goURL = `http://127.0.0.1:${goPort}`;
const children = [];
function launch(command, args, environment, cwd = root) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...environment },
    stdio: "inherit",
    windowsHide: true,
  });
  child.on("error", (error) => {
    child.startupError = error;
    console.error(error.message);
  });
  children.push(child);
  return child;
}
async function ready(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.startupError) throw child.startupError;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`Service exited before becoming ready: ${url}`);
    try {
      const response = await fetch(url + "/health", {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
    } catch {
      /* Startup may take a moment. */
    }
    await delay(100);
  }
  throw new Error(`Service did not become ready: ${url}`);
}
async function waitExit(child) {
  if (child.startupError) throw child.startupError;
  if (child.exitCode !== null || child.signalCode !== null)
    return child.exitCode;
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}

try {
  const node = launch(
    process.execPath,
    ["dist/server.js"],
    { NODE_PORT: String(nodePort) },
    resolve(root, "node-api"),
  );
  await ready(nodeURL, node);
  const executable =
    process.env.GO_BINARY ||
    resolve(
      root,
      "work/bin",
      process.platform === "win32" ? "go-api.exe" : "go-api",
    );
  const go = launch(executable, [], {
    GO_PORT: String(goPort),
    NODE_API_URL: nodeURL,
    HTTP_TIMEOUT_SECONDS: "2",
  });
  await ready(goURL, go);
  const tests = launch(process.execPath, ["--test", "tests/e2e.test.mjs"], {
    E2E_BASE_URL: goURL,
    E2E_NODE_URL: nodeURL,
  });
  const exit = await waitExit(tests);
  if (exit !== 0) throw new Error(`E2E suite failed (${exit})`);
  const stopped = waitExit(node);
  node.kill("SIGTERM");
  await stopped;
  const response = await fetch(goURL + "/api/v1/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matrix: [
        [1, 2],
        [3, 4],
      ],
    }),
    signal: AbortSignal.timeout(5000),
  });
  const body = await response.json();
  if (response.status !== 502 || body.error.code !== "NODE_UNAVAILABLE")
    throw new Error("Node outage was not handled correctly");
  const independent = await fetch(goURL + "/api/v1/matrices/qr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      matrix: [
        [1, 2],
        [3, 4],
      ],
    }),
  });
  if (independent.status !== 200)
    throw new Error("Independent QR endpoint failed during Node outage");
  console.log(
    "PASS: real Node outage returns 502 NODE_UNAVAILABLE; standalone QR remains available",
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  for (const child of children)
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      const stopped = waitExit(child);
      child.kill("SIGTERM");
      await stopped;
    }
}
