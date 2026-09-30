import { proxyToBackend } from "@/lib/backend";

export const maxDuration = 60;

export async function DELETE(req: Request) {
  return proxyToBackend(req, "/account", { connectTimeoutMs: 55_000 });
}
