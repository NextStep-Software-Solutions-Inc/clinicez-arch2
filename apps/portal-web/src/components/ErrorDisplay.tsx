"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RefreshCw, Home, LogOut } from "lucide-react";
import { SignOutButton } from "@clerk/nextjs";

interface ErrorDisplayProps {
  error: Error & { digest?: string };
  reset?: () => void;
  title?: string;
  description?: string;
}

export default function ErrorDisplay({
  error,
  reset,
  title = "Something went wrong",
  description,
}: ErrorDisplayProps) {
  useEffect(() => {
    console.error("ErrorDisplay caught:", error);
  }, [error]);

  const errorMessage = description || error?.message || "An unexpected connection or authentication error occurred while communicating with the server.";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 relative overflow-hidden select-none">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-red-900/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-violet-950/20 blur-[120px] pointer-events-none" />

      {/* Decorative subtle grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-35" />

      <div className="w-full max-w-md bg-slate-900/70 border border-slate-800/80 backdrop-blur-xl rounded-2xl p-8 shadow-2xl relative z-10 text-center animate-[fadeIn_0.5s_ease-out]">
        
        {/* Glowing Alert Icon wrapper */}
        <div className="mx-auto w-16 h-16 bg-red-950/40 border border-red-500/30 text-red-500 rounded-2xl flex items-center justify-center mb-6 shadow-[0_0_20px_rgba(239,68,68,0.15)] relative">
          <AlertCircle className="w-8 h-8 animate-pulse" />
          <div className="absolute -inset-1 rounded-2xl bg-red-500/10 blur-sm pointer-events-none" />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
          {title}
        </h1>
        
        <p className="text-slate-400 text-sm mb-8 leading-relaxed">
          {errorMessage}
        </p>

        {/* Action Buttons */}
        <div className="space-y-3">
          {reset && (
            <button
              onClick={() => reset()}
              className="flex items-center justify-center w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-medium py-3 px-4 rounded-xl shadow-lg shadow-red-950/20 transition-all duration-200 active:scale-[0.98] group cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 mr-2 group-hover:rotate-45 transition-transform duration-300" />
              Try Again
            </button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/"
              className="flex items-center justify-center bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/50 font-medium py-2.5 px-4 rounded-xl transition-all duration-200 active:scale-[0.98]"
            >
              <Home className="w-4 h-4 mr-2" />
              Home
            </Link>

            <SignOutButton redirectUrl="/sign-in">
              <button
                className="flex items-center justify-center bg-slate-800/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/50 font-medium py-2.5 px-4 rounded-xl transition-all duration-200 active:scale-[0.98] cursor-pointer"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </button>
            </SignOutButton>
          </div>
        </div>
      </div>
    </div>
  );
}
