import { NextResponse } from "next/server";

const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

export const getBackendBaseUrl = (): string | null => {
  // BACKEND_API_URL is the name the existing Vercel project already uses.
  const envUrl =
    process.env.BACKEND_API_BASE_URL?.trim() || process.env.BACKEND_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  // Local development convenience only; production must configure the URL.
  return process.env.NODE_ENV === "production" ? null : "http://127.0.0.1:8000";
};

type ProxyOptions = {
  /** Max time to wait for the backend to start responding (headers). */
  connectTimeoutMs?: number;
};

/**
 * Forwards the incoming request (method, body, Authorization) to the FastAPI backend
 * and streams the backend's response back unchanged. Never retries: POST/DELETE
 * requests are not idempotent.
 */
export async function proxyToBackend(
  req: Request,
  pathname: string,
  { connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS }: ProxyOptions = {}
): Promise<Response> {
  const baseUrl = getBackendBaseUrl();
  if (!baseUrl) {
    console.error("BACKEND_API_BASE_URL is not configured");
    return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  }

  const headers = new Headers();
  const auth = req.headers.get("authorization");
  if (auth) headers.set("Authorization", auth);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const controller = new AbortController();
  // Only bound the wait for response headers; long SSE streams must not be cut off.
  const timer = setTimeout(() => controller.abort(), connectTimeoutMs);

  try {
    const upstream = await fetch(`${baseUrl}${pathname}`, {
      method: req.method,
      headers,
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timer);

    const responseHeaders = new Headers();
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) responseHeaders.set("Content-Type", upstreamType);
    if (upstreamType?.includes("text/event-stream")) {
      responseHeaders.set("Cache-Control", "no-cache, no-transform");
      responseHeaders.set("X-Accel-Buffering", "no");
    }

    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch (error) {
    clearTimeout(timer);
    console.error(`Backend request ${req.method} ${pathname} failed:`, error);
    return NextResponse.json(
      { error: "Backend unreachable. Please try again." },
      { status: 503 }
    );
  }
}
