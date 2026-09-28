"use client";
import { useState, useEffect, useCallback } from "react";
import { Upload, FileText, X, Loader2, Trash2, AlertCircle, Eye } from "lucide-react";
import { apiFetch, readApiError } from "@/lib/api";
import { REPORT_ACCEPT, uploadReport, validateReportFile } from "@/lib/uploadReport";

type VaultRecord = {
  id: string;
  filename: string;
  status: "pending" | "ready" | "failed";
  error: string | null;
  created_at: string;
  url: string | null;
};

export default function VaultPage() {
  const [uploading, setUploading] = useState(false);
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<VaultRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewFile, setPreviewFile] = useState<VaultRecord | null>(null);

  const getExt = (name: string) => {
    const parts = (name || "").toLowerCase().split(".");
    return parts.length > 1 ? parts[parts.length - 1] : "";
  };

  const fetchRecords = useCallback(async () => {
    try {
      const res = await apiFetch("/api/reports");
      if (!res.ok) throw new Error(await readApiError(res, "Failed to load your records."));
      const data = (await res.json()) as { reports?: VaultRecord[] };
      setRecords(data.reports ?? []);
      setListError(null);
    } catch (err) {
      console.error("Failed to fetch records:", err);
      setListError(err instanceof Error ? err.message : "Failed to load your records.");
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleDelete = async (record: VaultRecord) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await apiFetch(`/api/reports/${encodeURIComponent(record.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readApiError(res, "Failed to delete file."));
      setDeleteConfirm(null);
      await fetchRecords();
    } catch (err) {
      console.error("Failed to delete file:", err);
      setDeleteError(err instanceof Error ? err.message : "Failed to delete file.");
    } finally {
      setDeleting(false);
    }
  };

  const triggerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again still fires onChange.
    e.target.value = "";
    if (!file) return;
    setSelectedFile(file);
    setCustomName(file.name);
    setUploadError(null);
    setShowPopup(true);
  };

  const closePopup = () => {
    if (uploading) return;
    setShowPopup(false);
    setSelectedFile(null);
    setUploadError(null);
  };

  const fileProblem = (() => {
    if (!selectedFile) return null;
    try {
      validateReportFile(selectedFile);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "This file can't be uploaded.";
    }
  })();

  const handleFinalUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadError(null);
    try {
      await uploadReport(selectedFile, customName);
      setSelectedFile(null);
      setCustomName("");
      setShowPopup(false);
    } catch (error) {
      console.error("Upload error:", error);
      setUploadError(error instanceof Error ? error.message : "Upload failed.");
    } finally {
      setUploading(false);
      // Refresh either way: a failed ingest still shows up with its error status.
      await fetchRecords();
    }
  };

  return (
    <div className="p-6 sm:p-8 lg:p-8 max-w-6xl mx-auto relative pt-8 sm:pt-10 lg:pt-12">
      {/* PREVIEW MODAL */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-200 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-4xl border border-slate-100 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1B4332] truncate">
                  {previewFile.filename}
                </p>
                <p className="text-xs text-slate-400">Preview (inline)</p>
              </div>
              <button onClick={() => setPreviewFile(null)} className="p-2 rounded-xl hover:bg-slate-50">
                <X className="text-slate-400" />
              </button>
            </div>

            <div className="p-4 bg-slate-50">
              {(() => {
                const ext = getExt(previewFile.filename);
                const isImg = ["png", "jpg", "jpeg"].includes(ext);
                const isPdf = ext === "pdf";
                const isHeic = ext === "heic";

                if (!previewFile.url) {
                  return (
                    <div className="w-full h-[70vh] bg-white rounded-2xl border border-slate-100 flex items-center justify-center p-8 text-center">
                      <p className="text-sm font-bold text-[#1B4332]">Preview link unavailable. Refresh and try again.</p>
                    </div>
                  );
                }

                if (isImg) {
                  return (
                    <div className="w-full h-[70vh] bg-white rounded-2xl border border-slate-100 overflow-hidden flex items-center justify-center">
                      <img
                        src={previewFile.url}
                        alt={previewFile.filename}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                  );
                }

                if (isPdf) {
                  return (
                    <div className="w-full h-[70vh] bg-white rounded-2xl border border-slate-100 overflow-hidden">
                      <object data={previewFile.url} type="application/pdf" className="w-full h-full">
                        <iframe
                          src={previewFile.url}
                          title={`Preview ${previewFile.filename}`}
                          className="w-full h-full"
                        />
                      </object>
                    </div>
                  );
                }

                if (isHeic) {
                  return (
                    <div className="w-full h-[70vh] bg-white rounded-2xl border border-slate-100 overflow-hidden flex items-center justify-center p-8 text-center">
                      <div className="space-y-2">
                        <p className="text-sm font-bold text-[#1B4332]">Preview not supported for HEIC</p>
                        <p className="text-xs text-slate-500">
                          Your browser may download this file instead of previewing it.
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="w-full h-[70vh] bg-white rounded-2xl border border-slate-100 overflow-hidden flex items-center justify-center p-8 text-center">
                    <div className="space-y-2">
                      <p className="text-sm font-bold text-[#1B4332]">Preview not available</p>
                      <p className="text-xs text-slate-500">Unsupported file type.</p>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-200 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md border border-slate-100 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center">
                  <AlertCircle size={18} />
                </div>
                <h2 className="text-xl font-bold text-[#1B4332]">Delete file?</h2>
              </div>
              <button onClick={() => (deleting ? null : setDeleteConfirm(null))}>
                <X className="text-slate-400" />
              </button>
            </div>

            <p className="text-sm text-slate-600 mb-6">
              This will permanently delete{" "}
              <span className="font-semibold">{deleteConfirm.filename}</span>.
            </p>
            {deleteError && <p className="text-sm text-red-600 mb-4">{deleteError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteConfirm(null); setDeleteError(null); }}
                disabled={deleting}
                className="flex-1 py-3 bg-slate-100 text-[#1B4332] rounded-2xl font-bold hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                disabled={deleting}
                className="flex-1 py-3 bg-red-500 text-white rounded-2xl font-bold hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <Loader2 className="animate-spin" size={16} /> : <Trash2 size={16} />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL */}
      {showPopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-200 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-md">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-[#1B4332]">Confirm Upload</h2>
              <button onClick={closePopup}><X className="text-slate-400" /></button>
            </div>
            <div className="mb-6 p-4 bg-slate-50 rounded-2xl">
              <p className="text-sm text-slate-600">
                <span className="font-semibold">File:</span> {selectedFile?.name}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Size: {selectedFile?.size && (selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            <label className="block mb-6">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Display name</span>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                disabled={uploading}
                maxLength={200}
                className="mt-2 w-full px-4 py-3 text-sm border border-slate-200 rounded-2xl focus:outline-none focus:border-[#FFB4A2]"
              />
            </label>
            {(fileProblem || uploadError) && (
              <p className="mb-4 text-sm text-red-600 flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" /> {fileProblem || uploadError}
              </p>
            )}
            {/* button for the upload to vault */}
            <button
              onClick={handleFinalUpload}
              disabled={uploading || !customName.trim() || !!fileProblem}
              className="w-full py-4 bg-[#1B4332] text-white rounded-2xl font-bold hover:opacity-90 disabled:bg-slate-300 mb-2"
            >
              {uploading ? "Uploading & processing…" : "Upload to Vault"}
            </button>
            <button
              onClick={closePopup}
              disabled={uploading}
              className="w-full py-4 bg-slate-100 text-[#1B4332] rounded-2xl font-bold hover:bg-slate-200 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="bg-[#1B4332] rounded-[2.5rem] p-12 text-white mb-8 shadow-xl shadow-green-900/20">
        <h1 className="text-4xl font-bold">Health Vault</h1>
        <p className="text-green-100/50 mt-2">Manage your clinical documents and reports.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* UPLOAD SLOT */}
        <div className="lg:col-span-1">
          <label className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-200 rounded-[2.5rem] bg-white cursor-pointer hover:border-[#FFB4A2] transition-all">
            <input type="file" accept={REPORT_ACCEPT} className="hidden" onChange={triggerFileSelect} />
            <Upload className="w-10 h-10 text-[#FFB4A2]" />
            <p className="mt-4 font-bold text-[#1B4332]">Add Document</p>
            {uploading && <Loader2 className="animate-spin mt-2 text-[#2D6A4F]" />}
          </label>
        </div>

        {/* RECORDS LIST */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-[#1B4332] mb-6">Archived Records</h2>
          <div className="space-y-4">
            {listError && <p className="text-sm text-red-600">{listError}</p>}
            {records.length > 0 ? (
              records.map((file) => (
                <div key={file.id} className="flex items-center justify-between gap-3 p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-4 min-w-0">
                    <FileText className="text-[#2D6A4F] shrink-0" />
                    <div className="min-w-0">
                      <span className="block text-sm font-bold text-slate-700 truncate">{file.filename}</span>
                      {file.status === "pending" && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Processing</span>
                      )}
                      {file.status === "failed" && (
                        <span className="block text-[10px] font-bold text-red-500" title={file.error ?? undefined}>
                          Processing failed{file.error ? `: ${file.error}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => setPreviewFile(file)}
                      disabled={!file.url}
                      className="px-4 py-2 text-[10px] font-bold text-[#1B4332] border border-slate-200 rounded-full hover:bg-slate-100 transition-all flex items-center gap-2"
                    >
                      <Eye size={14} />
                      VIEW
                    </button>
                    <button
                      onClick={() => { setDeleteError(null); setDeleteConfirm(file); }}
                      className="px-4 py-2 text-[10px] font-bold text-red-500 border border-red-200 rounded-full hover:bg-red-50 transition-all"
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-slate-400 italic text-sm text-center py-10">No records found.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}