"use client";
import { useState, useRef, useEffect } from "react";
import { Send, Loader2, FileText, AlertCircle, Zap, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: string[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const [error, setError] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
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
      const response = await fetch("/api/chat/stream", {
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
        const errorText = await response.text();
        console.error(`Chat stream failed with status ${response.status}:`, errorText);
        throw new Error(`Failed to get response (${response.status}): ${errorText.slice(0, 100)}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = "";
      let sources: string[] = [];

      const assistantMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        sources: [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
      const messageId = assistantMessage.id;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              if (parsed.t) {
                // Token stream
                fullContent += parsed.t;
                // Clean and format for display
                const cleanContent = formatResponse(fullContent);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === messageId
                      ? { ...m, content: cleanContent }
                      : m
                  )
                );
              } else if (parsed.sources && Array.isArray(parsed.sources)) {
                // Sources
                sources = parsed.sources;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === messageId
                      ? { ...m, sources }
                      : m
                  )
                );
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Connection failed";
      setError(errorMsg);
      console.error("Chat error:", err);
      // Remove the added message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsLoading(false);
    }
  };

  // Function to clean and format response text for professional appearance
  const formatResponse = (text: string): string => {
    // Remove markdown headers (###, ##, #)
    text = text.replace(/^###\s+/gm, "");
    text = text.replace(/^##\s+/gm, "");
    text = text.replace(/^#\s+/gm, "");
    
    // Remove bold markdown (**text** becomes text)
    text = text.replace(/\*\*(.*?)\*\*/g, "$1");
    
    // Clean up bullet points (•• becomes •)
    text = text.replace(/•+/g, "•");
    
    // Remove excessive whitespace between sections
    text = text.replace(/\n\n\n+/g, "\n\n");
    
    // Clean up leading/trailing whitespace
    text = text.trim();
    
    return text;
  };

  return (
    <div className="h-screen bg-[#FDFDFB] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-4 sm:p-6 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 bg-[#1B4332] rounded-2xl flex items-center justify-center text-white shrink-0">
                <Zap size={20} />
              </div>
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-[#1B4332] truncate">MedSync AI Assistant</h1>
            </div>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">Ask questions about your uploaded medical documents</p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Messages */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center flex-col text-center px-4">
                <div className="w-12 sm:w-16 h-12 sm:h-16 bg-[#1B4332]/10 rounded-3xl flex items-center justify-center mb-4">
                  <Zap size={24} className="text-[#1B4332]" />
                </div>
                <h2 className="text-lg sm:text-2xl font-bold text-[#1B4332] mb-2">Start a conversation</h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm">
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
                      className={`flex ${message.role === "user" ? "justify-end" : "justify-start"} px-1 sm:px-0`}
                    >
                      <div className="max-w-xs sm:max-w-sm lg:max-w-md">
                        <div
                          className={`rounded-lg sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-3 ${
                            message.role === "user"
                              ? "bg-[#1B4332] text-white rounded-br-sm"
                              : "bg-white border border-slate-200 text-[#1B4332] rounded-bl-sm"
                          }`}
                        >
                          <p className="text-xs sm:text-sm leading-relaxed">{message.content}</p>
                          <p
                            className={`text-[10px] sm:text-xs mt-1 sm:mt-2 ${
                              message.role === "user" ? "text-white/60" : "text-slate-400"
                            }`}
                          >
                            {message.timestamp.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>

                        {/* Sources Section */}
                        {message.role === "assistant" && message.sources && message.sources.length > 0 && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="mt-2"
                          >
                            <button
                              onClick={() =>
                                setExpandedSources(
                                  expandedSources === message.id ? null : message.id
                                )
                              }
                              className="text-[10px] sm:text-xs font-semibold text-slate-600 hover:text-[#2D6A4F] flex items-center gap-1 transition-colors"
                            >
                              <span>📄 Sources used</span>
                              <ChevronDown
                                size={14}
                                className={`transition-transform ${
                                  expandedSources === message.id ? "rotate-180" : ""
                                }`}
                              />
                            </button>
                            <AnimatePresence>
                              {expandedSources === message.id && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="mt-2 space-y-1"
                                >
                                  {message.sources.map((source) => (
                                    <div
                                      key={source}
                                      className="text-[10px] sm:text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-600"
                                    >
                                      <FileText size={10} className="inline mr-1" />
                                      {source.replace(/_/g, " ")}
                                    </div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        )}
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
                    key="error"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-start px-1 sm:px-0"
                  >
                    <div className="bg-red-50 border border-red-200 rounded-lg sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-3 flex items-start gap-2 max-w-xs sm:max-w-sm">
                      <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-xs sm:text-sm font-semibold text-red-700">Error</p>
                        <p className="text-[10px] sm:text-xs text-red-600">{error}</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="border-t border-slate-200 bg-white p-3 sm:p-4 lg:p-6">
            <div className="max-w-4xl mx-auto">
              <form onSubmit={handleSendMessage} className="flex gap-2 sm:gap-3">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask me a question..."
                  disabled={isLoading}
                  className="flex-1 bg-[#FDFDFB] border border-slate-200 rounded-lg sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm placeholder-slate-400 focus:outline-none focus:border-[#FFB4A2] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="bg-[#1B4332] hover:bg-[#2D6A4F] text-white rounded-lg sm:rounded-2xl px-3 sm:px-6 py-2 sm:py-3 font-semibold flex items-center gap-1 sm:gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 text-xs sm:text-sm shrink-0 whitespace-nowrap"
                >
                  {isLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
              <p className="text-[10px] sm:text-xs text-slate-400 mt-2 sm:mt-3 text-center">
                Your conversations are encrypted and private. Responses are based on your uploaded documents.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
