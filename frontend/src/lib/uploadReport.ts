import { createClient } from "@/lib/supabase";
import { apiJson, readApiError } from "@/lib/api";

export const MAX_REPORT_BYTES = 20 * 1024 * 1024; // matches the `reports` bucket limit

const CONTENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  heic: "image/heic",
};

export const REPORT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.heic";

export type IngestResult = {
  status: string;
  report_id: string;
  file: string;
  chunks: number;
};

const extensionOf = (name: string) => {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts[parts.length - 1] : "";
};

/** Storage-safe object name; the display filename is kept separately. */
const safeObjectName = (name: string) =>
  name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_").slice(-120);

/** Throws a user-facing Error if the file can't be uploaded. */
export function validateReportFile(file: File): void {
  if (!CONTENT_TYPES[extensionOf(file.name)]) {
    throw new Error("Unsupported file type. Upload a PDF, PNG, JPG or HEIC file.");
  }
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_REPORT_BYTES) throw new Error("File is too large (max 20 MB).");
}

/**
 * Uploads a report straight to the user's private Supabase Storage folder (bypassing the
 * 4.5 MB serverless body limit), then asks the API to extract and index it.
 * `displayName` is the filename shown in the app and cited in answers.
 */
export async function uploadReport(file: File, displayName: string = file.name): Promise<IngestResult> {
  validateReportFile(file);

  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Your session has expired. Please sign in again.");

  const ext = extensionOf(file.name);
  let filename = displayName.trim().replace(/[\\/]/g, "_") || file.name;
  if (extensionOf(filename) !== ext) filename = `${filename}.${ext}`;

  const storagePath = `${userId}/${Date.now()}-${safeObjectName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("reports")
    .upload(storagePath, file, { contentType: CONTENT_TYPES[ext], upsert: false });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const res = await apiJson("/api/reports/ingest", "POST", {
    storage_path: storagePath,
    filename,
  });
  if (!res.ok) {
    throw new Error(await readApiError(res, `Processing failed (${res.status}).`));
  }
  return (await res.json()) as IngestResult;
}
