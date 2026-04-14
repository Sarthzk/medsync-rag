import { NextResponse } from "next/server";

const getBackendBaseUrls = () => {
  const urls: string[] = [];
  const envUrl =
    process.env.BACKEND_API_BASE_URL?.trim() ||
    process.env.BACKEND_API_URL?.trim() ||
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (envUrl) urls.push(envUrl);
  urls.push("http://127.0.0.1:8000", "http://localhost:8000");
  return urls;
};

async function fetchFromBackend(pathname: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (const baseUrl of getBackendBaseUrls()) {
    try {
      return await fetch(`${baseUrl}${pathname}`, {
        ...init,
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Backend unreachable");
}

export async function GET() {
  try {
    const res = await fetchFromBackend("/reports/latest");
    const text = await res.text();
    let data: unknown = {};

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: "Invalid backend response", details: text };
      }
    }

    return NextResponse.json(data, { status: res.ok ? 200 : res.status });
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Backend connection failed", details: String(error) },
      { status: 503 }
    );
  }
}

