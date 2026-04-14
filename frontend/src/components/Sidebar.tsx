"use client";

import { useState, useRef, useEffect } from "react";
import { FileText, X, Menu } from "lucide-react";
import { motion } from "framer-motion";

interface SidebarProps {
  uploadedFiles?: Array<{ name: string; url?: string } | string>;
  onFileDelete?: (filename: string) => void;
  showDocuments?: boolean;
}

export function Sidebar({
  uploadedFiles = [],
  onFileDelete,
  showDocuments = true,
}: SidebarProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Close sidebar on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarOpen) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [sidebarOpen]);

  // Helper to extract filename
  const getFileName = (file: string | { name: string; url?: string }): string => {
    return typeof file === "string" ? file : file.name;
  };

  return (
    <>
      {/* Hamburger Button - Mobile Only */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg bg-[#1B4332] hover:bg-[#2D6A4F] transition-colors shrink-0"
        title="Toggle sidebar"
      >
        <Menu size={24} className="text-white" />
      </button>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <motion.div
        ref={sidebarRef}
        initial={{ x: "-100%" }}
        animate={{
          x: sidebarOpen ? 0 : "-100%",
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30, mass: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed lg:relative left-0 top-16 bottom-0 lg:top-auto w-64 sm:w-80 bg-white border-r border-slate-100 p-4 sm:p-6 overflow-y-auto z-50 lg:z-auto flex flex-col"
      >
        {/* Mobile Header */}
        <div className="flex items-center justify-between mb-6 lg:hidden">
          <h3 className="font-bold text-[#1B4332] flex items-center gap-2 text-sm">
            <FileText size={18} />
            Navigation
          </h3>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            title="Close sidebar"
          >
            <X size={20} className="text-[#1B4332]" />
          </button>
        </div>

        {/* Desktop Header */}
        {showDocuments && (
          <h3 className="font-bold text-[#1B4332] mb-4 items-center gap-2 hidden lg:flex text-sm">
            <FileText size={18} />
            Documents
          </h3>
        )}

        {/* Documents Section */}
        {showDocuments && uploadedFiles.length > 0 && (
          <div className="space-y-3 mb-6">
            {uploadedFiles.map((file) => {
              const filename = getFileName(file);
              const key = typeof file === "string" ? file : file.name;
              return (
                <div
                  key={key}
                  className="p-3 bg-[#FDFDFB] rounded-xl border border-slate-100 hover:border-[#FFB4A2] transition-all group flex items-start justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[#1B4332] truncate group-hover:text-[#2D6A4F]">
                      {filename.replace(/_/g, " ")}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">Ready for analysis</p>
                  </div>
                  {onFileDelete && (
                    <button
                      onClick={() => onFileDelete(filename)}
                      className="ml-2 text-slate-400 hover:text-red-500 transition-colors shrink-0 opacity-0 group-hover:opacity-100"
                      title="Delete file"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {showDocuments && uploadedFiles.length === 0 && (
          <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 mb-6">
            <p className="text-xs text-slate-500 text-center">
              No documents uploaded yet. <br />
              <a href="/vault" className="text-[#2D6A4F] font-semibold hover:underline">
                Upload one now
              </a>
            </p>
          </div>
        )}

        {showDocuments && <hr className="my-6 border-slate-100" />}

        {/* Quick Tips */}
        <div className="space-y-3">
          <h4 className="font-semibold text-[#1B4332] text-sm">Quick Tips</h4>
          <ul className="text-xs text-slate-600 space-y-2">
            <li>✓ Ask about diagnoses in your reports</li>
            <li>✓ Get medication explanations</li>
            <li>✓ Understand lab results</li>
            <li>✓ Compare multiple reports</li>
          </ul>
        </div>
      </motion.div>
    </>
  );
}
