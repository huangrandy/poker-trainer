import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import net from "node:net";

const coachSchemaPath = new URL("./coach-response.schema.json", import.meta.url);
const coachSchema = JSON.parse(readFileSync(coachSchemaPath, "utf8"));

function normalizeCoachPayload(parsed, request) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("App server returned an invalid coach payload.");
  }

  const text = typeof parsed.text === "string" ? parsed.text : "";
  const summary = typeof parsed.summary === "string" ? parsed.summary : "";
  const recommendedAction = typeof parsed.recommendedAction === "string" ? parsed.recommendedAction : null;
  const confidence =
    parsed.confidence === "low" || parsed.confidence === "medium" || parsed.confidence === "high"
      ? parsed.confidence
      : null;

  if (!text || !summary) {
    throw new Error("App server returned a coach payload missing required fields.");
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

function encodeWebSocketFrame(text) {
  const payload = Buffer.from(text, "utf8");
  const mask = randomBytes(4);
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    throw new Error("WebSocket payload too large.");
  }

  const masked = Buffer.alloc(len);
  for (let index = 0; index < len; index += 1) {
    masked[index] = payload[index] ^ mask[index % 4];
  }

  return Buffer.concat([header, mask, masked]);
}

function decodeWebSocketFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const byte1 = buffer[offset++];
    const byte2 = buffer[offset++];
    const opcode = byte1 & 0x0f;
    let length = byte2 & 0x7f;

    if (length === 126) {
      if (offset + 2 > buffer.length) {
        break;
      }

      length = buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      throw new Error("Unsupported websocket frame length.");
    }

    const masked = Boolean(byte2 & 0x80);
    let mask = null;

    if (masked) {
      if (offset + 4 > buffer.length) {
        break;
      }

      mask = buffer.subarray(offset, offset + 4);
      offset += 4;
    }

    if (offset + length > buffer.length) {
      break;
    }

    let payload = buffer.subarray(offset, offset + length);
    offset += length;

    if (masked && mask) {
      const unmasked = Buffer.alloc(length);
      for (let index = 0; index < length; index += 1) {
        unmasked[index] = payload[index] ^ mask[index % 4];
      }
      payload = unmasked;
    }

    frames.push({
      opcode,
      text: payload.toString("utf8"),
    });
  }

  return {
    frames,
    rest: buffer.subarray(offset),
  };
}

class AppServerClient {
  constructor({ socketPath, trace } = {}) {
    this.socketPath = socketPath;
    this.trace = trace;
    this.requestId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.socket = null;
    this.buffer = Buffer.alloc(0);
    this.handshakeDone = false;
  }

  async connect() {
    if (this.socket) {
      return;
    }

    this.socket = net.createConnection(this.socketPath);

    await new Promise((resolve, reject) => {
      const key = createHash("sha256")
        .update(`${Date.now()}:${Math.random()}`)
        .digest("base64")
        .slice(0, 24);
      const request = [
        "GET / HTTP/1.1",
        "Host: localhost",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`,
        "Sec-WebSocket-Version: 13",
        "\r\n",
      ].join("\r\n");

      const onError = (error) => {
        cleanup();
        reject(error);
      };

      const onData = (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);

        if (!this.handshakeDone) {
          const response = this.buffer.toString("utf8");
          const marker = response.indexOf("\r\n\r\n");

          if (marker === -1) {
            return;
          }

          const head = response.slice(0, marker);
          if (!head.startsWith("HTTP/1.1 101")) {
            cleanup();
            reject(new Error(`App server websocket handshake failed: ${head}`));
            return;
          }

          this.handshakeDone = true;
          this.buffer = this.buffer.subarray(marker + 4);
          cleanup();
          this.socket.off("data", onData);
          this.socket.on("data", (nextChunk) => this.#handleData(nextChunk));
          resolve();
        }
      };

      const cleanup = () => {
        this.socket.off("error", onError);
      };

      this.socket.on("error", onError);
      this.socket.on("data", onData);
      this.socket.once("connect", () => {
        this.socket.write(request);
      });
    });
  }

  #handleData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const parsed = decodeWebSocketFrames(this.buffer);
    this.buffer = parsed.rest;

    for (const frame of parsed.frames) {
      if (frame.opcode !== 1) {
        continue;
      }

      let message;
      try {
        message = JSON.parse(frame.text);
      } catch (error) {
        this.trace?.warn("appServer.message.parseError", {
          message: error instanceof Error ? error.message : String(error),
          frame: frame.text,
        });
        continue;
      }

      if (Object.prototype.hasOwnProperty.call(message, "id")) {
        const pending = this.pending.get(message.id);
        if (pending) {
          this.pending.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error.message || "App server request failed."));
          } else {
            pending.resolve(message.result);
          }
          continue;
        }
      }

      for (const listener of this.listeners) {
        listener(message);
      }
    }
  }

  onMessage(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  request(method, params) {
    const id = this.requestId++;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.write(
        encodeWebSocketFrame(
          JSON.stringify({
            id,
            method,
            params,
          })
        )
      );
    });
  }

  close() {
    this.socket?.end();
    this.socket = null;
  }
}

function extractFinalTextFromNotifications(messages) {
  const message = [...messages]
    .reverse()
    .find(
      (entry) =>
        entry.method === "item/completed" &&
        entry.params?.item?.type === "agentMessage" &&
        entry.params?.item?.phase === "final_answer" &&
        typeof entry.params?.item?.text === "string"
    );

  return message?.params?.item?.text ?? null;
}

export function createAppServerCoachAdapter({
  socketPath = join(homedir(), ".codex", "app-server-control", "app-server-control.sock"),
  model = null,
  reasoningEffort = "low",
  cwd = process.cwd(),
  timeoutMs = 120000,
  clientFactory = (options) => new AppServerClient(options),
} = {}) {
  const client = clientFactory({ socketPath });
  let initialized = false;
  let cachedThreadId = null;
  let requestQueue = Promise.resolve();

  const withTimeout = async (promise, label) => {
    let timer;
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error(`${label} timed out.`));
          }, timeoutMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };

  const queueTask = (task) => {
    const next = requestQueue.then(task);
    requestQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  return async (request, prompt, { trace } = {}) =>
    queueTask(async () => {
      const resolvedModel = model ?? "gpt-5.4-mini";
      trace?.info("appServer.adapter.start", {
        socketPath,
        model: resolvedModel,
        reasoningEffort,
        cwd,
        cachedThreadId,
      });

      await client.connect();

      if (!initialized) {
        await withTimeout(
          client.request("initialize", {
            clientInfo: {
              name: "poker-trainer-coach",
              version: "0.0.0",
            },
            capabilities: {
              experimentalApi: true,
              optOutNotificationMethods: [],
            },
          }),
          "App server initialize"
        );
        initialized = true;
      }

      const notifications = [];
      let finalText = null;
      let turnCompleted = false;
      let activeTurnId = null;
      let resolved = false;
      let resolveDone;
      let rejectDone;

      const donePromise = new Promise((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
      });

      const completeIfReady = () => {
        if (!resolved && turnCompleted && finalText !== null) {
          resolved = true;
          resolveDone(finalText);
        }
      };

      const processNotification = (message) => {
        const messageTurnId = message.params?.turnId ?? message.params?.turn?.id ?? null;
        if (activeTurnId === null || messageTurnId !== activeTurnId) {
          return;
        }

        if (
          message.method === "item/completed" &&
          message.params?.item?.type === "agentMessage" &&
          message.params?.item?.phase === "final_answer" &&
          typeof message.params?.item?.text === "string"
        ) {
          finalText = message.params.item.text;
        }

        if (message.method === "turn/completed") {
          turnCompleted = true;
        }

        completeIfReady();
      };

      const onMessage = (message) => {
        notifications.push(message);
        trace?.info("appServer.notification", message);
        processNotification(message);
      };

      const unsubscribe = client.onMessage(onMessage);
      const timeoutTimer = setTimeout(() => {
        if (!resolved) {
          rejectDone(new Error("App server did not complete the turn in time."));
        }
      }, timeoutMs);
      timeoutTimer.unref?.();

      try {
        if (cachedThreadId === null) {
          const threadResponse = await withTimeout(
            client.request("thread/start", {
              approvalPolicy: "never",
              cwd,
              model: resolvedModel,
              sandbox: "read-only",
              ephemeral: true,
            }),
            "App server thread start"
          );

          cachedThreadId = threadResponse?.thread?.id ?? null;
          if (!cachedThreadId) {
            throw new Error("App server did not return a thread id.");
          }
          trace?.info("appServer.thread.started", { threadId: cachedThreadId });
        } else {
          trace?.info("appServer.thread.reused", { threadId: cachedThreadId });
        }

        const turnResponse = await withTimeout(
          client.request("turn/start", {
            threadId: cachedThreadId,
            input: [{ type: "text", text: prompt }],
            model: resolvedModel,
            effort: reasoningEffort,
            summary: "none",
            outputSchema: coachSchema,
          }),
          "App server turn start"
        );

        activeTurnId = turnResponse?.turn?.id ?? null;
        if (!activeTurnId) {
          throw new Error("App server did not return a turn id.");
        }
        trace?.info("appServer.turn.started", { threadId: cachedThreadId, turnId: activeTurnId });

        for (const message of notifications) {
          processNotification(message);
        }

        const completedText = await donePromise;
        const parsed = JSON.parse(completedText);
        const normalized = normalizeCoachPayload(parsed, {
          ...request,
          sessionId: cachedThreadId ?? request.sessionId ?? null,
        });
        trace?.info("appServer.adapter.done", normalized);
        return normalized;
      } catch (error) {
        if (!resolved) {
          rejectDone?.(error);
        }
        throw error;
      } finally {
        clearTimeout(timeoutTimer);
        unsubscribe();
      }
    });
}
