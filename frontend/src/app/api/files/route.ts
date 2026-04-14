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

async function fetchFromBackend(
  pathname: string,
  init?: RequestInit
): Promise<Response> {
  let lastError: unknown;
  for (const baseUrl of getBackendBaseUrls()) {
    try {
      return await fetch(`${baseUrl}${pathname}`, {
        ...init,
        cache: "no-store",
        // Avoid hanging the UI forever if backend is down.
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("Backend unreachable");
}

function guessContentType(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".heic")) return "image/heic";
  return null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const filename = searchParams.get("filename");

    // If filename param exists, serve the file preview/download
    if (filename) {
      const fileRes = await fetchFromBackend(
        `/view-reports/${encodeURIComponent(filename)}`
      );
      
      if (!fileRes.ok) {
        return NextResponse.json(
          { error: "File not found" },
          { status: 404 }
        );
      }

      // Get the content type from the response
      const upstreamContentType = fileRes.headers.get("content-type") || "";
      const inferred = guessContentType(filename);
      const contentType =
        upstreamContentType && upstreamContentType !== "application/octet-stream"
          ? upstreamContentType
          : inferred || "application/octet-stream";
      const arrayBuffer = await fileRes.arrayBuffer();

      return new NextResponse(arrayBuffer, {
        headers: {
          "Content-Type": contentType,
          // Inline so browsers can render in iframe/object when supported.
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      });
    }

    // Otherwise, list files
    const res = await fetchFromBackend("/files");
    
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch files from backend" },
        { status: res.status }
      );
    }

    const data: Record<string, unknown> & {
      files?: Array<string | { name: string; url?: string }>;
    } = await res.json();
    
    // Transform URLs to point to this API route
    if (data.files && Array.isArray(data.files)) {
      data.files = data.files.map((file: unknown) => {
        if (typeof file === "string") {
          // Old format: just filename
          return { name: file, url: `/api/files?filename=${encodeURIComponent(file)}` };
        }
        // New format: already an object with name and url
        if (
          file &&
          typeof file === "object" &&
          "name" in file &&
          typeof (file as { name?: unknown }).name === "string"
        ) {
          const name = (file as { name: string }).name;
          return {
            name,
            url: `/api/files?filename=${encodeURIComponent(name)}`,
          };
        }

        // Unknown shape: drop it to avoid crashing the UI.
        return { name: "Unknown file", url: "/api/files" };
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

    const res = await fetchFromBackend(`/files/${encodeURIComponent(filename)}`, {
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
