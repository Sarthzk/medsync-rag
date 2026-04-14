"use client";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Sidebar from "./Sidebar";
import { createClient } from "@/lib/supabase";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const supabase = createClient();
  
  // Hide sidebar on Login and Signup pages
  const isAuthPage = pathname === "/login" || pathname === "/signup";
  
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

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        // If not logged in and not on auth page, redirect to login
        if (!user && !isAuthPage) {
          router.push("/login");
        } else {
          setIsLoading(false);
        }
      } catch (err) {
        console.error("Auth check error:", err);
        if (!isAuthPage) {
          router.push("/login");
        }
      }
    };

    checkAuth();
  }, [pathname, isAuthPage, supabase, router]);

  // If loading and not on auth page, show nothing (prevents flash of content)
  if (isLoading && !isAuthPage) {
    return <div className="min-h-screen bg-[#FDFDFB]" />;
  }

  return (
    <div className="flex min-h-screen bg-[#FDFDFB]">
      {/* Mobile Hamburger Button */}
      {!isAuthPage && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="lg:hidden fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center rounded-lg bg-[#1B4332] hover:bg-[#2D6A4F] transition-colors text-white"
          title="Toggle navigation"
        >
          {sidebarOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      )}

      {/* Mobile Sidebar Overlay */}
      {!isAuthPage && sidebarOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
        />
      )}

      {/* Mobile Sidebar - Animated */}
      {!isAuthPage && (
        <motion.div
          initial={{ x: "-100%" }}
          animate={{
            x: sidebarOpen ? 0 : "-100%",
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="lg:hidden fixed left-0 top-0 bottom-0 w-72 z-40"
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </motion.div>
      )}

      {/* Desktop Sidebar - Always Visible */}
      {!isAuthPage && (
        <div className="hidden lg:block w-72 flex-shrink-0">
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </div>
      )}
      
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
}