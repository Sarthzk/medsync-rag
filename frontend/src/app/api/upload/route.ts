import { NextResponse } from "next/server";
import { fetchFromBackend } from "@/lib/backend";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const res = await fetchFromBackend(`/upload`, {
      method: "POST",
      body: formData,
    }, 15000);

    if (!res.ok) {
      const error = await res.json();
      return NextResponse.json(error, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Upload API Error:", error);
    return NextResponse.json(
      { error: "Backend connection failed", details: String(error) },
      { status: 503 }
    );
  }
}
