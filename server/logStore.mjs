import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function parseLine(line) {
  if (!line.trim()) {
    return null;
  }

  try {
    return JSON.parse(line);
  } catch {
    return {
      timestamp: new Date().toISOString(),
      level: "WARN",
      step: "log.parse.failed",
      details: line,
    };
  }
}

function ensureParentDirectory(filePath) {
  const directory = dirname(filePath);

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

export function createCoachLogStore({
  filePath = join(process.cwd(), ".coach-logs.jsonl"),
  maxEntries = 500,
} = {}) {
  ensureParentDirectory(filePath);

  const readEntries = () => {
    if (!existsSync(filePath)) {
      return [];
    }

    const raw = readFileSync(filePath, "utf8");
    const lines = raw.split("\n");
    const entries = lines.map(parseLine).filter(Boolean);

    return entries.slice(-maxEntries);
  };

  const appendEntry = (entry) => {
    appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  };

  return {
    filePath,
    append(entry) {
      appendEntry(entry);
    },
    list() {
      return readEntries();
    },
    clear() {
      writeFileSync(filePath, "", "utf8");
    },
  };
}
