import { proxyToBackend } from "@/lib/backend";

// Extraction of multi-page scanned PDFs can take a while.
export const maxDuration = 300;

export async function POST(req: Request) {
  return proxyToBackend(req, "/reports/ingest", { connectTimeoutMs: 290_000 });
}
