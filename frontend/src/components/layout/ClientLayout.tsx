"use client";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  
  // Hide sidebar on Login and Signup pages
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  return (
    <div className="flex min-h-screen bg-[#FDFDFB]">
      {!isAuthPage && <Sidebar />}
      
      <main className={`flex-1 transition-all duration-300 ${!isAuthPage ? "w-full" : "w-full"}`}>
        {children}
      </main>
    </div>
  );
}