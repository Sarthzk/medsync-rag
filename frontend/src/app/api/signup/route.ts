import { NextResponse } from "next/server";
import { fetchFromBackend } from "@/lib/backend";

export async function POST(req: Request) {
  const body = await req.json();
  let upstreamResponse: Response;

  try {
    upstreamResponse = await fetchFromBackend(
      "/signup",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      15000
    );
  } catch {
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
