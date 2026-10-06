import { createApp } from "./app.js";
import { loadPort } from "./utils/config.js";

const port = loadPort();
const server = createApp().listen(port, "0.0.0.0", () => {
  console.log(
    JSON.stringify({ level: "info", event: "server_starting", port }),
  );
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.on("error", (error) => {
  console.error(
    JSON.stringify({
      level: "error",
      event: "server_failed",
      message: error.message,
    }),
  );
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
