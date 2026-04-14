"use client";
import { useState, useEffect } from "react";
import { Upload, FileText, X, Loader2, Trash2, AlertCircle, Eye } from "lucide-react";

type VaultRecord = { name: string; url: string };

export default function VaultPage() {
  const [uploading, setUploading] = useState(false);
  const [records, setRecords] = useState<VaultRecord[]>([]);
  const [showPopup, setShowPopup] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<VaultRecord | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previewFile, setPreviewFile] = useState<VaultRecord | null>(null);

  const getExt = (name: string) => {
    const parts = (name || "").toLowerCase().split(".");
    return parts.length > 1 ? parts[parts.length - 1] : "";
  };

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    try {
      const res = await fetch("/api/files"); // Use proxy route
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      // Handle both old format (array of strings) and new format (array of objects)
      const filesList = data.files?.map((file: string | { name: string; url: string }) => {
        if (typeof file === "string") {
          return { name: file, url: `/api/files?filename=${encodeURIComponent(file)}` };
        }
        return file;
      }) || [];
      setRecords(filesList as VaultRecord[]);
    } catch (err) {
      console.error("Failed to fetch records:", err);
      setRecords([]);
    }
  };

  const handleDelete = async (record: VaultRecord) => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/files?filename=${encodeURIComponent(record.name)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to delete file");
      }
      setDeleteConfirm(null);
      await fetchRecords();
    } catch (err) {
      console.error("Failed to delete file:", err);
      alert("Failed to delete file. Check if your Python server is running.");
    } finally {
      setDeleting(false);
    }
  };

  const triggerFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      // Auto-set custom name from file name
      setCustomName(file.name);
      setShowPopup(true);
    }
  };

  const handleFinalUpload = async () => {
    if (!selectedFile || !customName) return;

    setUploading(true);

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        // SUCCESS: Clear everything
        console.log("Upload successful!");
        setSelectedFile(null);
        setCustomName("");
        setShowPopup(false);

        // REFRESH THE LIST
        await fetchRecords();
      } else {
        const errorData = await response.json();
        alert(`Upload failed: ${errorData.error || errorData.detail || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Fetch error:", error);
      alert("Network error. Check if your Python server is running.");
    } finally {
      setUploading(false);
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
                  {previewFile.name.replace(/_/g, " ")}
                </p>
                <p className="text-xs text-slate-400">Preview (inline)</p>
              </div>
              <button onClick={() => setPreviewFile(null)} className="p-2 rounded-xl hover:bg-slate-50">
                <X className="text-slate-400" />
              </button>
            </div>

            <div className="p-4 bg-slate-50">
              {(() => {
                const ext = getExt(previewFile.name);
                const isImg = ["png", "jpg", "jpeg"].includes(ext);
                const isPdf = ext === "pdf";
                const isHeic = ext === "heic";

                if (isImg) {
                  return (
                    <div className="w-full h-[70vh] bg-white rounded-2xl border border-slate-100 overflow-hidden flex items-center justify-center">
                      <img
                        src={previewFile.url}
                        alt={previewFile.name}
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
                          title={`Preview ${previewFile.name}`}
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
              <span className="font-semibold">{deleteConfirm.name.replace(/_/g, " ")}</span>.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
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
              <button onClick={() => setShowPopup(false)}><X className="text-slate-400" /></button>
            </div>
            <div className="mb-6 p-4 bg-slate-50 rounded-2xl">
              <p className="text-sm text-slate-600">
                <span className="font-semibold">File:</span> {selectedFile?.name}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Size: {selectedFile?.size && (selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
            {/* button for the upload to vault */}
            <button
              onClick={handleFinalUpload}
              disabled={uploading}
              className="w-full py-4 bg-[#1B4332] text-white rounded-2xl font-bold hover:opacity-90 disabled:bg-slate-300 mb-2"
            >
              {uploading ? "Uploading..." : "Upload to Vault"}
            </button>
            <button
              onClick={() => setShowPopup(false)}
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
            <input type="file" className="hidden" onChange={triggerFileSelect} />
            <Upload className="w-10 h-10 text-[#FFB4A2]" />
            <p className="mt-4 font-bold text-[#1B4332]">Add Document</p>
            {uploading && <Loader2 className="animate-spin mt-2 text-[#2D6A4F]" />}
          </label>
        </div>

        {/* RECORDS LIST */}
        <div className="lg:col-span-2 bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-100">
          <h2 className="text-xl font-bold text-[#1B4332] mb-6">Archived Records</h2>
          <div className="space-y-4">
            {records && records.length > 0 ? (
              records.map((file, idx) => (
                <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <FileText className="text-[#2D6A4F]" />
                    {/* THE FIX: Added ?. and fallback || "" */}
                    <span className="text-sm font-bold text-slate-700">
                      {(file?.name || "Unnamed Document").replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewFile(file)}
                      className="px-4 py-2 text-[10px] font-bold text-[#1B4332] border border-slate-200 rounded-full hover:bg-slate-100 transition-all flex items-center gap-2"
                    >
                      <Eye size={14} />
                      VIEW
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(file)}
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