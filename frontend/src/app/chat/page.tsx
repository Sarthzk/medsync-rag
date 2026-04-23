"use client";
import { useState, useRef, useLayoutEffect } from "react";
import { Send, Loader2, FileText, AlertCircle, Zap, ChevronDown, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  sources?: string[];
}

type LabResult = {
  name: string;
  value: string;
  unit: string;
  reference_range: string;
  flag: string;
};

type StructuredReport = {
  patient_name: string;
  report_date: string;
  report_type: string;
  diagnoses: string[];
  medications: string[];
  lab_results: LabResult[];
  doctor_notes: string;
};

type LatestReportResponse = {
  error?: string;
  file?: string;
  modified_at?: number;
  structured_report: StructuredReport | null;
};

const cleanTextForPdf = (text: string): string => {
  return (text || "")
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ""))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const buildHealthSummaryPdf = (
  report: StructuredReport,
  reportFile: string | undefined,
  conversation: Message[]
) => {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentWidth = pageWidth - margin * 2;
  const lineHeight = 5;
  let y = 42;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const addHeading = (title: string) => {
    ensureSpace(12);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(27, 67, 50);
    doc.text(title, margin, y);
    y += 6;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(margin, y, pageWidth - margin, y);
    y += 5;
  };

  const addParagraph = (text: string, fontSize = 10) => {
    const content = cleanTextForPdf(text);
    if (!content) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(51, 65, 85);
    const lines = doc.splitTextToSize(content, contentWidth) as string[];
    for (const line of lines) {
      ensureSpace(lineHeight + 1);
      doc.text(line, margin, y);
      y += lineHeight;
    }
    y += 1;
  };

  const addBulletList = (items: string[], emptyMessage: string) => {
    if (!items.length) {
      addParagraph(emptyMessage);
      return;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);
    for (const item of items) {
      const lines = doc.splitTextToSize(`• ${cleanTextForPdf(item)}`, contentWidth - 2) as string[];
      for (const line of lines) {
        ensureSpace(lineHeight + 1);
        doc.text(line, margin, y);
        y += lineHeight;
      }
      y += 1;
    }
  };

  doc.setFillColor(27, 67, 50);
  doc.rect(0, 0, pageWidth, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("MedSync Health Summary", margin, 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("Generated from the latest structured report and recent conversation context", margin, 24);
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, 28);

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("Report overview", margin, y);
  y += 6;

  const metaLines = [
    `Patient: ${report.patient_name || "Unknown"}`,
    `Report date: ${report.report_date || "Unknown"}`,
    `Report type: ${report.report_type || "Unknown"}`,
    reportFile ? `Source file: ${reportFile}` : null,
  ].filter(Boolean) as string[];

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  metaLines.forEach((line) => {
    ensureSpace(lineHeight + 1);
    doc.text(line, margin, y);
    y += lineHeight;
  });

  y += 2;

  addHeading("Diagnoses");
  addBulletList(report.diagnoses || [], "No diagnoses found in the latest report.");

  addHeading("Medications");
  addBulletList(report.medications || [], "No medications found in the latest report.");

  addHeading("Lab results");
  if (report.lab_results?.length) {
    autoTable(doc, {
      startY: y,
      head: [["Lab", "Value", "Range", "Flag"]],
      body: report.lab_results.slice(0, 15).map((lab) => [
        cleanTextForPdf(lab.name || "Lab"),
        cleanTextForPdf([lab.value, lab.unit].filter(Boolean).join(" ")) || "—",
        cleanTextForPdf(lab.reference_range || ""),
        cleanTextForPdf(lab.flag || ""),
      ]),
      margin: { left: margin, right: margin },
      theme: "grid",
      styles: {
        fontSize: 8,
        cellPadding: 2,
        overflow: "linebreak",
        valign: "middle",
        textColor: [51, 65, 85],
      },
      headStyles: {
        fillColor: [27, 67, 50],
        textColor: [255, 255, 255],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
    });
    y = ((doc as jsPDF & { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? y) + 6;
  } else {
    addParagraph("No lab results found in the latest report.");
  }

  if (report.doctor_notes) {
    addHeading("Clinical notes");
    addParagraph(report.doctor_notes, 10);
  }

  const recentMessages = conversation.slice(-6);
  if (recentMessages.length) {
    addHeading("Recent conversation context");
    recentMessages.forEach((message) => {
      const prefix = message.role === "user" ? "Patient" : "Assistant";
      addParagraph(`${prefix}: ${message.content}`, 9);
    });
  }

  return doc;
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloadingSummary, setIsDownloadingSummary] = useState(false);
  const [sessionId] = useState(() => `session_${Date.now()}`);
  const [error, setError] = useState<string | null>(null);
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const shouldAutoScrollRef = useRef(true);
  const didInitialScrollRef = useRef(false);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 120;
  };

  useLayoutEffect(() => {
    if (!messages.length) return;
    if (!shouldAutoScrollRef.current) return;

    const behavior: ScrollBehavior = isLoading || didInitialScrollRef.current ? "auto" : "smooth";
    scrollToBottom(behavior);
    didInitialScrollRef.current = true;
  }, [messages, isLoading]);

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!input.trim()) return;

    // User sent a new message from the composer, so keep the feed anchored.
    shouldAutoScrollRef.current = true;

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
      let sseBuffer = "";

      const assistantMessage: Message = {
        id: `msg_${Date.now()}`,
        role: "assistant",
        content: "",
        timestamp: new Date(),
        sources: [],
      };

      setMessages((prev) => [...prev, assistantMessage]);
      const messageId = assistantMessage.id;

      const processSseEvent = (eventBlock: string) => {
        const lines = eventBlock.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.t) {
              fullContent += parsed.t;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === messageId
                    ? { ...m, content: fullContent }
                    : m
                )
              );
            } else if (parsed.sources && Array.isArray(parsed.sources)) {
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
            // Ignore malformed event payloads.
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          sseBuffer += decoder.decode();
          if (sseBuffer.trim()) {
            processSseEvent(sseBuffer);
          }
          break;
        }

        sseBuffer += decoder.decode(value, { stream: true });
        const events = sseBuffer.split("\n\n");
        sseBuffer = events.pop() ?? "";
        for (const eventBlock of events) {
          processSseEvent(eventBlock);
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

  const handleDownloadSummary = async () => {
    setIsDownloadingSummary(true);
    setError(null);

    try {
      const res = await fetch("/api/reports/latest");
      const latestReport = (await res.json()) as LatestReportResponse;

      if (!res.ok || !latestReport.structured_report) {
        throw new Error(latestReport.error || "Upload a report first to generate a summary.");
      }

      const doc = buildHealthSummaryPdf(
        latestReport.structured_report,
        latestReport.file,
        messages
      );

      const fileDate = (latestReport.structured_report.report_date || new Date().toISOString().slice(0, 10))
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "report";
      const safePatient = (latestReport.structured_report.patient_name || "patient")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "patient";
      doc.save(`medsync-health-summary-${safePatient}-${fileDate}.pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate PDF summary.";
      setError(message);
    } finally {
      setIsDownloadingSummary(false);
    }
  };

  return (
    <div className="h-screen bg-[#FDFDFB] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 p-4 sm:p-6 shadow-sm">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 bg-[#1B4332] rounded-2xl flex items-center justify-center text-white shrink-0">
                <Zap size={20} />
              </div>
              <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold text-[#1B4332] truncate">MedSync AI Assistant</h1>
            </div>
            <button
              type="button"
              onClick={handleDownloadSummary}
              disabled={isDownloadingSummary || isLoading}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs sm:text-sm font-semibold text-[#1B4332] shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDownloadingSummary ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              Download Summary
            </button>
          </div>
          <p className="text-xs sm:text-sm text-slate-500">Ask questions about your uploaded medical documents</p>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat Messages */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4"
          >
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
                          {message.role === "assistant" ? (
                            <div className="text-xs sm:text-sm leading-relaxed prose prose-sm max-w-none prose-headings:text-[#1B4332] prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-[#1B4332] prose-table:block prose-th:px-2 prose-td:px-2 prose-th:py-1 prose-td:py-1 prose-th:border prose-td:border prose-table:border-collapse prose-table:border-slate-200">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
                          )}
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
