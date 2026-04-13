"use client";
import { motion, AnimatePresence } from "framer-motion";
import { ScanSearch, FileUp, Loader2, CheckCircle, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function QuickScan() {
  const [status, setStatus] = useState<"idle" | "uploading" | "analyzing" | "success">("idle");

  const startScan = () => {
    setStatus("uploading");
    setTimeout(() => setStatus("analyzing"), 1500);
    setTimeout(() => setStatus("success"), 3500);
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
            initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
            className="text-[10px] font-bold text-[#2D6A4F] uppercase tracking-widest flex items-center gap-1"
          >
            View Insights <ArrowRight size={14} />
          </motion.button>
        )}
      </div>

      <div 
        onClick={status === "idle" ? startScan : undefined}
        className={`relative h-48 rounded-[2rem] border-2 border-dashed transition-all flex flex-col items-center justify-center gap-4 cursor-pointer
          ${status === "idle" ? "border-slate-100 bg-[#FDFDFB] hover:border-[#FFB4A2]" : "border-transparent bg-slate-50"}
        `}
      >
        <AnimatePresence mode="wait">
          {status === "idle" && (
            <motion.div key="idle" exit={{ opacity: 0, scale: 0.9 }} className="text-center space-y-2">
              <FileUp size={32} className="mx-auto text-slate-300 group-hover:text-[#FFB4A2] transition-colors" />
              <p className="text-sm font-semibold text-slate-500">Drop PDF to begin scan</p>
            </motion.div>
          )}

          {(status === "uploading" || status === "analyzing") && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-3">
              <Loader2 size={32} className="mx-auto text-[#2D6A4F] animate-spin" />
              <p className="text-sm font-bold text-[#1B4332]">
                {status === "uploading" ? "Encrypting File..." : "AI RAG Processing..."}
              </p>
            </motion.div>
          )}

          {status === "success" && (
            <motion.div key="success" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center space-y-2">
              <div className="w-12 h-12 bg-[#2D6A4F] text-white rounded-full flex items-center justify-center mx-auto shadow-lg shadow-green-900/20">
                <CheckCircle size={24} />
              </div>
              <p className="text-sm font-bold text-[#1B4332]">Analysis Complete</p>
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