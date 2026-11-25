import { NextResponse } from "next/server";
import { chatEvents } from "@/lib/rag/pipeline";
import type { FaithfulnessVerdict } from "@/lib/rag/faithfulness";
import { isErrorResponse, jsonError, requireUser } from "@/lib/server/auth";
import { chatBodySchema } from "@/lib/server/chatRequest";
import { consumeQuota } from "@/lib/server/quota";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Same pipeline as /api/chat/stream, collected into one JSON answer (used by Quick Scan). */
export async function POST(request: Request) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;

  const parsed = chatBodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(422, "Invalid chat request.");
  const { question, history, skip_faithfulness, session_id } = parsed.data;

  if (question.trim()) {
    const blocked = await consumeQuota(ctx.supabase, "chat");
    if (blocked) return blocked;
  }

  let answer = "";
  let sources: string[] = [];
  let faithfulness: FaithfulnessVerdict | undefined;
  try {
    for await (const event of chatEvents(ctx.supabase, question, history ?? [], skip_faithfulness)) {
      if ("t" in event) answer += event.t;
      else if ("sources" in event) sources = event.sources;
      else faithfulness = event.faithfulness;
    }
  } catch (e) {
    console.error("chat failed:", e);
    return jsonError(500, "Could not generate an answer. Please try again.");
  }
  return NextResponse.json({
    answer: answer.trim(),
    sources,
    faithfulness,
    session_id: session_id?.trim() || "default",
  });
}
