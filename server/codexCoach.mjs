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

function normalizePlainCoachPayload(text, request) {
  const normalizedText = typeof text === "string" ? text.trim() : "";

  if (!normalizedText) {
    throw new Error("Codex returned an empty coach response.");
  }

  return {
    ok: true,
    sessionId: request.sessionId ?? null,
    text: normalizedText,
    summary: normalizedText.length <= 140 ? normalizedText : `${normalizedText.slice(0, 137)}...`,
    recommendedAction: null,
    confidence: null,
  };
}

function runCodexExec({
  command,
  model,
  reasoningEffort,
  structuredOutput,
  args,
  prompt,
  outputFile,
  timeoutMs,
  cwd,
  spawnImpl,
  readFileImpl,
  trace,
}) {
  return new Promise((resolve, reject) => {
    trace?.info("codex.spawn", {
      command,
      model: model ?? "default",
      reasoningEffort: reasoningEffort ?? "default",
      structuredOutput,
      cwd,
      outputFile,
      args,
      promptLength: prompt.length,
    });

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
      trace?.warn("codex.timeout", {
        timeoutMs,
      });
      reject(new Error("Codex coach request timed out."));
    }, timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      trace?.warn("codex.error", {
        message: error instanceof Error ? error.message : String(error),
      });
      reject(error);
    });

    child.on("close", async (code) => {
      clearTimeout(timer);
      trace?.info("codex.close", {
        code,
        stdout: stdout.trim() ? stdout : null,
        stderr: stderr.trim() ? stderr : null,
      });

      if (code !== 0) {
        reject(new Error(`Codex exited with code ${code}: ${stderr || stdout || "no output"}`));
        return;
      }

      try {
        const raw = await readFileImpl(outputFile, "utf8");
        trace?.info("codex.output.read", {
          outputFile,
          raw,
        });
        resolve(raw);
      } catch (error) {
        trace?.warn("codex.output.missing", {
          outputFile,
          message: error instanceof Error ? error.message : String(error),
        });
        reject(new Error(`Codex did not write a coach response file: ${error instanceof Error ? error.message : String(error)}`));
      }
    });

    trace?.info("codex.stdin.write", {
      prompt,
    });
    child.stdin.end(prompt);
  });
}

export function createCodexCoachAdapter({
  command = "codex",
  model = null,
  reasoningEffort = "low",
  structuredOutput = true,
  timeoutMs = 120000,
  cwd = process.cwd(),
  spawnImpl = spawn,
  mkdtempImpl = mkdtemp,
  readFileImpl = readFile,
  rmImpl = rm,
  tmpdirImpl = tmpdir,
} = {}) {
  const schemaPath = resolve(fileURLToPath(new URL("./coach-response.schema.json", import.meta.url)));

  return async (request, prompt, { trace } = {}) => {
    const tempDir = await mkdtempImpl(join(tmpdirImpl(), "poker-coach-"));
    const outputFile = join(tempDir, "coach-response.json");

    trace?.info("codex.adapter.start", {
      tempDir,
      outputFile,
      model: model ?? "default",
      reasoningEffort,
      structuredOutput,
    });

    try {
      const raw = await runCodexExec({
        command,
        model,
        reasoningEffort,
        structuredOutput,
        args: [
          "-a",
          "never",
          "-s",
          "read-only",
          ...(reasoningEffort ? ["-c", `model_reasoning_effort=${reasoningEffort}`] : []),
          ...(model ? ["-m", model] : []),
          "exec",
          "--skip-git-repo-check",
          ...(structuredOutput
            ? ["--output-schema", schemaPath]
            : []),
          "--output-last-message",
          outputFile,
        ],
        prompt: structuredOutput
          ? [
              prompt,
              "",
              "Return only valid JSON that matches the provided output schema.",
              "Do not use markdown fences.",
              "Do not explain your reasoning outside the JSON payload.",
            ].join("\n")
          : [
              prompt,
              "",
              "Return a concise plain-text answer.",
              "Do not use markdown fences.",
              "Do not return JSON.",
            ].join("\n"),
        outputFile,
        timeoutMs,
        cwd,
        spawnImpl,
        readFileImpl,
        trace,
      });

      trace?.info("codex.parse.start", {
        raw,
      });
      const normalized = structuredOutput
        ? (() => {
            const parsed = JSON.parse(raw);
            trace?.info("codex.parse.ok", {
              keys: Object.keys(parsed),
            });

            return normalizeCoachPayload(parsed, request);
          })()
        : normalizePlainCoachPayload(raw, request);

      trace?.info("codex.adapter.done", normalized);
      return normalized;
    } finally {
      trace?.info("codex.cleanup", {
        tempDir,
      });
      await rmImpl(tempDir, { recursive: true, force: true });
    }
  };
}
