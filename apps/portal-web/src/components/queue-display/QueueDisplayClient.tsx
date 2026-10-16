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
} from "lucide-react";
import { ClinicEzMark } from "@/components/ClinicEzLogo";
import { PublicQueueDisplayData, ServingTicket, UpcomingTicket } from "./types";
import {
  isAudioMuted,
  setAudioMuted,
  playAlertChime,
  unlockAudio,
} from "./audioChime";
import { queueDisplayService } from "@/services/queueDisplay.service";

interface QueueDisplayClientProps {
  initialData?: PublicQueueDisplayData;
  tenantSlug?: string;
  facilitySlug?: string;
  clinicId?: string;
  logoUrl?: string;
}

export default function QueueDisplayClient({
  initialData,
  tenantSlug,
  facilitySlug,
  clinicId,
  logoUrl,
}: QueueDisplayClientProps) {
  const [data, setData] = useState<PublicQueueDisplayData | undefined>(initialData);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<string>("");
  const [lastUpdatedTime, setLastUpdatedTime] = useState<number>(Date.now());
  const [pulseActive, setPulseActive] = useState<boolean>(false);
  const [logoError, setLogoError] = useState<boolean>(false);

  const clinicLogo = data?.logoUrl || logoUrl;

  useEffect(() => {
    setLogoError(false);
  }, [clinicLogo]);

  // Failure backoff counter
  const failureCountRef = useRef<number>(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Tracking previously serving ticket numbers to detect call advancement
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

  // Poll function
  const fetchQueue = useCallback(async () => {
    const res = await queueDisplayService.getDisplayData({
      tenantSlug,
      facilitySlug,
      clinicId,
    });

    if (res.success && res.data) {
      failureCountRef.current = 0;
      setError(null);
      setLastUpdatedTime(Date.now());

      const newServing = res.data.nowServing.map((s) => s.ticketNumber);
      const prevServing = prevServingRef.current;

      // Check if ticket advanced
      const hasNewCall = newServing.some((t) => !prevServing.includes(t));
      if (hasNewCall) {
        setPulseActive(true);
        setTimeout(() => setPulseActive(false), 3600);
        playAlertChime();
      }

      prevServingRef.current = newServing;
      setData(res.data);
      setLoading(false);
    } else {
      failureCountRef.current += 1;
      setError(res.message || "Unable to sync queue updates.");
      // Do not clear existing data during transient network errors
    }
  }, [tenantSlug, facilitySlug, clinicId]);

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
      playAlertChime();
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

  const primaryServing = data?.nowServing?.[0];
  const otherServing = data?.nowServing?.slice(1) || [];
  const upNextList = data?.upNext || [];

  return (
    <div
      onClick={handleUserInteraction}
      className="min-h-screen w-full flex flex-col font-sans select-none overflow-x-hidden"
      style={{ backgroundColor: darkColors.background, color: darkColors.text }}
    >
      {/* Top Header Bar */}
      <header
        className="px-6 py-4 sm:px-10 sm:py-6 flex flex-wrap justify-between items-center border-b shadow-md"
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
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              {data?.clinicName || "ClinicEZ Healthcare"}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider"
                style={{
                  backgroundColor: isStale ? darkColors.warningBg : darkColors.primaryLight,
                  color: isStale ? darkColors.warningText : darkColors.primary,
                }}
              >
                <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                {isStale ? "Syncing..." : "Live Queue Board"}
              </span>
              <span className="text-xs" style={{ color: darkColors.textMuted }}>
                {data?.patientsWaitingCount || 0} waiting in line
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

      {/* Main 2-Column Split Layout */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 p-6 sm:p-10">
        {/* Left Column (Flex 3 / 60%): NOW SERVING */}
        <section className="lg:col-span-3 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[clamp(1.75rem,2.8vw,3.25rem)] font-extrabold uppercase tracking-tight">
                Now Serving
              </h2>
              <p className="text-sm sm:text-base font-medium" style={{ color: darkColors.textMuted }}>
                Kasalukuyang Tinatawag
              </p>
            </div>
            {primaryServing && (
              <span
                className="px-4 py-1.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider border shadow-sm"
                style={{
                  backgroundColor: darkColors.primaryLight,
                  color: darkColors.primary,
                  borderColor: darkColors.primaryBorder,
                }}
              >
                In Consultation
              </span>
            )}
          </div>

          {primaryServing ? (
            <div
              className={`flex-1 rounded-3xl border-2 p-8 sm:p-12 flex flex-col justify-between transition-all duration-300 shadow-2xl ${
                pulseActive ? "animate-serving-pulse" : ""
              }`}
              style={{
                backgroundColor: darkColors.surface,
                borderColor: pulseActive ? darkColors.primary : darkColors.border,
              }}
            >
              {/* Ticket Number */}
              <div className="text-center my-auto py-6">
                <span
                  className="text-xs sm:text-sm uppercase font-bold tracking-widest block mb-2"
                  style={{ color: darkColors.textMuted }}
                >
                  Ticket Number / Numero ng Tiket
                </span>
                <div
                  className="text-[clamp(5.5rem,11vw,11.5rem)] font-black tracking-tight leading-none drop-shadow-md font-mono"
                  style={{ color: darkColors.primary }}
                >
                  {primaryServing.ticketNumber}
                </div>
              </div>

              {/* Attribution Details: Doctor & Room */}
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 sm:p-8 rounded-2xl border"
                style={{
                  backgroundColor: darkColors.surfaceHighlight,
                  borderColor: darkColors.border,
                }}
              >
                {/* Room / Station */}
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: darkColors.surface,
                      borderColor: darkColors.border,
                      color: darkColors.primary,
                    }}
                  >
                    <MapPin className="w-8 h-8" />
                  </div>
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wider" style={{ color: darkColors.textMuted }}>
                      Station / Room
                    </span>
                    <div className="text-[clamp(1.25rem,2vw,2rem)] font-extrabold leading-snug">
                      {primaryServing.roomOrStation || "Consultation Room 1"}
                    </div>
                  </div>
                </div>

                {/* Doctor */}
                <div className="flex items-center gap-4">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 border"
                    style={{
                      backgroundColor: darkColors.surface,
                      borderColor: darkColors.border,
                      color: darkColors.primary,
                    }}
                  >
                    <Stethoscope className="w-8 h-8" />
                  </div>
                  <div>
                    <span className="text-xs uppercase font-bold tracking-wider" style={{ color: darkColors.textMuted }}>
                      Attending Physician
                    </span>
                    <div className="text-[clamp(1.25rem,2vw,2rem)] font-extrabold leading-snug">
                      {primaryServing.doctorName || "Attending Doctor"}
                    </div>
                  </div>
                </div>
              </div>

              {/* Other concurrently serving stations */}
              {otherServing.length > 0 && (
                <div className="mt-6 pt-6 border-t" style={{ borderColor: darkColors.border }}>
                  <span className="text-xs uppercase font-bold tracking-wider mb-3 block" style={{ color: darkColors.textMuted }}>
                    Also Serving at Other Stations:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {otherServing.map((item) => (
                      <div
                        key={item.queueItemId}
                        className="p-3.5 rounded-xl border flex items-center justify-between"
                        style={{ backgroundColor: darkColors.surfaceHighlight, borderColor: darkColors.border }}
                      >
                        <span className="text-2xl font-mono font-bold" style={{ color: darkColors.primary }}>
                          {item.ticketNumber}
                        </span>
                        <span className="text-sm font-semibold truncate ml-2">
                          {item.roomOrStation || "Exam Room"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
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
          )}
        </section>

        {/* Right Column (Flex 2 / 40%): UP NEXT */}
        <section className="lg:col-span-2 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[clamp(1.75rem,2.8vw,3.25rem)] font-extrabold uppercase tracking-tight">
                Up Next
              </h2>
              <p className="text-sm sm:text-base font-medium" style={{ color: darkColors.textMuted }}>
                Susunod Na Tiket
              </p>
            </div>
            <span
              className="px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border"
              style={{
                backgroundColor: darkColors.surfaceHighlight,
                borderColor: darkColors.border,
                color: darkColors.textSecondary,
              }}
            >
              Queue Order
            </span>
          </div>

          <div
            className="flex-1 rounded-3xl border-2 p-6 sm:p-8 flex flex-col shadow-xl overflow-hidden"
            style={{ backgroundColor: darkColors.surface, borderColor: darkColors.border }}
          >
            {upNextList.length > 0 ? (
              <div className="flex flex-col gap-4 overflow-y-auto no-scrollbar max-h-[calc(100vh-280px)]">
                {upNextList.slice(0, 8).map((ticket, idx) => {
                  const isUrgent = ticket.priority.toLowerCase() === "urgent";
                  const isEmergency = ticket.priority.toLowerCase() === "emergency";
                  const isOnHold = ticket.status.toLowerCase() === "onhold";

                  return (
                    <div
                      key={ticket.queueItemId}
                      className="p-5 rounded-2xl border transition-all duration-150 flex items-center justify-between shadow-sm"
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
                            className="text-[clamp(1.75rem,2.6vw,2.75rem)] font-black font-mono leading-none tracking-tight"
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

      {/* Footer Ticker Bar */}
      <footer
        className="px-6 py-4 sm:px-10 flex flex-wrap justify-between items-center border-t text-xs sm:text-sm font-medium"
        style={{
          backgroundColor: darkColors.surface,
          borderColor: darkColors.border,
          color: darkColors.textSecondary,
        }}
      >
        <div className="flex items-center gap-3">
          <span className="font-bold text-white uppercase tracking-wider">Instructions:</span>
          <span>Please prepare your PhilHealth ID or QR pass and wait for your ticket to be called.</span>
        </div>
        <div className="flex items-center gap-6 mt-2 sm:mt-0 font-mono">
          <span>Display Mode: 1080p / 4K UHD</span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            Auto-refresh: 4s
          </span>
        </div>
      </footer>
    </div>
  );
}
