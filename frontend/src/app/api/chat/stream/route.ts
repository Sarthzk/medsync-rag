import { isErrorResponse, jsonError, requireUser } from "@/lib/server/auth";
import { chatBodySchema } from "@/lib/server/chatRequest";
import { consumeQuota } from "@/lib/server/quota";
import { chatEvents } from "@/lib/rag/pipeline";

export const dynamic = "force-dynamic";
// The stream stays open while the answer is generated.
export const maxDuration = 300;

const sse = (payload: unknown) =>
  `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}\n\n`;

/** Events: {t}, {sources}, {faithfulness}, {error}, then [DONE]. */
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;

  const parsed = chatBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(422, "Invalid chat request.");
  const { question, history, skip_faithfulness } = parsed.data;

  if (question.trim()) {
    const blocked = await consumeQuota(ctx.supabase, "chat");
    if (blocked) return blocked;
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of chatEvents(ctx.supabase, question, history ?? [], skip_faithfulness)) {
          controller.enqueue(encoder.encode(sse(event)));
        }
      } catch (e) {
        console.error("chat stream failed:", e);
        controller.enqueue(encoder.encode(sse({ error: "Could not generate an answer. Please try again." })));
      }
      controller.enqueue(encoder.encode(sse("[DONE]")));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
