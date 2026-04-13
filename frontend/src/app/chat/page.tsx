"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Loader2, FileText, AlertCircle, Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch uploaded files on mount
  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const res = await fetch("/api/files");
        if (!res.ok) throw new Error("Failed to fetch files");
        const data = await res.json();
        setUploadedFiles(data.files || []);
      } catch (err) {
        console.error("Failed to fetch files:", err);
        setUploadedFiles([]); // Set empty array on error
      }
    };
    fetchFiles();
  }, []);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message to chat
    const userMessage: Message = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: userMessage.content,
          session_id: sessionId,
          history: messages.map((m) => ({
            user: m.role === "user" ? m.content : undefined,
            assistant: m.role === "assistant" ? m.content : undefined,
          })),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to get response");
      }

      const data = await response.json();
      const assistantMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: data.answer,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Connection failed";
      setError(errorMsg);
      console.error("Chat error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-screen bg-[#FDFDFB] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-6 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#1B4332] rounded-2xl flex items-center justify-center text-white">
              <Zap size={20} />
            </div>
            <h1 className="text-3xl font-bold text-[#1B4332]">MedSync AI Assistant</h1>
          </div>
          <p className="text-slate-500 text-sm">Ask questions about your uploaded medical documents</p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar - Uploaded Files */}
        <div className="w-80 bg-white border-r border-slate-100 p-6 overflow-y-auto hidden lg:block">
          <h3 className="font-bold text-[#1B4332] mb-4 flex items-center gap-2">
            <FileText size={18} />
            Your Documents
          </h3>
          <div className="space-y-3">
            {uploadedFiles.length > 0 ? (
              uploadedFiles.map((file, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="p-3 bg-[#FDFDFB] rounded-xl border border-slate-100 hover:border-[#FFB4A2] transition-all cursor-pointer group"
                >
                  <div className="flex items-start gap-2">
                    <FileText size={16} className="text-[#2D6A4F] mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#1B4332] truncate group-hover:text-[#2D6A4F]">
                        {file.replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-1">Ready for analysis</p>
                    </div>
                  </div>
                </motion.div>
              ))
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200">
                <p className="text-xs text-slate-500 text-center">
                  No documents uploaded yet. <br />
                  <a href="/vault" className="text-[#2D6A4F] font-semibold hover:underline">
                    Upload one now
                  </a>
                </p>
              </div>
            )}
          </div>

          <hr className="my-6 border-slate-100" />

          <div className="space-y-3">
            <h4 className="font-semibold text-[#1B4332] text-sm">Quick Tips</h4>
            <ul className="text-xs text-slate-600 space-y-2">
              <li>✓ Ask about diagnoses in your reports</li>
              <li>✓ Get medication explanations</li>
              <li>✓ Understand lab results</li>
              <li>✓ Compare multiple reports</li>
            </ul>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center flex-col text-center">
                <div className="w-16 h-16 bg-[#1B4332]/10 rounded-3xl flex items-center justify-center mb-4">
                  <Zap size={32} className="text-[#1B4332]" />
                </div>
                <h2 className="text-2xl font-bold text-[#1B4332] mb-2">Start a conversation</h2>
                <p className="text-slate-500 max-w-sm">
                  Ask me questions about your medical documents. I can explain diagnoses, medications, lab results, and more.
                </p>
              </div>
            ) : (
              <>
                <AnimatePresence>
                  {messages.map((message) => (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-md rounded-2xl px-4 py-3 ${
                          message.role === "user"
                            ? "bg-[#1B4332] text-white rounded-br-sm"
                            : "bg-white border border-slate-200 text-[#1B4332] rounded-bl-sm"
                        }`}
                      >
                        <p className="text-sm leading-relaxed">{message.content}</p>
                        <p
                          className={`text-xs mt-2 ${
                            message.role === "user" ? "text-white/60" : "text-slate-400"
                          }`}
                        >
                          {message.timestamp.toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {isLoading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-sm px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Loader2 size={16} className="animate-spin text-[#2D6A4F]" />
                        <p className="text-sm text-slate-600">Analyzing your documents...</p>
                      </div>
                    </div>
                  </motion.div>
                )}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start"
                  >
                    <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-start gap-2">
                      <AlertCircle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-red-700">Error</p>
                        <p className="text-xs text-red-600">{error}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-slate-200 bg-white p-6">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSendMessage} className="flex gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me a question about your medical documents..."
                  disabled={isLoading}
                  className="flex-1 bg-[#FDFDFB] border border-slate-200 rounded-2xl px-4 py-3 text-sm placeholder-slate-400 focus:outline-none focus:border-[#FFB4A2] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="bg-[#1B4332] hover:bg-[#2D6A4F] text-white rounded-2xl px-6 py-3 font-semibold flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                >
                  {isLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Send size={18} />
                  )}
                  Send
                </button>
              </form>
              <p className="text-xs text-slate-400 mt-3 text-center">
                Your conversations are encrypted and private. Responses are based on your uploaded documents.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
