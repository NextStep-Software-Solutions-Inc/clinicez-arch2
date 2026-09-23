"use client";

import React, { useEffect, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Custom event name for programmatic navigation triggers
export const NAV_START_EVENT = "clinicez:nav-start";
export const NAV_COMPLETE_EVENT = "clinicez:nav-complete";

export function triggerNavStart() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NAV_START_EVENT));
  }
}

export function triggerNavComplete() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(NAV_COMPLETE_EVENT));
  }
}

export default function NavigationProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  // Reset progress when path or query params change
  useEffect(() => {
    if (isVisible) {
      setProgress(100);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setProgress(0);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [pathname, searchParams]);

  // Listen to manual start / complete events
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const handleStart = () => {
      setIsVisible(true);
      setProgress(25);

      interval = setInterval(() => {
        setProgress((prev) => {
          if (prev < 65) return prev + 15;
          if (prev < 85) return prev + 5;
          if (prev < 95) return prev + 1;
          return prev;
        });
      }, 150);
    };

    const handleComplete = () => {
      setProgress(100);
      setTimeout(() => {
        setIsVisible(false);
        setProgress(0);
      }, 300);
    };

    window.addEventListener(NAV_START_EVENT, handleStart);
    window.addEventListener(NAV_COMPLETE_EVENT, handleComplete);

    // Also attach to document click for internal links
    const handleDocumentClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest("a");
      if (
        target &&
        target.href &&
        target.target !== "_blank" &&
        !target.hasAttribute("download") &&
        target.origin === window.location.origin
      ) {
        const nextUrl = new URL(target.href);
        const currentUrl = new URL(window.location.href);
        if (nextUrl.pathname !== currentUrl.pathname || nextUrl.search !== currentUrl.search) {
          handleStart();
        }
      }
    };

    document.addEventListener("click", handleDocumentClick, { capture: true });

    return () => {
      clearInterval(interval);
      window.removeEventListener(NAV_START_EVENT, handleStart);
      window.removeEventListener(NAV_COMPLETE_EVENT, handleComplete);
      document.removeEventListener("click", handleDocumentClick, { capture: true });
    };
  }, []);

  if (!isVisible && progress === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 pointer-events-none h-1 bg-transparent">
      <div
        className="h-full bg-gradient-to-r from-blue-500 via-primary to-indigo-600 transition-all duration-200 ease-out shadow-[0_0_12px_rgba(59,130,246,0.6)]"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transition: progress === 100 ? "all 300ms ease-out" : "width 200ms ease-out",
        }}
      />
    </div>
  );
}
