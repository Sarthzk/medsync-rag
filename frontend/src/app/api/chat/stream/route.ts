import { proxyToBackend } from "@/lib/backend";

// The stream stays open while the answer is generated; the connect timeout only
// covers retrieval before the first byte.
export const maxDuration = 300;

export async function POST(req: Request) {
  return proxyToBackend(req, "/chat/stream", { connectTimeoutMs: 120_000 });
}
