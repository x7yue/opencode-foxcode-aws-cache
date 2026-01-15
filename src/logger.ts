import type { createOpencodeClient } from "@opencode-ai/sdk";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;
type LogLevel = "debug" | "info" | "warn" | "error";

const ENV_DEBUG = "OPENCODE_FOXCODE_AWS_CACHE_DEBUG";
const SERVICE_PREFIX = "foxcode-aws-cache";

let _client: OpencodeClient | null = null;

function isDebugEnabled(): boolean {
  const val = process.env[ENV_DEBUG];
  return val === "1" || val?.toLowerCase() === "true";
}

export function initLogger(client: OpencodeClient): void {
  _client = client;
}

export interface Logger {
  debug(message: string, extra?: Record<string, unknown>): void;
  info(message: string, extra?: Record<string, unknown>): void;
  warn(message: string, extra?: Record<string, unknown>): void;
  error(message: string, extra?: Record<string, unknown>): void;
}

export function createLogger(module: string): Logger {
  const service = `${SERVICE_PREFIX}.${module}`;

  const log = (level: LogLevel, message: string, extra?: Record<string, unknown>): void => {
    if (_client?.app && typeof _client.app.log === "function") {
      _client.app
        .log({ body: { service, level, message, extra } })
        .catch(() => {});
      return;
    }

    if (isDebugEnabled()) {
      const prefix = `[${service}]`;
      const args = extra ? [prefix, message, extra] : [prefix, message];
      switch (level) {
        case "debug":
          console.debug(...args);
          break;
        case "info":
          console.info(...args);
          break;
        case "warn":
          console.warn(...args);
          break;
        case "error":
          console.error(...args);
          break;
      }
    }
  };

  return {
    debug: (message, extra) => log("debug", message, extra),
    info: (message, extra) => log("info", message, extra),
    warn: (message, extra) => log("warn", message, extra),
    error: (message, extra) => log("error", message, extra),
  };
}
