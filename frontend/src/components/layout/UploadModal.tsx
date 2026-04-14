"use client";
import { motion, AnimatePresence } from "framer-motion";
import { X, UploadCloud, FileText, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export default function UploadModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [isUploading, setIsUploading] = useState(false);

  // Mock upload function
  const handleUpload = () => {
    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false);
      onClose();
    }, 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
          {/* Backdrop */}
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-[#1B4332]/20 backdrop-blur-sm"
          />

          {/* Modal Card */}
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-10 overflow-hidden"
          >
            <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-[#1B4332]">
              <X size={24} />
            </button>

            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-[#FFB4A2]/10 rounded-3xl flex items-center justify-center mx-auto text-[#FFB4A2]">
                {isUploading ? <CheckCircle2 className="animate-bounce" size={40} /> : <UploadCloud size={40} />}
              </div>
              
              <h2 className="text-2xl font-bold text-[#1B4332]">Upload Medical Record</h2>
              <p className="text-slate-500 text-sm">Select a PDF, JPG, or PNG. Your data is encrypted.</p>

              {/* Dropzone Area */}
              <div 
                className="mt-8 border-2 border-dashed border-[#FFB4A2]/30 rounded-4xl p-12 bg-[#FDFDFB] cursor-pointer hover:border-[#FFB4A2] transition-all"
                onClick={handleUpload}
              >
                <div className="space-y-2">
                  <p className="text-[#1B4332] font-semibold">Click to browse or drag and drop</p>
                  <p className="text-xs text-slate-400">Maximum file size: 10MB</p>
                </div>
              </div>

              {isUploading && (
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }} animate={{ width: "100%" }}
                    className="h-full bg-[#2D6A4F]"
                  />
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
