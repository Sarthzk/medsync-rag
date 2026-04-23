import { NextResponse } from "next/server";
import { fetchFromBackend } from "@/lib/backend";

export async function GET() {
  try {
    const res = await fetchFromBackend("/reports/latest", undefined, 15000);
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

