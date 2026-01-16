import type { Plugin } from "@opencode-ai/plugin";
import type { createOpencodeClient } from "@opencode-ai/sdk";
import { initLogger, createLogger } from "./logger";

const log = createLogger("fetch");
const PROVIDER_ID = "foxcode-aws";

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

let currentSessionId = "";
let projectId = "";
let opClient: OpencodeClient | null = null;
let cachedTools: unknown[] | null = null;
let cachedToolsModel: string | null = null;

interface SystemPart {
  type?: string;
  text?: string;
  cache_control?: { type: string };
}

interface Message {
  role?: string;
  tool_calls?: unknown[];
  content?: unknown;
}

interface Payload {
  model?: string;
  system?: SystemPart[];
  messages?: Message[];
  tools?: unknown[] | Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

function isCompactionRequest(payload: Payload): boolean {
  const system = payload.system;
  if (!Array.isArray(system) || system.length === 0) return false;

  return system.some(
    (s) => typeof s.text === "string" && s.text.includes("summarizing conversations")
  );
}

function isToolsEmpty(tools: unknown): boolean {
  if (!tools) return true;
  if (Array.isArray(tools)) return tools.length === 0;
  if (typeof tools === "object") return Object.keys(tools as object).length === 0;
  return true;
}

function hasToolCalls(messages: Message[]): boolean {
  return messages.some(
    (msg) => msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0
  );
}

function needsToolsInjection(payload: Payload): boolean {
  if (!isCompactionRequest(payload)) return false;
  if (!isToolsEmpty(payload.tools)) return false;

  const messages = payload.messages || [];
  return hasToolCalls(messages);
}

async function fetchToolsDefinitions(model: string): Promise<unknown[] | null> {
  if (!opClient) {
    log.warn("Client not initialized, cannot fetch tools");
    return null;
  }

  if (cachedTools && cachedToolsModel === model) {
    log.debug("Using cached tools", { model });
    return cachedTools;
  }

  try {
    const result = await opClient.tool.list({ query: { provider: PROVIDER_ID, model } });
    if (result.data) {
      cachedTools = result.data as unknown[];
      cachedToolsModel = model;
      log.info("Fetched tools definitions", { model, count: cachedTools.length });
      return cachedTools;
    }
  } catch (err) {
    log.error("Failed to fetch tools definitions", { model, error: String(err) });
  }
  return null;
}

function buildUserId(): string {
  const pid = projectId || "unknown";
  const sid = currentSessionId || "unknown";
  return `user_${pid}_account__session_${sid}`;
}

function isJsonContentType(headers: Headers): boolean {
  const ct = headers.get("content-type") || "";
  return ct.includes("application/json");
}

function parseBody(body: BodyInit | null | undefined): string | null {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  return null;
}

export const OpenCodeFoxcodeAwsCache: Plugin = async ({ client, project }) => {
  initLogger(client);
  opClient = client;
  projectId = project?.id || "";
  log.info("Plugin initialized", { projectId });

  return {
    event: async ({ event }) => {
      if (event.type === "session.created" || event.type === "session.updated") {
        const props = event.properties as { info?: { id?: string } };
        currentSessionId = props?.info?.id || "";
        log.debug("Session updated", { sessionId: currentSessionId });
      }
    },

    auth: {
      provider: "foxcode-aws",
      methods: [],
      loader: async () => {
        log.info("Auth loader called, returning custom fetch");
        return {
        fetch: async (url: string | URL | Request, init?: RequestInit) => {
          const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
          log.info("Fetch intercepted", { url: urlStr, method: init?.method });

          const headers = new Headers(init?.headers);
          const method = (init?.method || "GET").toUpperCase();
          const contentType = headers.get("content-type") || "";

          if (method !== "POST" || !isJsonContentType(headers)) {
            log.debug("Skipping non-POST or non-JSON request", { method, contentType });
            return fetch(url, init);
          }

          const rawBody = parseBody(init?.body);
          if (!rawBody) {
            log.debug("Skipping request with no body");
            return fetch(url, init);
          }

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(rawBody);
            log.debug("Parsed payload", { model: payload.model, hasTools: !!payload.tools });
          } catch {
            log.warn("Failed to parse request body as JSON");
            return fetch(url, init);
          }

          if (payload && typeof payload === "object") {
            if (!payload.metadata || typeof payload.metadata !== "object") {
              payload.metadata = {};
            }
            const meta = payload.metadata as Record<string, unknown>;
            if (meta.user_id == null) {
              meta.user_id = buildUserId();
              log.info("Injected user_id", { user_id: meta.user_id });
            }

            if (needsToolsInjection(payload as Payload)) {
              log.info("Compaction request detected, needs tools injection");
              const model = payload.model as string;
              if (model) {
                const tools = await fetchToolsDefinitions(model);
                if (tools && tools.length > 0) {
                  payload.tools = tools;
                  log.info("Injected tools for compaction request", { model, count: tools.length });
                } else {
                  log.warn("Failed to get tools for injection", { model });
                }
              } else {
                log.warn("No model in payload, cannot fetch tools");
              }
            } else {
              const isCompaction = isCompactionRequest(payload as Payload);
              const toolsEmpty = isToolsEmpty(payload.tools);
              const hasTC = hasToolCalls((payload.messages || []) as Message[]);
              log.debug("No tools injection needed", { isCompaction, toolsEmpty, hasToolCalls: hasTC });
            }
          }

          headers.delete("content-length");

          return fetch(url, {
            ...init,
            headers,
            body: JSON.stringify(payload),
          });
        },
      };
      },
    },
  };
};

export default OpenCodeFoxcodeAwsCache;
