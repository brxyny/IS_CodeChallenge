export function loadPort(environment: NodeJS.ProcessEnv = process.env): number {
  const raw = environment.NODE_PORT || environment.PORT || "3000";
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535) {
    throw new Error("NODE_PORT/PORT must be a valid port");
  }
  return Number(raw);
}
