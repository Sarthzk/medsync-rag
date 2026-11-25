import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "reports";

/** Normalised path if it is a file inside the user's own folder, else null. */
export function ownedStoragePath(userId: string, storagePath: string): string | null {
  const path = (storagePath ?? "").trim();
  const parts = path.split("/");
  if (
    path.includes("\\") ||
    parts.length < 2 ||
    parts[0] !== userId ||
    parts.slice(1).some((p) => p === "" || p === "." || p === "..")
  ) {
    return null;
  }
  return path;
}

/** Best-effort removal of Storage objects; failures are logged, never thrown. */
export async function removeObjects(supabase: SupabaseClient, paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn(`Storage removal failed for ${paths.length} objects:`, error.message);
}

/** Removes medication reminders that point at deleted report files; returns how many were removed. */
export async function deleteReminders(
  supabase: SupabaseClient,
  userId: string,
  filenames: string[]
): Promise<number> {
  if (!filenames.length) return 0;
  const { data, error } = await supabase
    .from("medication_reminders")
    .delete()
    .eq("user_id", userId)
    .in("report_file", filenames)
    .select("id");
  if (error) {
    console.warn("Medication reminder cleanup failed:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}

/** Deletes every report (rows, chunks and lab results cascade), stored file and linked reminder of the user. */
export async function deleteAllReports(supabase: SupabaseClient, userId: string) {
  const { data: reports, error } = await supabase
    .from("reports")
    .select("filename, storage_path")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  await removeObjects(supabase, (reports ?? []).map((r) => r.storage_path));
  const { error: delError } = await supabase.from("reports").delete().eq("user_id", userId);
  if (delError) throw new Error(delError.message);
  const reminders = await deleteReminders(supabase, userId, (reports ?? []).map((r) => r.filename));
  return { deleted_reports: reports?.length ?? 0, medication_reminders_cleaned: reminders };
}
