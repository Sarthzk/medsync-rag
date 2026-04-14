"use client";
import { motion, AnimatePresence } from "framer-motion";
import { ScanSearch, FileUp, Loader2, CheckCircle, ArrowRight, AlertCircle } from "lucide-react";
import { useState, useRef } from "react";

interface AnalysisResult {
  filename: string;
  summary: string;
  keyFindings: string[];
  recommendations: string[];
}

export default function QuickScan() {
  const [status, setStatus] = useState<"idle" | "uploading" | "analyzing" | "success" | "error">("idle");
  const [dragActive, setDragActive] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    // Validate file type
    if (!file.type.includes("pdf") && !file.type.includes("image")) {
      setErrorMessage("Please upload a PDF or image file");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
      return;
    }

    setStatus("uploading");
    setErrorMessage("");

    try {
      // Upload file
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Upload failed");
      }

      setStatus("analyzing");

      // Now analyze the document with a quick summary query
      const analysisResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `Please provide a brief summary of this medical document. Include: (1) Main findings or diagnosis, (2) Key test results or measurements, (3) Recommended next steps or medications. Format your response with clear headers.`,
          session_id: `quick-scan-${Date.now()}`,
        }),
      });

      if (!analysisResponse.ok) {
        const errorData = await analysisResponse.text();
        console.error("Chat API error:", analysisResponse.status, errorData);
        throw new Error(`Analysis failed (${analysisResponse.status}): ${errorData || "Unknown error"}`);
      }

      const analysisData = await analysisResponse.json();
      
      // Parse the response to extract key information
      const response = analysisData.response || "";
      
      setResult({
        filename: file.name,
        summary: response,
        keyFindings: extractKeyPoints(response, "findings"),
        recommendations: extractKeyPoints(response, "recommendations|next steps"),
      });

      setStatus("success");
    } catch (error) {
      console.error("Error:", error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to analyze document");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  const extractKeyPoints = (text: string, keyword: string): string[] => {
    const regex = new RegExp(`(?:${keyword})[:\\s]*([^\\n]+)`, "gi");
    const matches = text.match(regex) || [];
    return matches
      .slice(0, 3)
      .map((m) => m.replace(/^[^:]*:\s*/, "").trim())
      .filter((m) => m.length > 0);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const resetScan = () => {
    setStatus("idle");
    setResult(null);
    setErrorMessage("");
  };

  return (
    <div className="bg-white rounded-[3rem] p-8 border border-slate-100 shadow-sm relative overflow-hidden group">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#1B4332] text-white rounded-2xl">
            <ScanSearch size={24} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#1B4332]">Quick Scan</h3>
            <p className="text-xs text-slate-400">Instant AI analysis for new reports</p>
          </div>
        </div>
        {status === "success" && (
          <motion.button 
            onClick={resetScan}
            initial={{ opacity: 0, x: 10 }} 
            animate={{ opacity: 1, x: 0 }}
            className="text-[10px] font-bold text-[#2D6A4F] uppercase tracking-widest flex items-center gap-1 hover:text-[#1B4332] transition-colors"
          >
            Scan Another <ArrowRight size={14} />
          </motion.button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/*"
        onChange={handleInputChange}
        className="hidden"
      />

      <div 
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => {
          if (status === "idle") fileInputRef.current?.click();
        }}
        className={`relative rounded-[2rem] border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 cursor-pointer
          ${
            dragActive
              ? "border-[#FFB4A2] bg-orange-50"
              : status === "idle"
              ? "border-slate-100 bg-[#FDFDFB] hover:border-[#FFB4A2]"
              : "border-transparent bg-slate-50"
          }
          ${status === "success" ? "h-auto p-6" : "h-48"}
        `}
      >
        <AnimatePresence mode="wait">
          {status === "idle" && (
            <motion.div key="idle" exit={{ opacity: 0, scale: 0.9 }} className="text-center space-y-2">
              <FileUp size={32} className="mx-auto text-slate-300 group-hover:text-[#FFB4A2] transition-colors" />
              <p className="text-sm font-semibold text-slate-500">Drop PDF or image to begin scan</p>
              <p className="text-xs text-slate-400">or click to browse</p>
            </motion.div>
          )}

          {(status === "uploading" || status === "analyzing") && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-3">
              <Loader2 size={32} className="mx-auto text-[#2D6A4F] animate-spin" />
              <p className="text-sm font-bold text-[#1B4332]">
                {status === "uploading" ? "Uploading & Processing..." : "AI RAG Analysis..."}
              </p>
            </motion.div>
          )}

          {status === "success" && result && (
            <motion.div key="success" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="space-y-4 w-full">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-[#2D6A4F] text-white rounded-full flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-900/20">
                  <CheckCircle size={20} />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#1B4332]">Analysis Complete</p>
                  <p className="text-xs text-slate-500 mt-1">{result.filename}</p>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 space-y-3 text-left">
                <div>
                  <p className="text-xs font-semibold text-[#1B4332] uppercase tracking-wide mb-2">Summary</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{result.summary.substring(0, 300)}...</p>
                </div>

                {result.keyFindings.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-[#1B4332] uppercase tracking-wide mb-2">Key Findings</p>
                    <ul className="space-y-1">
                      {result.keyFindings.map((finding, idx) => (
                        <li key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                          <span className="text-[#2D6A4F] font-bold">•</span>
                          <span>{finding.substring(0, 150)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {status === "error" && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-3">
              <AlertCircle size={32} className="mx-auto text-red-500" />
              <p className="text-sm font-bold text-red-600">{errorMessage}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* The "Scanning" Beam Effect */}
        {(status === "uploading" || status === "analyzing") && (
          <motion.div 
            initial={{ top: 0 }} animate={{ top: "100%" }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#FFB4A2] to-transparent z-10 shadow-[0_0_15px_#FFB4A2]"
          />
        )}
      </div>
    </div>
  );
}