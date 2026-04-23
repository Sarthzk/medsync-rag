import { NextResponse } from "next/server";
import { fetchFromBackend } from "@/lib/backend";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const res = await fetchFromBackend(`/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }, 30000);

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
