import { NextResponse } from "next/server";

const getBackendBaseUrls = () => {
  const urls: string[] = [];
  const envUrl = process.env.BACKEND_API_BASE_URL?.trim() || process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (envUrl) {
    urls.push(envUrl);
  }

  urls.push("http://127.0.0.1:8000", "http://localhost:8000");
  return urls;
};

export async function POST(req: Request) {
  const body = await req.json();
  let upstreamResponse: Response | null = null;

  for (const baseUrl of getBackendBaseUrls()) {
    try {
      upstreamResponse = await fetch(`${baseUrl}/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
      break;
    } catch {
      // Try next backend base URL.
    }
  }

  if (!upstreamResponse) {
    return NextResponse.json(
      { detail: "Backend unreachable. Start FastAPI server on port 8000." },
      { status: 503 }
    );
  }

  const text = await upstreamResponse.text();
  let data: unknown = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!upstreamResponse.ok) {
    return NextResponse.json(data, { status: upstreamResponse.status });
  }

  return NextResponse.json(data, { status: 200 });
}
