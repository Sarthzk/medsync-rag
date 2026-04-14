import { NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://localhost:8000";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("filename");

    // If filename param exists, serve the file preview/download
    if (filename) {
      const fileRes = await fetch(`${BACKEND_URL}/view-reports/${encodeURIComponent(filename)}`);
      
      if (!fileRes.ok) {
        return NextResponse.json(
          { error: "File not found" },
          { status: 404 }
        );
      }

      // Get the content type from the response
      const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
      const arrayBuffer = await fileRes.arrayBuffer();

      return new NextResponse(arrayBuffer, {
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      });
    }

    // Otherwise, list files
    const res = await fetch(`${BACKEND_URL}/files`);
    
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch files from backend" },
        { status: res.status }
      );
    }

    const data = await res.json();
    
    // Transform URLs to point to this API route
    if (data.files && Array.isArray(data.files)) {
      data.files = data.files.map((file: any) => {
        if (typeof file === "string") {
          // Old format: just filename
          return { name: file, url: `/api/files?filename=${encodeURIComponent(file)}` };
        }
        // New format: already an object with name and url
        return {
          name: file.name,
          url: `/api/files?filename=${encodeURIComponent(file.name)}`,
        };
      });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json(
      { error: "Backend connection failed", details: String(error) },
      { status: 503 }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("filename");
    
    if (!filename) {
      return NextResponse.json(
        { error: "Missing filename parameter" },
        { status: 400 }
      );
    }

    const res = await fetch(`${BACKEND_URL}/files/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });
    
    if (!res.ok) {
      const error = await res.json();
      return NextResponse.json(error, { status: res.status });
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
