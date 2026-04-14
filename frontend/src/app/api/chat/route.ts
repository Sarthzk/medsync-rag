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
        signal: AbortSignal.timeout(30000),
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Backend unreachable");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const res = await fetchFromBackend(`/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.json();
      return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Chat API Error:", error);
    return NextResponse.json(
      { error: "Backend connection failed", details: String(error) },
      { status: 503 }
    );
  }
}
