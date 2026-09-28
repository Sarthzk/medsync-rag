import { proxyToBackend } from "@/lib/backend";

export const maxDuration = 300;

export async function POST(req: Request) {
  return proxyToBackend(req, "/chat", { connectTimeoutMs: 290_000 });
}
