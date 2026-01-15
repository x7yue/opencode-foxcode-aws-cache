import type { Plugin } from "@opencode-ai/plugin";

let currentSessionId = "";
let projectId = "";

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

export const OpenCodeFoxcodeAwsCache: Plugin = async ({ project }) => {
  projectId = project?.id || "";

  return {
    event: async ({ event }) => {
      if (event.type === "session.created" || event.type === "session.updated") {
        const props = event.properties as { info?: { id?: string } };
        currentSessionId = props?.info?.id || "";
      }
    },

    auth: {
      provider: "foxcode-aws",
      methods: [],
      loader: async () => ({
        fetch: async (url: string | URL | Request, init?: RequestInit) => {
          const headers = new Headers(init?.headers);
          const method = (init?.method || "GET").toUpperCase();

          if (method !== "POST" || !isJsonContentType(headers)) {
            return fetch(url, init);
          }

          const rawBody = parseBody(init?.body);
          if (!rawBody) return fetch(url, init);

          let payload: Record<string, unknown>;
          try {
            payload = JSON.parse(rawBody);
          } catch {
            return fetch(url, init);
          }

          if (payload && typeof payload === "object") {
            if (!payload.metadata || typeof payload.metadata !== "object") {
              payload.metadata = {};
            }
            const meta = payload.metadata as Record<string, unknown>;
            if (meta.user_id == null) {
              meta.user_id = buildUserId();
            }
          }

          headers.delete("content-length");

          return fetch(url, {
            ...init,
            headers,
            body: JSON.stringify(payload),
          });
        },
      }),
    },
  };
};

export default OpenCodeFoxcodeAwsCache;
