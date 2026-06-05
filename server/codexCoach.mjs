import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function normalizeCoachPayload(parsed, request) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Codex returned an invalid coach payload.");
  }

  const text = typeof parsed.text === "string" ? parsed.text : "";
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const recommendedAction = typeof parsed.recommendedAction === "string" ? parsed.recommendedAction : null;
  const confidence =
    parsed.confidence === "low" || parsed.confidence === "medium" || parsed.confidence === "high"
      ? parsed.confidence
      : null;

  if (!text || !summary) {
    throw new Error("Codex returned a coach payload missing required fields.");
  }

  return {
    ok: true,
    sessionId: request.sessionId ?? null,
    text,
    summary,
    recommendedAction,
    confidence,
  };
}

function runCodexExec({
  command,
  args,
  prompt,
  outputFile,
  timeoutMs,
  cwd,
  spawnImpl,
  readFileImpl,
}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Codex coach request timed out."));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", async (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(`Codex exited with code ${code}: ${stderr || stdout || "no output"}`));
        return;
      }

      try {
        const raw = await readFileImpl(outputFile, "utf8");
        resolve(raw);
      } catch (error) {
        reject(new Error(`Codex did not write a coach response file: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    child.stdin.end(prompt);
  });
}

export function createCodexCoachAdapter({
  command = "codex",
  timeoutMs = 120000,
  cwd = process.cwd(),
  spawnImpl = spawn,
  mkdtempImpl = mkdtemp,
  readFileImpl = readFile,
  rmImpl = rm,
  tmpdirImpl = tmpdir,
} = {}) {
  const schemaPath = resolve(fileURLToPath(new URL("./coach-response.schema.json", import.meta.url)));

  return async (request, prompt) => {
    const tempDir = await mkdtempImpl(join(tmpdirImpl(), "poker-coach-"));
    const outputFile = join(tempDir, "coach-response.json");

    try {
      const raw = await runCodexExec({
        command,
        args: [
          "-a",
          "never",
          "-s",
          "read-only",
          "exec",
          "--skip-git-repo-check",
          "--output-schema",
          schemaPath,
          "--output-last-message",
          outputFile,
        ],
        prompt: [
          prompt,
          "",
          "Return only valid JSON that matches the provided output schema.",
          "Do not use markdown fences.",
          "Do not explain your reasoning outside the JSON payload.",
        ].join("\n"),
        outputFile,
        timeoutMs,
        cwd,
        spawnImpl,
        readFileImpl,
      });

      const parsed = JSON.parse(raw);

      return normalizeCoachPayload(parsed, request);
    } finally {
      await rmImpl(tempDir, { recursive: true, force: true });
    }
  };
}
