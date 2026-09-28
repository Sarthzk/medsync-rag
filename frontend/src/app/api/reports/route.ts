import { proxyToBackend } from "@/lib/backend";

export async function GET(req: Request) {
  return proxyToBackend(req, "/reports");
}
