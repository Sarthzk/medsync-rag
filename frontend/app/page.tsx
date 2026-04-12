/**
 * MedSync dashboard page.
 *
 * Main responsibilities:
 * - Upload and ingest medical reports
 * - Show vault files and preview modal
 * - Ask chat questions to backend assistant
 * - Derive quick health widgets (medications/next visit)
 */
"use client";
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

// --- TypeScript Interfaces ---
interface FaithfulnessPayload {
  confidence: number | null;
  unsupported_claims: string[];
  all_supported?: boolean;
  notes?: string;
  verification_failed?: boolean;
}

interface ChatMessage {
  role: "user" | "ai";
  text: string;
  faithfulness?: FaithfulnessPayload | null;
}

interface HealthInsights {
  medications: string[];
  next_visit: string;
}

const extractJsonObject = (text: string): HealthInsights | null => {
  const raw = (text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw) as HealthInsights;
  } catch {
    // Try best-effort JSON extraction when model wraps JSON in prose/markdown.
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as HealthInsights;
    } catch {
      return null;
    }
  }
};

export default function MedSync() {
  const greetingMessage: ChatMessage = {
    role: "ai",
    text: "Hi! I am MedSync AI. I can help you understand your uploaded reports and answer your health-report questions.",
  };

  // Core UI state for files, chat, and async actions.
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([greetingMessage]);
  const [loading, setLoading] = useState(false);
  const [files, setFiles] = useState<string[]>([]); 
  const [selectedFile, setSelectedFile] = useState<string | null>(null); 
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [medications, setMedications] = useState<string[]>([]);
  const [nextVisit, setNextVisit] = useState<string | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);

  // Ref for auto-scrolling chat
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    // Keeps latest message visible whenever chat updates.
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat, loading]);

  const fetchFiles = async () => {
    // Pulls current vault list from backend for gallery + counters.
    try {
      const res = await fetch("http://127.0.0.1:8000/files");
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error("Failed to fetch files", err);
    }
  };

  const handlePurgeVault = async () => {
    // Hard reset: clears uploaded files and vector DB.
    if (!confirm("⚠️ Are you sure? This will delete ALL reports and clear the database permanently.")) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/clear_db", { method: "POST" });
      const data = await res.json();
      if (data.message) {
        alert("✅ Vault cleared successfully!");
        setChat([greetingMessage]);
        setFiles([]);
        setMedications([]);
        setNextVisit(null);
        fetchFiles();
      }
    } catch (err) {
      alert("Server connection failed.");
    } finally {
      setClearing(false);
    }
  };

  const fetchHealthInsights = async () => {
    // Asks assistant for structured summary used by dashboard widgets.
    if (files.length === 0) {
      setMedications([]);
      setNextVisit(null);
      return;
    }
    setLoadingHealth(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skip_faithfulness: true,
          question:
            'From uploaded reports only, return strict JSON with keys "medications" (array of strings) and "next_visit" (string). Use empty array / empty string if unknown. Return JSON only.',
        }),
      });
      const data = await res.json();
      const response = data.answer || "";

      const parsed = extractJsonObject(response);
      if (parsed) {
        setMedications(
          Array.isArray(parsed.medications)
            ? parsed.medications.map((m) => String(m).trim()).filter(Boolean)
            : []
        );
        setNextVisit((parsed.next_visit || "").trim() || null);
        return;
      }

      // Backward-compatible fallback for older plain-text model responses.
      const medMatch = response.match(/MEDICATIONS:\s*\[([^\]]+)\]/i);
      const visitMatch = response.match(/NEXT VISIT:\s*([^|]+)/i);
      setMedications(
        medMatch
          ? medMatch[1].split(",").map((m: string) => m.trim()).filter(Boolean)
          : []
      );
      setNextVisit(visitMatch ? visitMatch[1].trim() : null);
    } catch (err) {
      console.error("Failed to fetch health insights", err);
      setMedications([]);
      setNextVisit(null);
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => { fetchFiles(); }, []);
  useEffect(() => { fetchHealthInsights(); }, [files]);

  const handleUpload = async () => {
    // Sends selected report file to ingestion endpoint.
    if (!file) return alert("Please select a file first!");
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("http://127.0.0.1:8000/upload", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (data.message) {
        alert("Report Digitized!");
        setFile(null);
        fetchFiles();
      } else if (data.error) {
        alert(`Upload failed: ${data.error}`);
      } else {
        alert("Upload failed. Please try again.");
      }
    } catch (err) {
      alert("Server connection failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleChat = async () => {
    // Streams assistant tokens from /chat/stream (SSE); keeps Ask disabled until complete.
    const q = question.trim();
    if (!q) return;
    setLoading(true);
    const userMsg: ChatMessage = { role: "user", text: q };
    setChat((prev) => [...prev, userMsg, { role: "ai", text: "" }]);

    try {
      const res = await fetch("http://127.0.0.1:8000/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        setChat((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "ai") {
            next[next.length - 1] = {
              role: "ai",
              text: errText || `Request failed (${res.status}).`,
            };
          }
          return next;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let carry = "";
      let full = "";

      const patchAi = (text: string, fc?: FaithfulnessPayload | null) => {
        setChat((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "ai") {
            next[next.length - 1] = {
              ...last,
              text,
              ...(fc !== undefined ? { faithfulness: fc } : {}),
            };
          }
          return next;
        });
      };

      readLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        carry += decoder.decode(value, { stream: true });
        const lines = carry.split("\n");
        carry = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (raw === "[DONE]") break readLoop;
          try {
            const j = JSON.parse(raw) as {
              t?: string;
              error?: string;
              faithfulness?: FaithfulnessPayload;
            };
            if (j.error) {
              full = `Sorry — ${j.error}`;
              patchAi(full, null);
              break readLoop;
            }
            if (j.faithfulness) {
              patchAi(full, j.faithfulness);
            }
            if (j.t) {
              full += j.t;
              patchAi(full);
            }
          } catch {
            /* ignore malformed SSE payload */
          }
        }
      }

      // If the stream ended without a trailing newline, flush the last `data:` line.
      if (carry.startsWith("data: ")) {
        const raw = carry.slice(6).trim();
        if (raw && raw !== "[DONE]") {
          try {
            const j = JSON.parse(raw) as {
              t?: string;
              error?: string;
              faithfulness?: FaithfulnessPayload;
            };
            if (j.error) {
              full = `Sorry — ${j.error}`;
              patchAi(full, null);
            } else {
              if (j.faithfulness) patchAi(full, j.faithfulness);
              if (j.t) {
                full += j.t;
                patchAi(full);
              }
            }
          } catch {
            /* ignore */
          }
        }
      }

      if (!full.trim()) {
        setChat((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "ai" && !last.text.trim()) {
            next[next.length - 1] = {
              role: "ai",
              text: "I'm sorry, I couldn't process that.",
              faithfulness: null,
            };
          }
          return next;
        });
      }
    } catch {
      setChat((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "ai") {
          next[next.length - 1] = {
            role: "ai",
            text: "Connection error. Is the backend running?",
          };
        }
        return next;
      });
    } finally {
      setQuestion("");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-extrabold text-blue-900 tracking-tight">MedSync-RAG 🩺</h1>
            <p className="text-slate-500 font-medium tracking-tight">Your Intelligent Medical Document Vault</p>
          </div>
          <div className="bg-white border border-slate-200 px-5 py-2 rounded-2xl shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vault Status</p>
            <p className="text-xl font-black text-blue-600 leading-none mt-1">{files.length} Reports</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* LEFT COLUMN: Controls & Vault */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Upload Area */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-[2rem] shadow-xl border-2 border-blue-100">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-2xl">📤</span>
                <h2 className="text-lg font-bold text-blue-900">Add Report</h2>
              </div>
              <label className="block p-6 border-2 border-dashed border-blue-300 rounded-3xl bg-white/80 hover:bg-white transition-all cursor-pointer group text-center">
                <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">📄</div>
                <p className="text-sm font-bold text-slate-700">{file ? file.name : 'Select JPG, PNG, or HEIC'}</p>
                <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
              <button onClick={handleUpload} disabled={uploading || !file} className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-2xl shadow-lg active:scale-95 disabled:bg-slate-300 transition-all uppercase text-xs tracking-widest">
                {uploading ? "🔄 Syncing..." : "✨ Digitise Now"}
              </button>
            </div>

            {/* Gallery Vault */}
            <div className="bg-white p-6 rounded-[2rem] shadow-lg border border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2"><span>📂</span> Vault</h2>
                <button onClick={handlePurgeVault} className="text-[10px] font-bold text-red-400 hover:text-red-600 uppercase tracking-widest">Purge All</button>
              </div>
              <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                {files.map((filename) => (
                  <div key={filename} onClick={() => setSelectedFile(filename)} className="group cursor-pointer bg-slate-50 border border-slate-100 rounded-2xl p-2 hover:border-blue-400 transition-all shadow-sm">
                    <div className="h-20 w-full bg-slate-200 rounded-xl overflow-hidden flex items-center justify-center">
                      {filename.toLowerCase().endsWith('.heic') ? (
                        <span className="text-3xl">📄</span>
                      ) : (
                        <img src={`http://127.0.0.1:8000/view-reports/${filename}`} className="h-full w-full object-cover group-hover:scale-110 transition-transform" alt="thumb" />
                      )}
                    </div>
                    <p className="text-[9px] font-bold text-slate-500 truncate mt-1 text-center">{filename}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Health Dashboard Widgets */}
            <div className="space-y-4">
              <div className="bg-emerald-50 p-5 rounded-3xl border border-emerald-100">
                <h3 className="text-sm font-bold text-emerald-900 mb-3 flex items-center gap-2"><span>💊</span> Medications</h3>
                {loadingHealth ? <div className="h-4 w-24 bg-emerald-200 rounded animate-pulse" /> : (
                  <div className="flex flex-wrap gap-2">
                    {medications.length > 0 ? medications.map((m, i) => (
                      <span key={i} className="text-[10px] font-bold bg-white text-emerald-700 px-3 py-1 rounded-full border border-emerald-200">{m}</span>
                    )) : <p className="text-[10px] text-emerald-600 italic">No data found</p>}
                  </div>
                )}
              </div>
              <div className="bg-amber-50 p-5 rounded-3xl border border-amber-100">
                <h3 className="text-sm font-bold text-amber-900 mb-1 flex items-center gap-2"><span>📅</span> Next Visit</h3>
                {loadingHealth ? <div className="h-4 w-24 bg-amber-200 rounded animate-pulse" /> : (
                  <p className="text-xs font-bold text-amber-700">{nextVisit || "Not scheduled"}</p>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Chat assistant transcript + input composer */}
          <div className="lg:col-span-7 bg-white rounded-[2.5rem] shadow-xl border border-slate-200 flex flex-col h-[750px] overflow-hidden">
            <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800 flex items-center gap-2"><span>🤖</span> AI Clinical Assistant</h2>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-400">ONLINE</span>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/20">
              {chat.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] p-5 rounded-3xl shadow-sm ${
                    msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-tr-none' 
                    : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none'
                  }`}>
                    <p className={`text-[9px] font-black uppercase mb-1 tracking-wider opacity-60 ${msg.role === 'user' ? 'text-right' : ''}`}>
                      {msg.role === 'user' ? 'Patient' : 'MedSync AI'}
                    </p>
                    <div className="text-sm leading-relaxed font-medium">
                       <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                    {msg.role === "ai" && msg.faithfulness && (
                      <div
                        className={`mt-3 pt-3 border-t text-[11px] leading-snug ${
                          msg.faithfulness.unsupported_claims?.length ||
                          msg.faithfulness.verification_failed
                            ? "border-amber-200 bg-amber-50/80 text-amber-950 rounded-xl px-3 py-2 -mx-1"
                            : "border-slate-200 bg-slate-50 text-slate-700 rounded-xl px-3 py-2 -mx-1"
                        }`}
                      >
                        <p className="font-bold uppercase tracking-wide text-[9px] opacity-80 mb-1">
                          Source check (vs. retrieved reports)
                        </p>
                        {msg.faithfulness.verification_failed ? (
                          <p>{msg.faithfulness.notes || "Verification did not complete."}</p>
                        ) : (
                          <>
                            {typeof msg.faithfulness.confidence === "number" && (
                              <p className="font-semibold mb-1">
                                Faithfulness: {Math.round(msg.faithfulness.confidence * 100)}%
                              </p>
                            )}
                            {msg.faithfulness.unsupported_claims &&
                            msg.faithfulness.unsupported_claims.length > 0 ? (
                              <ul className="list-disc pl-4 space-y-0.5">
                                {msg.faithfulness.unsupported_claims.map((c, idx) => (
                                  <li key={idx}>{c}</li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-emerald-800 font-medium">
                                No unsupported patient-specific claims flagged.
                              </p>
                            )}
                            {msg.faithfulness.notes ? (
                              <p className="mt-1 opacity-90">{msg.faithfulness.notes}</p>
                            ) : null}
                          </>
                        )}
                        <p className="mt-2 text-[10px] opacity-70 italic">
                          Not a substitute for reading your original documents or clinical advice.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-100 p-5 rounded-3xl rounded-tl-none shadow-sm flex gap-2">
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce" />
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.5s]" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="p-6 bg-white">
              <div className="flex gap-2 bg-slate-100 p-2 rounded-2xl border border-slate-200 focus-within:border-blue-400 focus-within:bg-white transition-all">
                <input 
                  value={question} 
                  onChange={(e) => setQuestion(e.target.value)} 
                  onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                  placeholder="Ask about your reports..." 
                  className="flex-1 bg-transparent px-4 py-3 text-sm outline-none font-medium"
                />
                <button onClick={handleChat} disabled={loading} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-md disabled:bg-slate-300">
                  Ask
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Preview */}
      {selectedFile && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSelectedFile(null)}>
          <div className="bg-white rounded-[3rem] p-10 max-w-3xl w-full relative animate-in zoom-in duration-300" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-6 text-slate-800">{selectedFile}</h3>
            {selectedFile.toLowerCase().endsWith('.heic') ? (
               <div className="p-20 text-center bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                 <p className="text-slate-400 italic font-medium text-sm">Preview not available for HEIC. Use AI Chat for report details.</p>
               </div>
            ) : (
              <img src={`http://127.0.0.1:8000/view-reports/${selectedFile}`} className="w-full max-h-[60vh] object-contain rounded-3xl shadow-2xl" alt="report" />
            )}
            <button onClick={() => setSelectedFile(null)} className="mt-8 w-full py-4 bg-slate-100 hover:bg-slate-200 rounded-2xl font-black text-xs tracking-widest text-slate-500 transition-all uppercase">Close Document</button>
          </div>
        </div>
      )}
    </main>
  );
}