import { proxyToBackend } from "@/lib/backend";

export async function GET(req: Request) {
  return proxyToBackend(req, "/vitals");
}

export async function POST(req: Request) {
  return proxyToBackend(req, "/vitals");
}
