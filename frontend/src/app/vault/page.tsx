"use client";
import { useState, useEffect } from "react";
import { Upload, FileText, CheckCircle, Shield, X, Loader2 } from "lucide-react";

export default function VaultPage() {
  const [uploading, setUploading] = useState(false);
  const [records, setRecords] = useState<any[]>([]); // Initialize as empty array
  const [showPopup, setShowPopup] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState("");

  useEffect(() => { fetchRecords(); }, []);

  const fetchRecords = async () => {
    try {
      const res = await fetch("/api/files"); // Use proxy route
      if (!res.ok) throw new Error("Failed to fetch files");
      const data = await res.json();
      setRecords(data.files?.map((name: string) => ({ name })) || []);
    } catch (err) {
      console.error("Failed to fetch records:", err);
      setRecords([]);
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
    <div className="p-8 max-w-6xl mx-auto relative">
      {/* POPUP MODAL */}
      {showPopup && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
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
                  <button
                    onClick={() => window.open(file?.url, "_blank")}
                    className="px-4 py-2 text-[10px] font-bold text-[#FFB4A2] border border-[#FFB4A2] rounded-full hover:bg-[#FFB4A2] hover:text-white transition-all"
                  >
                    VIEW
                  </button>
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