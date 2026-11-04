/** Browser-side fetch helper with friendly English errors. */

export class ClientApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fields?: Record<string, string>,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

const NETWORK_MESSAGE = "We couldn’t reach Mia. Please check your connection and try again.";

export async function apiFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers: init.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ClientApiError(NETWORK_MESSAGE, 0);
  }
  let data: unknown = null;
  try {
    data = await response.json();
  } catch {
    /* non-JSON body */
  }
  if (!response.ok) {
    const body = (data ?? {}) as { error?: string; fields?: Record<string, string> };
    const retry = Number(response.headers.get("Retry-After"));
    throw new ClientApiError(
      body.error ?? "Something went wrong. Please try again.",
      response.status,
      body.fields,
      Number.isFinite(retry) && retry > 0 ? retry : undefined,
    );
  }
  return data as T;
}

/** Tells the sidebar to reload the chat list. */
export function notifyChatsChanged() {
  window.dispatchEvent(new Event("mia:chats-changed"));
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString([], { day: "numeric", month: "short" });
}
