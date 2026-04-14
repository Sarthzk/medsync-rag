export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="w-full border-t border-slate-100 bg-white/60 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-center space-y-3">
        <div className="text-xs sm:text-sm text-slate-500">
          © {year} <span className="font-semibold text-[#1B4332]">MedSync</span>. All rights reserved.
        </div>

        <div className="text-[10px] sm:text-xs text-slate-400">
          Powered by OpenAI &amp; Supabase
        </div>
      </div>
    </footer>
  );
}

