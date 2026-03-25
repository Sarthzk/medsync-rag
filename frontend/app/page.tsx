"use client";
import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";

// --- TypeScript Interfaces ---
interface ChatMessage {
  role: "user" | "ai";
  text: string;
}

export default function MedSync() {
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
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
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chat, loading]);

  const fetchFiles = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/files");
      const data = await res.json();
      setFiles(data.files || []);
    } catch (err) {
      console.error("Failed to fetch files", err);
    }
  };

  const handlePurgeVault = async () => {
    if (!confirm("⚠️ Are you sure? This will delete ALL reports and clear the database permanently.")) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/clear_db", { method: "POST" });
      const data = await res.json();
      if (data.message) {
        alert("✅ Vault cleared successfully!");
        setChat([]);
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
          question: "Extract all active medications and next doctor visit date from the reports. Format as: MEDICATIONS: [medication1, medication2] | NEXT VISIT: [date]. Be concise." 
        }),
      });
      const data = await res.json();
      const response = data.answer || "";
      
      const medMatch = response.match(/MEDICATIONS:\s*\[([^\]]+)\]/);
      const visitMatch = response.match(/NEXT VISIT:\s*([^|]+)/);
      
      if (medMatch) {
        const meds = medMatch[1].split(',').map((m: string) => m.trim()).filter((m: string) => m.length > 0);
        setMedications(meds);
      }
      if (visitMatch) {
        setNextVisit(visitMatch[1].trim());
      }
    } catch (err) {
      console.error("Failed to fetch health insights", err);
    } finally {
      setLoadingHealth(false);
    }
  };

  useEffect(() => { fetchFiles(); }, []);
  useEffect(() => { fetchHealthInsights(); }, [files]);

  const handleUpload = async () => {
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
      }
    } catch (err) {
      alert("Server connection failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleChat = async () => {
    if (!question.trim()) return;
    setLoading(true);
    const userMsg: ChatMessage = { role: "user", text: question };
    setChat((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      const aiText = data.answer || data.error || "I'm sorry, I couldn't process that.";
      setChat((prev) => [...prev, { role: "ai", text: aiText }]);
    } catch (err) {
      setChat((prev) => [...prev, { role: "ai", text: "Connection error. Is the backend running?" }]);
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

          {/* RIGHT COLUMN: Chat Co-pilot */}
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