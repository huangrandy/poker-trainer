import { execFileSync } from "node:child_process";
import { startCoachServer } from "./index.mjs";

const codexBin = process.env.CODEX_BIN ?? "/Users/randy/.local/bin/codex";
const port = Number(process.env.PORT ?? "8787");

process.env.COACH_PROVIDER = process.env.COACH_PROVIDER ?? "app-server";
process.env.COACH_MODEL = process.env.COACH_MODEL ?? "gpt-5.4-mini";
process.env.COACH_REASONING_EFFORT = process.env.COACH_REASONING_EFFORT ?? "low";

try {
  execFileSync(codexBin, ["app-server", "daemon", "start"], {
    stdio: "inherit",
  });
} catch (error) {
  console.warn("[coach] codex daemon startup failed; continuing with existing daemon if available.");
}

const { port: actualPort } = await startCoachServer({ port });

console.log(`Coach server listening on http://127.0.0.1:${actualPort}`);
