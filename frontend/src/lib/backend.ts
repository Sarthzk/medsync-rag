const DEFAULT_BACKEND_TIMEOUT_MS = 15000;

export const getBackendBaseUrls = () => {
  const urls: string[] = [];
  const envUrl =
    process.env.BACKEND_API_BASE_URL?.trim() ||
    process.env.BACKEND_API_URL?.trim();

  if (envUrl) urls.push(envUrl);
  urls.push("http://127.0.0.1:8000", "http://localhost:8000");
  return urls;
};

export async function fetchFromBackend(
  pathname: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_BACKEND_TIMEOUT_MS
): Promise<Response> {
  let lastError: unknown;
  for (const baseUrl of getBackendBaseUrls()) {
    try {
      return await fetch(`${baseUrl}${pathname}`, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Backend unreachable");
}
