import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8000";

export async function GET(req: Request) {
  try {
    const res = await fetch(`${BACKEND_URL}/files`);
    
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch files from backend" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Backend connection failed", details: String(error) },
      { status: 503 }
    );
  }
}
