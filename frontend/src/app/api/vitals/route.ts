import { NextResponse } from "next/server";
import { fetchFromBackend } from "@/lib/backend";

export async function GET() {
  try {
    const res = await fetchFromBackend(`/vitals`, {
      headers: {
        "Content-Type": "application/json",
      },
    }, 15000);

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch vitals from backend" },
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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const res = await fetchFromBackend(`/vitals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }, 15000);

    if (!res.ok) {
      const errorData = await res.json();
      return NextResponse.json(errorData, { status: res.status });
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

