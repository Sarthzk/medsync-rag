"use client";
import { useState } from "react";

export default function MedSync() {
  const [file, setFile] = useState<File | null>(null);
  const [question, setQuestion] = useState("");
  const [chat, setChat] = useState<{ role: string; text: string }[]>([]);
  const [loading, setLoading] = useState(false);

  // 1. Upload Function
  const [uploading, setUploading] = useState(false);

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
    alert(data.message || data.error);
  } finally {
    setUploading(false); // Stop animation
  }
};

const handleClear = async () => {
  if (confirm("Are you sure you want to clear all medical records?")) {
    await fetch("http://127.0.0.1:8000/clear_db", { method: "POST" });
    setChat([]);
    alert("Database Cleared");
  }
};

  // 2. Chat Function
  const handleChat = async () => {
    if (!question) return;
    setLoading(true);
    setChat([...chat, { role: "user", text: question }]);

    const res = await fetch("http://127.0.0.1:8000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    setChat((prev) => [...prev, { role: "ai", text: data.answer }]);
    setQuestion("");
    setLoading(false);
  };

  return (
  <main className="min-h-screen bg-slate-100 p-8 font-sans text-slate-900">
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-4xl font-extrabold text-blue-900 tracking-tight">
        MedSync-RAG <span className="text-blue-600">🩺</span>
      </h1>
      
      {/* Upload Section */}
      <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200">
        <h2 className="text-xl font-bold text-slate-800 mb-4">1. Upload Medical Report</h2>
        <div className="p-4 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50">
          <input 
            type="file" 
            onChange={(e) => setFile(e.target.files?.[0] || null)} 
            className="block w-full text-sm text-slate-900 font-medium
                       file:mr-4 file:py-2 file:px-4
                       file:rounded-full file:border-0
                       file:text-sm file:font-bold
                       file:bg-blue-600 file:text-white
                       hover:file:bg-blue-700 cursor-pointer"
          />
        </div>
        <button 
  onClick={handleUpload} 
  disabled={uploading}
  className={`mt-4 w-full text-white font-bold py-3 rounded-xl shadow-lg active:scale-95 transition-all flex items-center justify-center ${
    uploading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-700 hover:bg-blue-800'
  }`}
>
  {uploading ? (
    <>
      <svg className="animate-spin h-5 w-5 mr-3 border-t-2 border-white rounded-full" viewBox="0 0 24 24"></svg>
      Analyzing Report...
    </>
  ) : "Upload to Vault"}
</button>

{/* Add this small button below the main one to clear the DB */}
<button onClick={handleClear} className="mt-2 text-xs text-red-500 hover:underline w-full text-center">
  Clear all stored records
</button>
      </div>

      {/* Chat Section */}
      <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200 h-screen flex flex-col">
        <h2 className="text-xl font-bold text-slate-800 mb-4">2. Medical Co-pilot</h2>
        
        <div className="flex-1 overflow-y-auto space-y-4 mb-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
          {chat.length === 0 && (
            <p className="text-slate-500 text-center mt-20">Ask a question about your uploaded records...</p>
          )}
          {chat.map((msg, i) => (
            <div key={i} className={`p-4 rounded-2xl shadow-sm max-w-[85%] leading-relaxed ${
              msg.role === 'user' 
              ? 'bg-blue-700 text-white ml-auto' 
              : 'bg-white text-slate-900 border border-slate-200 mr-auto'
            }`}>
              <p className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">
                {msg.role === 'user' ? 'You' : 'MedSync AI'}
              </p>
              <p className="text-md font-medium">{msg.text}</p>
            </div>
          ))}
          {loading && (
            <div className="bg-slate-200 text-slate-700 p-4 rounded-2xl w-24 animate-pulse font-bold">
              ...
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <input 
            value={question} 
            onChange={(e) => setQuestion(e.target.value)} 
            onKeyDown={(e) => e.key === 'Enter' && handleChat()}
            placeholder="Search symptoms, dosages, or dates..." 
            className="flex-1 border-2 border-slate-200 rounded-xl px-5 py-3 text-slate-900 font-medium focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-colors"
          />
          <button 
            onClick={handleChat} 
            className="bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-black transition-colors"
          >
            Ask
          </button>
        </div>
      </div>
    </div>
  </main>
);
}