"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  GuestJoinPage,
  CallWaitingRoom,
  MessageThread,
  type GuestVerificationResult,
  type ThreadMessage,
} from "@clinicez/comms-sdk/web-ui";
import { MessageSquare, Video, Mic, MicOff, VideoOff, PhoneOff, Lock } from "lucide-react";

export interface TeleconsultGuestFlowProps {
  inviteToken?: string;
  clinicName?: string;
  clinicLogoUrl?: string;
  clinicSupportPhone?: string;
  mockVerificationHandler?: (dob: string, otp: string) => Promise<GuestVerificationResult>;
  initialStage?: "verify" | "waiting_room" | "in_call" | "ended";
  initialActiveSession?: GuestVerificationResult;
  isYakapExempt?: boolean;
  paymentPolicy?: "Prepaid" | "Postpaid" | "Exempt";
  paymentStatus?: "Unpaid" | "Paid" | "Exempt" | "Overridden";
  userRole?: "Clinician" | "Patient" | "Staff";
  className?: string;
}

export function TeleconsultGuestFlow({
  inviteToken = "",
  clinicName = "ClinicEZ Healthcare",
  clinicLogoUrl,
  clinicSupportPhone = "(02) 8123-4567",
  mockVerificationHandler,
  initialStage = "verify",
  initialActiveSession,
  isYakapExempt = true,
  paymentPolicy = "Exempt",
  paymentStatus = "Paid",
  userRole = "Patient",
  className = "",
}: TeleconsultGuestFlowProps) {
  const [stage, setStage] = useState<"verify" | "waiting_room" | "in_call" | "ended">(initialStage);
  const [session, setSession] = useState<GuestVerificationResult | null>(initialActiveSession ?? null);
  const [recordingConsent, setRecordingConsent] = useState<"Pending" | "Approved" | "Rejected" | "Disabled">("Pending");
  const [isReadyToAdmit, setIsReadyToAdmit] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [privacyBlurEnabled, setPrivacyBlurEnabled] = useState(true);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [isMicActive, setIsMicActive] = useState(true);

  // In-call messages thread state
  const [messages, setMessages] = useState<ThreadMessage[]>([
    {
      id: "msg-init-1",
      seq: 1,
      conversationId: session?.callId || "teleconsult-conv",
      senderType: "Staff",
      senderId: "system-care-team",
      senderDisplayName: "ClinicEZ Care Team",
      contentText: "Welcome to your secure teleconsultation room. Your communication is end-to-end encrypted.",
      clientSentAtUtc: new Date().toISOString(),
      state: "Received",
      visibility: "Public",
      requiresAcknowledgement: false,
    },
  ]);

  // Intercept fetch calls to /api/v1/guest/verify when in verify stage
  useEffect(() => {
    if (stage !== "verify") return;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      try {
        const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url;
        if (url && url.includes("/api/v1/guest/verify") && res.ok) {
          const cloned = res.clone();
          cloned
            .json()
            .then((data) => {
              const payload: GuestVerificationResult = data.data ?? data;
              setSession(payload);
              setStage("waiting_room");
            })
            .catch(() => {});
        }
      } catch {
        // Ignore JSON clone errors
      }
      return res;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [stage]);

  // Handle mock verification or test handler
  const handleMockVerification = async (dob: string, otp: string): Promise<GuestVerificationResult> => {
    if (mockVerificationHandler) {
      const res = await mockVerificationHandler(dob, otp);
      setSession(res);
      setStage("waiting_room");
      return res;
    }

    const payload: GuestVerificationResult = {
      callId: `call-${Date.now()}`,
      roomName: `room-${inviteToken || "guest"}`,
      relayUrl: "wss://media.clinicez.com",
      guestToken: "jwt-token-guest",
    };
    setSession(payload);
    setStage("waiting_room");
    return payload;
  };

  const handleSendMessage = async (text: string, isInternal: boolean): Promise<void> => {
    const newId = `msg-${Date.now()}`;
    const newMsg: ThreadMessage = {
      id: newId,
      seq: messages.length + 1,
      conversationId: session?.callId || "teleconsult-conv",
      senderType: userRole === "Clinician" ? "Staff" : "Patient",
      senderId: "patient-guest-id",
      senderDisplayName: userRole === "Clinician" ? "Attending Clinician" : "You (Guest)",
      contentText: text,
      clientSentAtUtc: new Date().toISOString(),
      state: "Sending",
      visibility: isInternal ? "Internal" : "Public",
      requiresAcknowledgement: false,
    };

    setMessages((prev) => [...prev, newMsg]);

    // Simulated network delivery truth state transitions:
    // Sending -> Waiting -> Received
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === newId ? { ...m, state: "Waiting" } : m))
      );
    }, 400);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === newId ? { ...m, state: "Received" } : m))
      );
    }, 900);
  };

  const handleResendMessage = async (messageId: string): Promise<void> => {
    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, state: "Sending" } : m))
    );
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, state: "Received" } : m))
      );
    }, 600);
  };

  // State 1: Verification Form (GuestJoinPage)
  if (stage === "verify") {
    return (
      <GuestJoinPage
        inviteToken={inviteToken}
        apiBaseUrl=""
        clinicName={clinicName}
        clinicLogoUrl={clinicLogoUrl}
        clinicSupportPhone={clinicSupportPhone}
        mockVerificationHandler={mockVerificationHandler ? handleMockVerification : undefined}
        onSessionEnded={() => setStage("ended")}
        className={className}
      />
    );
  }

  // State 2: Virtual Waiting Room (CallWaitingRoom)
  if (stage === "waiting_room") {
    return (
      <div className={`min-h-screen bg-background text-foreground flex flex-col ${className}`}>
        <CallWaitingRoom
          callId={session?.callId || "call-guest"}
          appointmentId={session?.callId || "apt-guest"}
          userRole={userRole}
          patientName="Guest Patient"
          clinicianName={`${clinicName} Attending Clinician`}
          scheduledTime="Today (Immediate Intake)"
          paymentPolicy={paymentPolicy}
          paymentStatus={paymentStatus}
          isYakapExempt={isYakapExempt}
          isReadyToAdmit={isReadyToAdmit}
          recordingConsentStatus={recordingConsent}
          onSubmitConsent={async (approved: boolean) => {
            setRecordingConsent(approved ? "Approved" : "Rejected");
          }}
          onEmergencyPaymentOverride={async () => {
            // Clinician emergency override
          }}
          onEnterCall={() => setStage("in_call")}
          onCancelCall={() => setStage("ended")}
          className="flex-1"
        />
      </div>
    );
  }

  // State 3: Active Consultation Room with Video & MessageThread
  if (stage === "in_call") {
    return (
      <main className={`min-h-screen flex flex-col bg-background text-foreground ${className}`}>
        {/* Navigation & Status Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-card border-b border-border shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <div>
              <h1 className="text-sm font-bold text-foreground">
                {clinicName} Teleconsultation
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Room: <span className="font-mono">{session?.roomName || "Consultation Room"}</span> • Zero-PHI Relay
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsChatOpen((prev) => !prev)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-colors cursor-pointer ${
                isChatOpen
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-foreground border-border hover:bg-muted/80"
              }`}
              aria-label="Toggle consultation chat"
            >
              <MessageSquare className="w-4 h-4" />
              <span>In-Call Chat</span>
              <span className="px-1.5 py-0.5 rounded-full bg-background/20 text-[10px] font-bold">
                {messages.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setStage("ended")}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
              aria-label="Leave teleconsultation"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Leave</span>
            </button>
          </div>
        </header>

        {/* Call Workspace Grid */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Video View Area */}
          <div className="flex-1 flex flex-col items-center justify-center p-4 relative bg-muted/40">
            <div className="w-full max-w-4xl aspect-video rounded-2xl bg-card border border-border shadow-lg flex flex-col items-center justify-center relative overflow-hidden">
              <div className="text-center space-y-2 p-6">
                <div className="w-16 h-16 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center text-3xl">
                  👨‍⚕️
                </div>
                <h2 className="text-base font-bold text-foreground">
                  Clinician Video Feed Active
                </h2>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                  <Lock className="w-3.5 h-3.5" />
                  <span>End-to-End Encrypted Live Stream</span>
                </div>
              </div>

              {/* Guest Self-Preview PiP Canvas */}
              <div className="absolute bottom-4 right-4 w-40 sm:w-48 aspect-video rounded-xl bg-muted border border-border shadow-md flex items-center justify-center overflow-hidden">
                <span className="text-xs font-medium text-muted-foreground">
                  {isCameraActive ? "You (Guest)" : "Camera Off"}
                </span>
              </div>

              {/* Media Controls Toolbar */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-background/90 backdrop-blur-sm border border-border px-4 py-2 rounded-full shadow-md">
                <button
                  type="button"
                  onClick={() => setIsMicActive((prev) => !prev)}
                  className={`min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-sm transition-colors cursor-pointer ${
                    isMicActive
                      ? "bg-muted text-foreground hover:bg-muted/80"
                      : "bg-destructive text-destructive-foreground"
                  }`}
                  aria-label={isMicActive ? "Mute microphone" : "Unmute microphone"}
                >
                  {isMicActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                </button>

                <button
                  type="button"
                  onClick={() => setIsCameraActive((prev) => !prev)}
                  className={`min-h-[44px] min-w-[44px] rounded-full flex items-center justify-center text-sm transition-colors cursor-pointer ${
                    isCameraActive
                      ? "bg-muted text-foreground hover:bg-muted/80"
                      : "bg-destructive text-destructive-foreground"
                  }`}
                  aria-label={isCameraActive ? "Turn off camera" : "Turn on camera"}
                >
                  {isCameraActive ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* In-Call Chat Drawer (MessageThread) */}
          {isChatOpen && (
            <aside className="w-80 sm:w-96 border-l border-border bg-card flex flex-col h-full shadow-xl">
              <MessageThread
                conversationId={session?.callId || "teleconsult-chat"}
                conversationTitle="Clinical Encounter Chat"
                conversationScope="Teleconsultation"
                messages={messages}
                currentUserId="patient-guest-id"
                privacyBlurEnabled={privacyBlurEnabled}
                onTogglePrivacyBlur={() => setPrivacyBlurEnabled((prev) => !prev)}
                onSendMessage={handleSendMessage}
                onResendMessage={handleResendMessage}
                canWriteInternalNotes={userRole === "Clinician"}
                className="flex-1"
              />
            </aside>
          )}
        </div>
      </main>
    );
  }

  // State 4: Session Ended
  return (
    <main className={`min-h-screen flex items-center justify-center p-4 bg-background text-foreground ${className}`}>
      <div className="w-full max-w-md p-8 rounded-3xl bg-card border border-border text-center shadow-lg space-y-4">
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl font-bold">
          ✓
        </div>
        <h1 className="text-xl font-bold text-foreground">
          Consultation Concluded
        </h1>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your teleconsultation session with {clinicName} has ended. Any clinical orders, prescriptions, or laboratory referrals will be sent directly to your registered contact.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setStage("verify")}
            className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:opacity-95 transition-all cursor-pointer"
          >
            Return to Teleconsultation Portal
          </button>
        </div>
      </div>
    </main>
  );
}
