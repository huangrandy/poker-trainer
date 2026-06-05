import { randomUUID } from "node:crypto";

function formatValue(value) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unserializable value]";
  }
}

export function createCoachTracer({
  enabled = false,
  logger = console,
  requestId = randomUUID(),
  sink = null,
} = {}) {
  const startedAt = Date.now();
  const logFn = typeof logger.log === "function" ? logger.log.bind(logger) : console.log.bind(console);
  const warnFn = typeof logger.warn === "function" ? logger.warn.bind(logger) : console.warn.bind(console);

  const emit = (level, step, details) => {
    const elapsedMs = Date.now() - startedAt;
    const timestamp = new Date().toISOString();
    const entry = {
      requestId,
      timestamp,
      elapsedMs,
      level,
      step,
      details: details ?? null,
    };

    sink?.(entry);

    if (!enabled) {
      return;
    }

    const prefix = `[coach ${requestId}] [${timestamp}] [+${elapsedMs}ms] ${level} ${step}`;

    sink?.(entry);

    if (details === undefined) {
      logFn(prefix);
      return;
    }

    const renderedDetails = formatValue(details);

    logFn(`${prefix}\n${renderedDetails}`);
  };

  return {
    requestId,
    emit,
    info(step, details) {
      emit("INFO", step, details);
    },
    warn(step, details) {
      if (!enabled) {
        return;
      }

      const elapsedMs = Date.now() - startedAt;
      const timestamp = new Date().toISOString();
      const prefix = `[coach ${requestId}] [${timestamp}] [+${elapsedMs}ms] WARN ${step}`;

      if (details === undefined) {
        warnFn(prefix);
        return;
      }

      const renderedDetails = formatValue(details);

      warnFn(`${prefix}\n${renderedDetails}`);
    },
  };
}
