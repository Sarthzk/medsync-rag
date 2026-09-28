import { proxyToBackend } from "@/lib/backend";

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyToBackend(req, `/reports/${encodeURIComponent(id)}`);
}
