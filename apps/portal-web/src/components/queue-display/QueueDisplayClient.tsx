"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { darkColors } from "@clinicez/design-tokens";
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Clock,
  User,
  Stethoscope,
  MapPin,
  AlertCircle,
  RefreshCw,
  Lock,
} from "lucide-react";
import { ClinicEzMark } from "@/components/ClinicEzLogo";
import { PublicQueueDisplayData, ServingTicket, UpcomingTicket } from "./types";
import {
  isAudioMuted,
  setAudioMuted,
  playAlertChime,
  playQueueCallAlert,
  unlockAudio,
} from "./audioChime";
import { queueDisplayService } from "@/services/queueDisplay.service";

interface QueueDisplayClientProps {
  initialData?: PublicQueueDisplayData;
  tenantSlug?: string;
  facilitySlug?: string;
  clinicId?: string;
  logoUrl?: string;
  initialPin?: string;
}

export default function QueueDisplayClient({
  initialData,
  tenantSlug,
  facilitySlug,
  clinicId,
  logoUrl,
  initialPin,
}: QueueDisplayClientProps) {
  const [data, setData] = useState<PublicQueueDisplayData | undefined>(initialData);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [lastUpdatedTime, setLastUpdatedTime] = useState<number>(Date.now());
  const [pulsingTicketIds, setPulsingTicketIds] = useState<string[]>([]);
  const [logoError, setLogoError] = useState<boolean>(false);
  const alertTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Storage key for wall TV / browser pin persistence
  const storageKey = tenantSlug && facilitySlug ? `clinicez_tv_pin_${tenantSlug}_${facilitySlug}` : "clinicez_tv_pin_cloud";

  // PIN / Passcode state
  const [tvPin, setTvPin] = useState<string>(() => {
    if (initialPin) return initialPin;
    if (typeof window !== "undefined") {
      return localStorage.getItem(storageKey) || "";
    }
    return "";
  });
  const [pinEntry, setPinEntry] = useState<string>("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<boolean>(false);

  const clinicLogo = data?.logoUrl || logoUrl;

  useEffect(() => {
    setLogoError(false);
  }, [clinicLogo]);

  // Failure backoff counter
  const failureCountRef = useRef<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tracking previously serving ticket numbers to detect call advancement
  const isInitialMountRef = useRef<boolean>(!initialData);
  const prevServingRef = useRef<string[]>(initialData?.nowServing.map((s) => s.ticketNumber) || []);

  // Sync mute state on mount
  useEffect(() => {
    setMuted(isAudioMuted());
  }, []);

  // Live clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString("en-PH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString("en-PH", {
          weekday: "long",
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      );
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  // Cleanup alert timeouts on unmount
  useEffect(() => {
    return () => {
      alertTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // Poll function
  const fetchQueue = useCallback(async (pinOverride?: string) => {
    const activePin = pinOverride !== undefined ? pinOverride : tvPin;
    const res = await queueDisplayService.getDisplayData({
      tenantSlug,
      facilitySlug,
      clinicId,
      pin: activePin || undefined,
    });

    if (res.success && res.data) {
      failureCountRef.current = 0;
      setError(null);
      setLastUpdatedTime(Date.now());

      if (activePin && res.data.isPinValid) {
        try {
          localStorage.setItem(storageKey, activePin);
        } catch {}
      }

      const newServing = res.data.nowServing.map((s) => s.ticketNumber);
      const prevServing = prevServingRef.current;

      // Audio & visual alerts when one or more tickets are newly called
      const newlyCalledTickets = res.data.nowServing.filter((s) => !prevServing.includes(s.ticketNumber));
      if (!isInitialMountRef.current && newlyCalledTickets.length > 0) {
        newlyCalledTickets.forEach((ticket, idx) => {
          const alertTimer = setTimeout(() => {
            playQueueCallAlert({
              theme: res.data?.tvDisplaySoundTheme || "classicChime",
              voiceEnabled: res.data?.tvDisplayVoiceEnabled,
              ticketNumber: ticket.ticketNumber,
              roomOrStation: ticket.roomOrStation,
              doctorName: ticket.doctorName,
              onStart: () => {
                setPulsingTicketIds((prev) => Array.from(new Set([...prev, ticket.queueItemId])));
              },
              onEnd: () => {
                setPulsingTicketIds((prev) => prev.filter((id) => id !== ticket.queueItemId));
              },
            });
          }, idx * 3600);
          alertTimeoutsRef.current.push(alertTimer);
        });
      }

      isInitialMountRef.current = false;
      prevServingRef.current = newServing;
      setData(res.data);
      setLoading(false);
    } else {
      failureCountRef.current += 1;
      setError(res.message || "Unable to sync queue updates.");
      setLoading(false); // CRITICAL: Stop skeleton trap!
    }
  }, [tenantSlug, facilitySlug, clinicId, tvPin, storageKey]);

  // Polling loop with exponential backoff on failure
  useEffect(() => {
    let isActive = true;

    const scheduleNextPoll = () => {
      if (!isActive) return;
      const baseInterval = 4000; // 4s regular polling interval
      const backoffInterval = Math.min(30000, baseInterval * Math.pow(2, failureCountRef.current));
      const nextDelay = failureCountRef.current > 0 ? backoffInterval : baseInterval;

      pollTimerRef.current = setTimeout(async () => {
        if (!isActive) return;
        await fetchQueue();
        scheduleNextPoll();
      }, nextDelay);
    };

    scheduleNextPoll();

    return () => {
      isActive = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [fetchQueue]);

  const handleUnlock = async (enteredPin: string) => {
    if (!enteredPin.trim()) return;
    setUnlocking(true);
    setPinError(null);
    try {
      const res = await queueDisplayService.getDisplayData({
        tenantSlug,
        facilitySlug,
        clinicId,
        pin: enteredPin.trim(),
      });
      setUnlocking(false);
      if (!res.success || !res.data) {
        setPinError(res.message || "Unable to verify TV passcode.");
        return;
      }
      if (res.data.isPinRequired && !res.data.isPinValid) {
        setPinError("Incorrect TV passcode. Please verify in Clinic Settings.");
        return;
      }
      setTvPin(enteredPin.trim());
      setData(res.data);
      try {
        localStorage.setItem(storageKey, enteredPin.trim());
      } catch {}
    } catch {
      setUnlocking(false);
      setPinError("Connection error verifying TV passcode.");
    }
  };

  // Physical keyboard listener for TV PIN keypad
  useEffect(() => {
    if (typeof window === "undefined") return;
    const isLocked = Boolean(data?.isPinRequired && !data?.isPinValid);
    if (!isLocked) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        setPinEntry((prev) => {
          if (prev.length >= 6) return prev;
          const next = prev + e.key;
          if (next.length === 6) {
            void handleUnlock(next);
          }
          return next;
        });
        setPinError(null);
      } else if (e.key === "Backspace") {
        setPinEntry((prev) => prev.slice(0, -1));
        setPinError(null);
      } else if (e.key === "Enter") {
        if (pinEntry.length > 0) {
          void handleUnlock(pinEntry);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [data?.isPinRequired, data?.isPinValid, pinEntry]);

  const handleLockBoard = () => {
    try {
      localStorage.removeItem(storageKey);
    } catch {}
    setTvPin("");
    setPinEntry("");
    setPinError(null);
    void fetchQueue("");
  };

  // First user interaction unlocks audio
  const handleUserInteraction = () => {
    unlockAudio();
  };

  const handleToggleMute = () => {
    unlockAudio();
    const nextMuted = !muted;
    setMuted(nextMuted);
    setAudioMuted(nextMuted);
    if (!nextMuted) {
      playAlertChime((data as any)?.tvDisplaySoundTheme || 'classicChime');
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const isStale = Date.now() - lastUpdatedTime > 60000;
  const isLocked = Boolean(data?.isPinRequired && !data?.isPinValid);

  // Render Skeleton for initial loading
  if (loading && !data) {
    return (
      <div
        className="min-h-screen w-full flex flex-col p-6 sm:p-10 font-sans select-none"
        style={{ backgroundColor: darkColors.background, color: darkColors.text }}
      >
        <div className="flex justify-between items-center pb-6 border-b" style={{ borderColor: darkColors.border }}>
          <div className="h-10 w-64 rounded-lg animate-pulse" style={{ backgroundColor: darkColors.surface }} />
          <div className="h-10 w-48 rounded-lg animate-pulse" style={{ backgroundColor: darkColors.surface }} />
        </div>
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-8 mt-8">
          <div className="lg:col-span-3 rounded-2xl animate-pulse p-10" style={{ backgroundColor: darkColors.surface }} />
          <div className="lg:col-span-2 rounded-2xl animate-pulse p-10" style={{ backgroundColor: darkColors.surface }} />
        </div>
      </div>
    );
  }

  // Render Error recovery screen if initial fetch failed
  if (!data && error) {
    return (
      <div
        className="min-h-screen w-full flex flex-col items-center justify-center p-6 sm:p-10 font-sans select-none"
        style={{ backgroundColor: darkColors.background, color: darkColors.text }}
      >
        <div
          className="w-full max-w-lg rounded-3xl border p-8 sm:p-10 flex flex-col items-center text-center shadow-2xl"
          style={{ backgroundColor: darkColors.surface, borderColor: darkColors.border }}
        >
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border"
            style={{
              backgroundColor: darkColors.warningBg,
              borderColor: darkColors.warningBorder,
              color: darkColors.warningText,
            }}
          >
            <AlertCircle className="w-8 h-8" />
          </div>

          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3">
            Unable to Load TV Queue Display
          </h2>

          <p className="text-sm sm:text-base mb-6 leading-relaxed" style={{ color: darkColors.textMuted }}>
            {error}
          </p>

          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void fetchQueue();
            }}
            className="px-6 py-3 rounded-2xl font-bold uppercase tracking-wider text-xs sm:text-sm transition-all duration-150 cursor-pointer shadow-md hover:opacity-90 active:scale-98 flex items-center gap-2"
            style={{
              backgroundColor: darkColors.primary,
              color: "white",
            }}
          >
            <RefreshCw className="w-4 h-4" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }

  const primaryServing = data?.nowServing?.[0];
  const otherServing = data?.nowServing?.slice(1) || [];
  const upNextList = data?.upNext || [];
  const pulseActive = primaryServing ? pulsingTicketIds.includes(primaryServing.queueItemId) : false;

  return (
    <div
      onClick={handleUserInteraction}
      className="h-screen w-full flex flex-col font-sans select-none overflow-hidden"
      style={{ backgroundColor: darkColors.background, color: darkColors.text }}
    >
      {/* Top Header Bar */}
      <header
        className="px-4 py-3 sm:px-8 sm:py-4 flex flex-nowrap justify-between items-center border-b shadow-md shrink-0"
        style={{ backgroundColor: darkColors.surface, borderColor: darkColors.border }}
      >
        {/* Left: Facility Brand & Live Pill */}
        <div className="flex items-center gap-4">
          {clinicLogo && !logoError ? (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden border shadow-inner shrink-0"
              style={{
                backgroundColor: darkColors.surfaceHighlight,
                borderColor: darkColors.border,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={clinicLogo}
                alt={data?.clinicName || "Clinic Logo"}
                onError={() => setLogoError(true)}
                className="w-full h-full object-contain p-1"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <ClinicEzMark
              variant="squircle"
              className="w-12 h-12 rounded-xl shrink-0 shadow-inner"
            />
          )}
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tight">
              Now Serving
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor: isLocked
                    ? darkColors.warningBg
                    : isStale
                    ? darkColors.warningBg
                    : darkColors.primaryLight,
                  color: isLocked
                    ? darkColors.warningText
                    : isStale
                    ? darkColors.warningText
                    : darkColors.primary,
                }}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                {isLocked ? "Locked (Passcode Required)" : isStale ? "Syncing..." : "Live Queue Display"}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Date, Time & TV Controls */}
        <div className="flex items-center gap-4 sm:gap-6 mt-3 sm:mt-0">
          <div className="text-right">
            <div className="text-2xl sm:text-3xl font-mono font-bold tracking-tight">{currentTime}</div>
            <div className="text-xs sm:text-sm font-medium" style={{ color: darkColors.textSecondary }}>
              {currentDate}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Lock Board Button */}
            {!isLocked && data?.isPinRequired && (
              <button
                type="button"
                onClick={handleLockBoard}
                title="Lock TV Display Board (Clear Stored PIN)"
                aria-label="Lock TV Board"
                className="p-3 rounded-xl border transition-all duration-150 flex items-center justify-center cursor-pointer hover:opacity-90 active:scale-95"
                style={{
                  backgroundColor: darkColors.surfaceHighlight,
                  borderColor: darkColors.border,
                  color: darkColors.textSecondary,
                }}
              >
                <Lock className="w-6 h-6" />
              </button>
            )}

            {/* Audio Mute/Unmute Toggle */}
            <button
              type="button"
              onClick={handleToggleMute}
              title={muted ? "Sound Muted (Click to enable)" : "Sound Active (Click to mute)"}
              aria-label={muted ? "Unmute audio" : "Mute audio"}
              className="p-3 rounded-xl border transition-all duration-150 flex items-center justify-center cursor-pointer hover:opacity-90 active:scale-95"
              style={{
                backgroundColor: muted ? darkColors.surfaceHighlight : darkColors.primarySubtle,
                borderColor: muted ? darkColors.border : darkColors.primaryBorder,
                color: muted ? darkColors.textMuted : darkColors.primary,
              }}
            >
              {muted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </button>

            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen TV Mode"}
              className="p-3 rounded-xl border transition-all duration-150 cursor-pointer hover:opacity-90 active:scale-95"
              style={{
                backgroundColor: darkColors.surfaceHighlight,
                borderColor: darkColors.border,
                color: darkColors.textSecondary,
              }}
            >
              {isFullscreen ? <Minimize2 className="w-6 h-6" /> : <Maximize2 className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Network Warning Banner */}
      {error && (
        <div
          className="px-6 py-2.5 text-center text-sm font-medium flex items-center justify-center gap-2 border-b animate-in fade-in duration-300"
          style={{
            backgroundColor: darkColors.warningBg,
            color: darkColors.warningText,
            borderColor: darkColors.warningBorder,
          }}
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error} Retrying automatically...</span>
        </div>
      )}

      {/* Main Content: Keypad or 2-Column Split Layout */}
      {isLocked ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <div
            className="w-full max-w-md rounded-3xl border p-8 sm:p-10 flex flex-col items-center shadow-2xl"
            style={{ backgroundColor: darkColors.surface, borderColor: darkColors.border }}
          >
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border shadow-inner"
              style={{
                backgroundColor: darkColors.surfaceHighlight,
                borderColor: darkColors.border,
                color: darkColors.primary,
              }}
            >
              <Lock className="w-8 h-8" />
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-center mb-2">
              TV Queue Board Locked
            </h2>
            <p className="text-sm text-center mb-6 leading-relaxed" style={{ color: darkColors.textMuted }}>
              This waiting area display board is protected. Enter the 6-digit TV passcode configured in Clinic Settings to view live queue tickets.
            </p>

            {/* Masked PIN Dots Indicator */}
            <div className="flex items-center justify-center gap-3 mb-6">
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const isFilled = idx < pinEntry.length;
                return (
                  <div
                    key={idx}
                    className={`w-4 h-4 rounded-full border-2 transition-all duration-150 flex items-center justify-center ${
                      isFilled ? "scale-110" : ""
                    }`}
                    style={{
                      borderColor: isFilled ? darkColors.primary : darkColors.border,
                      backgroundColor: isFilled ? darkColors.primary : "transparent",
                    }}
                  />
                );
              })}
            </div>

            {/* Error Message */}
            {pinError && (
              <div
                className="w-full mb-6 p-3 rounded-xl border flex items-center gap-2 text-xs font-medium"
                style={{
                  backgroundColor: darkColors.warningBg,
                  borderColor: darkColors.warningBorder,
                  color: darkColors.warningText,
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            {/* Numeric Keypad */}
            <div className="grid grid-cols-3 gap-3 w-full max-w-xs mb-6">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => {
                    setPinEntry((prev) => {
                      if (prev.length >= 6) return prev;
                      const next = prev + digit;
                      if (next.length === 6) {
                        void handleUnlock(next);
                      }
                      return next;
                    });
                    setPinError(null);
                  }}
                  className="h-14 rounded-2xl border text-xl font-bold font-mono flex items-center justify-center transition-all duration-100 hover:opacity-90 active:scale-95 cursor-pointer shadow-sm"
                  style={{
                    backgroundColor: darkColors.surfaceHighlight,
                    borderColor: darkColors.border,
                    color: darkColors.text,
                  }}
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setPinEntry("");
                  setPinError(null);
                }}
                className="h-14 rounded-2xl border text-xs font-bold uppercase tracking-wider flex items-center justify-center transition-all duration-100 hover:opacity-90 active:scale-95 cursor-pointer shadow-sm"
                style={{
                  backgroundColor: darkColors.surface,
                  borderColor: darkColors.border,
                  color: darkColors.textMuted,
                }}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinEntry((prev) => {
                    if (prev.length >= 6) return prev;
                    const next = prev + "0";
                    if (next.length === 6) {
                      void handleUnlock(next);
                    }
                    return next;
                  });
                  setPinError(null);
                }}
                className="h-14 rounded-2xl border text-xl font-bold font-mono flex items-center justify-center transition-all duration-100 hover:opacity-90 active:scale-95 cursor-pointer shadow-sm"
                style={{
                  backgroundColor: darkColors.surfaceHighlight,
                  borderColor: darkColors.border,
                  color: darkColors.text,
                }}
              >
                0
              </button>
              <button
                type="button"
                onClick={() => {
                  setPinEntry((prev) => prev.slice(0, -1));
                  setPinError(null);
                }}
                className="h-14 rounded-2xl border text-lg font-bold flex items-center justify-center transition-all duration-100 hover:opacity-90 active:scale-95 cursor-pointer shadow-sm"
                style={{
                  backgroundColor: darkColors.surface,
                  borderColor: darkColors.border,
                  color: darkColors.textMuted,
                }}
              >
                ⌫
              </button>
            </div>

            {/* Submit / Unlock Button */}
            <button
              type="button"
              disabled={pinEntry.length === 0 || unlocking}
              onClick={() => handleUnlock(pinEntry)}
              className="w-full py-4 rounded-2xl font-bold uppercase tracking-wider text-sm transition-all duration-150 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-md hover:opacity-90 active:scale-98 flex items-center justify-center gap-2"
              style={{
                backgroundColor: darkColors.primary,
                color: "white",
              }}
            >
              {unlocking ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Passcode...</span>
                </>
              ) : (
                <span>Unlock TV Display</span>
              )}
            </button>
          </div>
        </main>
      ) : (
        <main className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 p-6 sm:p-8 overflow-hidden">
        {/* Left Column (Flex 3 or 5 cols): NOW SERVING Active Stations */}
        <section className={`${upNextList.length > 0 ? "lg:col-span-3" : "lg:col-span-5"} flex flex-col min-h-0 overflow-hidden`}>
          {!primaryServing ? (
            /* Empty serving state */
            <div
              className="flex-1 rounded-3xl border-2 border-dashed p-12 flex flex-col items-center justify-center text-center"
              style={{ backgroundColor: darkColors.surface, borderColor: darkColors.border }}
            >
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
                style={{ backgroundColor: darkColors.surfaceHighlight, color: darkColors.primary }}
              >
                <Clock className="w-12 h-12" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold mb-2">No Active Patient Called</h3>
              <p className="text-lg max-w-md" style={{ color: darkColors.textSecondary }}>
                Please wait for your ticket number to be called.
              </p>
            </div>
          ) : data?.nowServing && data.nowServing.length > 1 ? (
            /* Multi-Station Equal Prominence Flexbox (Responsive, Zero-Scroll) */
            <div className="flex-1 min-h-0 flex flex-wrap gap-4 sm:gap-6 overflow-hidden">
              {data.nowServing.map((item) => {
                const isItemPulsing = pulsingTicketIds.includes(item.queueItemId);
                const count = data.nowServing.length;
                return (
                  <div
                    key={item.queueItemId}
                    className={`flex-1 rounded-3xl border-2 p-5 sm:p-6 flex flex-col justify-between transition-all duration-300 shadow-xl min-h-0 overflow-hidden ${
                      isItemPulsing ? "animate-serving-pulse" : ""
                    }`}
                    style={{
                      flexBasis:
                        count === 2
                          ? "calc(50% - 1rem)"
                          : count === 3
                          ? "calc(33.333% - 1rem)"
                          : count === 4
                          ? "calc(50% - 1rem)"
                          : "calc(33.333% - 1rem)",
                      height: count <= 3 ? "100%" : "calc(50% - 0.75rem)",
                      minWidth: "240px",
                      backgroundColor: darkColors.surface,
                      borderColor: isItemPulsing ? darkColors.primary : darkColors.border,
                    }}
                  >
                    {/* Header: Station & Status */}
                    <div className="flex items-center justify-between pb-3 border-b shrink-0" style={{ borderColor: darkColors.border }}>
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] sm:text-xs uppercase font-bold tracking-wider block" style={{ color: darkColors.textMuted }}>
                          Station / Room
                        </span>
                        <div className="text-base sm:text-lg font-black truncate" style={{ color: darkColors.text }}>
                          {item.roomOrStation || "—"}
                        </div>
                      </div>
                      {isItemPulsing && (
                        <span
                          className="px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-wider shrink-0"
                          style={{
                            backgroundColor: darkColors.primaryLight,
                            color: darkColors.primary,
                          }}
                        >
                          Just Called
                        </span>
                      )}
                    </div>

                    {/* Center: Ticket Number */}
                    <div className="text-center my-auto py-2 sm:py-4">
                      <span
                        className="text-[10px] sm:text-xs uppercase font-bold tracking-widest block mb-1"
                        style={{ color: darkColors.textMuted }}
                      >
                        Ticket Number
                      </span>
                      <div
                        className={`font-black tracking-tight leading-none drop-shadow-md font-mono whitespace-nowrap ${
                          count === 2
                            ? "text-[clamp(2.75rem,4.5vw,4.5rem)]"
                            : count === 3
                            ? "text-[clamp(2rem,3vw,3.25rem)]"
                            : "text-[clamp(1.5rem,2.2vw,2.5rem)]"
                        }`}
                        style={{ color: darkColors.primary }}
                      >
                        {item.ticketNumber}
                      </div>
                    </div>

                    {/* Footer: Attending Physician (if enabled) */}
                    {data?.tvDisplayShowPhysicianName !== false && (
                      <div className="pt-2 sm:pt-3 border-t flex flex-col shrink-0" style={{ borderColor: darkColors.border }}>
                        <span className="text-[10px] uppercase font-bold tracking-wider" style={{ color: darkColors.textMuted }}>
                          Attending Physician
                        </span>
                        <div className="text-sm sm:text-base font-bold truncate" style={{ color: darkColors.textSecondary }}>
                          {item.doctorName || "—"}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Single Station Clean Display */
            <div
              className={`flex-1 rounded-3xl border-2 p-6 sm:p-10 flex flex-col justify-between transition-all duration-300 shadow-2xl min-h-0 overflow-hidden ${
                pulseActive ? "animate-serving-pulse" : ""
              }`}
              style={{
                backgroundColor: darkColors.surface,
                borderColor: pulseActive ? darkColors.primary : darkColors.border,
              }}
            >
              {/* Header: Station & Status */}
              <div className="flex items-center justify-between pb-4 border-b shrink-0" style={{ borderColor: darkColors.border }}>
                <div>
                  <span className="text-xs uppercase font-bold tracking-wider block mb-0.5" style={{ color: darkColors.textMuted }}>
                    Station / Room
                  </span>
                  <div className="text-xl sm:text-2xl font-black" style={{ color: darkColors.text }}>
                    {primaryServing.roomOrStation || "—"}
                  </div>
                </div>
                {pulseActive && (
                  <span
                    className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor: darkColors.primaryLight,
                      color: darkColors.primary,
                    }}
                  >
                    Just Called
                  </span>
                )}
              </div>

              {/* Center: Ticket Number */}
              <div className="text-center my-auto py-4 sm:py-6">
                <span
                  className="text-xs sm:text-sm uppercase font-bold tracking-widest block mb-2"
                  style={{ color: darkColors.textMuted }}
                >
                  Ticket Number
                </span>
                <div
                  className="text-[clamp(4.5rem,8.5vw,8.5rem)] font-black tracking-tight leading-none drop-shadow-md font-mono whitespace-nowrap"
                  style={{ color: darkColors.primary }}
                >
                  {primaryServing.ticketNumber}
                </div>
              </div>

              {/* Footer: Attending Physician (if enabled) */}
              {data?.tvDisplayShowPhysicianName !== false && (
                <div className="pt-4 border-t flex flex-col shrink-0" style={{ borderColor: darkColors.border }}>
                  <span className="text-xs uppercase font-bold tracking-wider mb-0.5" style={{ color: darkColors.textMuted }}>
                    Attending Physician
                  </span>
                  <div className="text-lg sm:text-xl font-bold truncate" style={{ color: darkColors.textSecondary }}>
                    {primaryServing.doctorName || "—"}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Right Column (Flex 2 / 40%): UP NEXT (Shown on widescreen displays when tickets exist) */}
        <section className={`${upNextList.length > 0 ? "hidden lg:flex lg:col-span-2" : "hidden"} flex-col min-h-0 overflow-hidden`}>
          <div
            className="flex-1 rounded-3xl border-2 p-6 sm:p-8 flex flex-col shadow-xl overflow-hidden"
            style={{ backgroundColor: darkColors.surface, borderColor: darkColors.border }}
          >
            <div className="pb-4 mb-4 border-b shrink-0" style={{ borderColor: darkColors.border }}>
              <h2 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tight">
                Up Next
              </h2>
            </div>

            {upNextList.length > 0 ? (
              <div className="flex flex-col gap-4 sm:gap-5 overflow-y-auto no-scrollbar max-h-[calc(100vh-280px)]">
                {upNextList.slice(0, 8).map((ticket, idx) => {
                  const isUrgent = ticket.priority.toLowerCase() === "urgent";
                  const isEmergency = ticket.priority.toLowerCase() === "emergency";
                  const isOnHold = ticket.status.toLowerCase() === "onhold";

                  return (
                    <div
                      key={ticket.queueItemId}
                      className="p-4 sm:p-5 rounded-2xl border transition-all duration-150 flex items-center justify-between shadow-sm"
                      style={{
                        backgroundColor: idx === 0 ? darkColors.surfaceHighlight : darkColors.surface,
                        borderColor: isEmergency
                          ? darkColors.emergencyBorder
                          : isUrgent
                          ? darkColors.urgentBorder
                          : darkColors.border,
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
                          style={{
                            backgroundColor: darkColors.surfaceHighlight,
                            color: darkColors.textMuted,
                          }}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div
                            className="text-[clamp(1.5rem,2.2vw,2.25rem)] font-black font-mono leading-none tracking-tight whitespace-nowrap"
                            style={{
                              color: isEmergency
                                ? darkColors.emergency
                                : isUrgent
                                ? darkColors.urgent
                                : darkColors.text,
                            }}
                          >
                            {ticket.ticketNumber}
                          </div>
                          <div
                            className="text-[clamp(1.1rem,1.5vw,1.6rem)] font-bold mt-1 tracking-tight"
                            style={{ color: darkColors.textSecondary }}
                          >
                            {ticket.displayName}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        {/* Urgency Badge */}
                        <span
                          className="px-2.5 py-0.5 rounded-md text-xs font-bold uppercase tracking-wider border"
                          style={{
                            backgroundColor: isEmergency
                              ? darkColors.emergencyBg
                              : isUrgent
                              ? darkColors.urgentBg
                              : darkColors.routineBg,
                            color: isEmergency
                              ? darkColors.emergencyText
                              : isUrgent
                              ? darkColors.urgentText
                              : darkColors.routineText,
                            borderColor: isEmergency
                              ? darkColors.emergencyBorder
                              : isUrgent
                              ? darkColors.urgentBorder
                              : darkColors.routineBorder,
                          }}
                        >
                          {ticket.priority}
                        </span>

                        {/* Status Label */}
                        <span className="text-xs font-semibold" style={{ color: darkColors.textMuted }}>
                          {isOnHold ? "On Hold" : ticket.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <Clock className="w-12 h-12 mb-3" style={{ color: darkColors.textMuted }} />
                <h4 className="text-xl font-bold mb-1">Queue Line is Empty</h4>
                <p className="text-sm" style={{ color: darkColors.textMuted }}>
                  Upcoming registered tickets will appear here automatically.
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
      )}

      {/* Footer Ticker Bar */}
      <footer
        className="px-6 py-3.5 sm:px-10 flex flex-wrap justify-between items-center border-t text-xs sm:text-sm font-medium shrink-0"
        style={{
          backgroundColor: darkColors.surface,
          borderColor: darkColors.border,
          color: darkColors.textSecondary,
        }}
      >
        <div className="flex items-center gap-3">
          <span>Please wait for your ticket number to be called.</span>
        </div>
        <div className="flex items-center gap-6 mt-2 sm:mt-0">
          <span className="flex items-center gap-1.5 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Live
          </span>
        </div>
      </footer>
    </div>
  );
}
