import { NextResponse } from "next/server";
import { isErrorResponse, jsonError, requireUser } from "@/lib/server/auth";
import { createAdminClient } from "@/lib/server/admin";
import { BUCKET } from "@/lib/server/reports";

export const maxDuration = 60;

/**
 * Permanently deletes the signed-in user. Stored files go first (they are not covered by DB
 * cascades), then the auth user, which cascades every per-user table. If anything fails the
 * account is kept so the user can retry instead of leaving orphaned medical data.
 */
export async function DELETE(request: Request) {
  const ctx = await requireUser(request);
  if (isErrorResponse(ctx)) return ctx;
  const userId = ctx.user.id;

  try {
    const admin = createAdminClient();
    const bucket = admin.storage.from(BUCKET);

    let removed = 0;
    for (;;) {
      const { data: items, error } = await bucket.list(userId, { limit: 1000 });
      if (error) throw new Error(error.message);
      const names = (items ?? []).map((i) => i.name);
      if (!names.length) break;
      const { error: rmError } = await bucket.remove(names.map((n) => `${userId}/${n}`));
      if (rmError) throw new Error(rmError.message);
      removed += names.length;
      if (names.length < 1000) break;
    }

    const { error: delError } = await admin.auth.admin.deleteUser(userId);
    if (delError) throw new Error(delError.message);
    return NextResponse.json({ message: "Account deleted", deleted_files: removed });
  } catch (e) {
    console.error("account deletion failed:", e);
    return jsonError(500, "Could not delete your account. Please try again.");
  }
}
