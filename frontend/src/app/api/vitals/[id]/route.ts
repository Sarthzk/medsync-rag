import { NextResponse } from "next/server";
import { fetchFromBackend } from "@/lib/backend";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json({ error: "Missing id parameter" }, { status: 400 });
    }

    const res = await fetchFromBackend(`/vitals/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
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
