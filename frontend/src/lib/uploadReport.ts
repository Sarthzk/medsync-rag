import { createClient } from "@/lib/supabase";
import { apiFetch, apiJson, readApiError } from "@/lib/api";

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
};

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;

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

/** HEIC photos are converted to JPEG in the browser: Storage and the extraction model only take PNG/JPEG/PDF. */
async function normalizeHeic(file: File): Promise<File> {
  if (extensionOf(file.name) !== "heic") return file;
  const { default: heic2any } = await import("heic2any");
  const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  return new File([blob], file.name.replace(/\.heic$/i, ".jpg"), { type: "image/jpeg" });
}

/** Waits for the background job to finish; throws the failure reason if it fails. */
async function waitUntilProcessed(reportId: string): Promise<void> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await apiFetch(`/api/reports/${encodeURIComponent(reportId)}`);
    if (res.ok) {
      const report = (await res.json()) as { status: string; error?: string | null };
      if (report.status === "ready") return;
      if (report.status === "failed") throw new Error(report.error || "Processing failed. Please try again.");
    } else if (res.status === 401 || res.status === 404) {
      throw new Error(await readApiError(res, "Processing failed. Please try again."));
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error("Processing is taking longer than expected. Check your vault in a minute.");
}

/**
 * Uploads a report straight to the user's private Supabase Storage folder (bypassing the
 * 4.5 MB serverless body limit), then asks the API to extract and index it.
 * `displayName` is the filename shown in the app and cited in answers.
 */
export async function uploadReport(original: File, displayName: string = original.name): Promise<IngestResult> {
  validateReportFile(original);
  const file = await normalizeHeic(original);
  if (file !== original && extensionOf(displayName) === "heic") {
    displayName = displayName.replace(/\.heic$/i, ".jpg");
  }

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
  const result = (await res.json()) as IngestResult;
  if (result.status !== "ready") await waitUntilProcessed(result.report_id);
  return { ...result, status: "ready" };
}
