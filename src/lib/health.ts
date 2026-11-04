export type HealthResult = {
  status: 200 | 503;
  body: { status: "ok" | "unavailable" };
};

const PROBE_TIMEOUT_MS = 3000;

/**
 * Runs a database probe and maps the outcome to a public-safe response.
 * Never exposes the underlying error, schema or connection details.
 */
export async function checkHealth(
  probe: () => Promise<unknown>,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<HealthResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      probe(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      }),
    ]);
    return { status: 200, body: { status: "ok" } };
  } catch {
    return { status: 503, body: { status: "unavailable" } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
