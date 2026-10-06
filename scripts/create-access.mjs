import { randomBytes } from "node:crypto";
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const username = process.argv[2] || "reviewer";
if (!/^[a-zA-Z0-9_-]{1,32}$/.test(username)) {
  throw new Error(
    "Username must contain 1–32 letters, digits, underscores or hyphens",
  );
}
const secretsDirectory = resolve(projectRoot, ".secrets");
const passwordFile = resolve(secretsDirectory, "reviewer.htpasswd");
const credentialsFile = resolve(projectRoot, "work/access-credentials.txt");
if (existsSync(passwordFile) || existsSync(credentialsFile)) {
  throw new Error(
    "Access already exists. Remove the ignored password file explicitly to rotate credentials.",
  );
}
const password = randomBytes(24).toString("base64url");
const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "-i",
    "httpd:2.4-alpine",
    "htpasswd",
    "-Bni",
    "-C",
    "10",
    username,
  ],
  { input: password + "\n", encoding: "utf8" },
);
if (result.status !== 0 || !result.stdout.startsWith(username + ":$2")) {
  throw new Error(
    "Unable to generate bcrypt credentials. Check that Docker is running.",
  );
}
mkdirSync(secretsDirectory, { recursive: true, mode: 0o700 });
mkdirSync(resolve(projectRoot, "work"), { recursive: true, mode: 0o700 });
writeFileSync(passwordFile, result.stdout, { mode: 0o644, flag: "wx" });
writeFileSync(
  credentialsFile,
  `Username: ${username}\nPassword: ${password}\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Access created. Credentials: work/access-credentials.txt (ignored by Git).",
);
