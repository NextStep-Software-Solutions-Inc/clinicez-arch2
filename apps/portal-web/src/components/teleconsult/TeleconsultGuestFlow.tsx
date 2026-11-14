"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  GuestJoinPage,
  CallWaitingRoom,
  CallStage,
  MessageThread,
  resolveWebShadows,
  type GuestVerificationResult,
  type ThreadMessage,
} from "@clinicez/comms-sdk/web-ui";
import { useCallSession } from "@clinicez/comms-sdk/react";
import {
  LiveKitMediaAdapter,
  LocalPreviewMediaAdapter,
  isWebRtcSupported,
  type IMediaRoomAdapter,
} from "@clinicez/comms-sdk/core";
import { Check, Lock, MessageSquare, PhoneOff } from "lucide-react";
import { getPortalApiUrl } from "@/utils/domain";

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

interface WebVideoTrackViewProps {
  track: unknown;
  muted?: boolean;
  mirror?: boolean;
  className?: string;
  onVideoElement?: (el: HTMLVideoElement | null) => void;
}

const WebVideoTrackView: React.FC<WebVideoTrackViewProps> = React.memo(
  function WebVideoTrackView({ track, muted = false, mirror = false, className, onVideoElement }) {
    const videoElRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
      const el = videoElRef.current;
      if (onVideoElement) onVideoElement(el);
      if (!el || !track) return;

      const attachable = track as {
        attach?: (element: HTMLMediaElement) => void;
        detach?: (element?: HTMLMediaElement) => void;
      };

      if (typeof attachable.attach === "function") {
        attachable.attach(el);
        return () => {
          attachable.detach?.(el);
        };
      }

      if (typeof MediaStream !== "undefined" && track instanceof MediaStreamTrack) {
        el.srcObject = new MediaStream([track]);
        return () => {
          if (el.srcObject) el.srcObject = null;
        };
      }

      if (typeof MediaStream !== "undefined" && track instanceof MediaStream) {
        el.srcObject = track;
        return () => {
          if (el.srcObject) el.srcObject = null;
        };
      }
      return undefined;
    }, [track, onVideoElement]);

    if (typeof window === "undefined" || !track) return null;

    return (
      <video
        ref={(el) => {
          videoElRef.current = el;
          if (onVideoElement) onVideoElement(el);
        }}
        autoPlay
        playsInline
        muted={muted}
        className={className || "w-full h-full object-cover"}
        style={{ transform: mirror ? "scaleX(-1)" : undefined }}
      />
    );
  }
);

const WebAudioTrackView: React.FC<{ track: unknown }> = ({ track }) => {
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const el = audioElRef.current;
    if (!el || !track) return;

    const attachable = track as {
      attach?: (element: HTMLMediaElement) => void;
      detach?: (element?: HTMLMediaElement) => void;
    };

    if (typeof attachable.attach === "function") {
      attachable.attach(el);
      return () => {
        attachable.detach?.(el);
      };
    }

    if (typeof MediaStream !== "undefined" && track instanceof MediaStreamTrack) {
      el.srcObject = new MediaStream([track]);
      return () => {
        if (el.srcObject) el.srcObject = null;
      };
    }
    return undefined;
  }, [track]);

  if (typeof window === "undefined" || !track) return null;

  return <audio ref={audioElRef} autoPlay playsInline />;
};

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
  const [isReadyToAdmit] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [pendingConsentSessionId, setPendingConsentSessionId] = useState<string | null>(null);
  const [privacyBlurEnabled, setPrivacyBlurEnabled] = useState(true);
  const guestShadows = useMemo(() => resolveWebShadows(), []);
  const isChatOpenRef = useRef(isChatOpen);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
    if (isChatOpen) {
      setUnreadChatCount(0);
    }
  }, [isChatOpen]);

  // In-call messages thread state
  const [messages, setMessages] = useState<ThreadMessage[]>([
    {
      id: "msg-init-1",
      seq: 1,
      conversationId: session?.callId || "teleconsult-conv",
      senderType: "Staff",
      senderId: "system-care-team",
      senderDisplayName: "ClinicEZ Care Team",
      contentText: "Welcome to your private consultation room. Your conversation is secure and confidential.",
      clientSentAtUtc: new Date().toISOString(),
      state: "Received",
      visibility: "Public",
      requiresAcknowledgement: false,
    },
  ]);

  // Media Adapter (browser WebRTC vs preview fallback)
  const mediaAdapter = useMemo<IMediaRoomAdapter | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    if (isWebRtcSupported()) {
      return new LiveKitMediaAdapter();
    }
    return new LocalPreviewMediaAdapter();
  }, []);

  // Track & network state synchronization
  const [localVideoTrack, setLocalVideoTrack] = useState<unknown | null>(null);
  const [remoteVideoTrack, setRemoteVideoTrack] = useState<unknown | null>(null);
  const [remoteAudioTrack, setRemoteAudioTrack] = useState<unknown | null>(null);
  const [networkQuality, setNetworkQuality] = useState<"excellent" | "good" | "poor" | "reconnecting">("good");

  useEffect(() => {
    if (!mediaAdapter) return;
    const updateTracks = () => {
      setLocalVideoTrack(mediaAdapter.getLocalVideoTrack());
      setRemoteVideoTrack(mediaAdapter.getRemoteVideoTrack());
      setRemoteAudioTrack(mediaAdapter.getRemoteAudioTrack());
      if (mediaAdapter.getNetworkQuality) {
        setNetworkQuality(mediaAdapter.getNetworkQuality());
      }
    };

    updateTracks();
    const unsubSub = mediaAdapter.on("trackSubscribed", updateTracks);
    const unsubUnsub = mediaAdapter.on("trackUnsubscribed", updateTracks);
    const unsubLocal = mediaAdapter.on("localTrackChanged", updateTracks);
    const unsubConn = mediaAdapter.on("connected", updateTracks);
    const unsubDisc = mediaAdapter.on("disconnected", updateTracks);
    const unsubQuality = mediaAdapter.on("networkQualityChanged", (quality) => {
      if (
        quality === "excellent" ||
        quality === "good" ||
        quality === "poor" ||
        quality === "reconnecting"
      ) {
        setNetworkQuality(quality);
      }
    });
    const unsubData = mediaAdapter.on("dataMessageReceived", (rawPayload) => {
      if (typeof rawPayload !== "string") return;
      try {
        const parsed = JSON.parse(rawPayload) as {
          type?: string;
          id?: string;
          senderName?: string;
          senderRole?: string;
          text?: string;
          sentAtUtc?: string;
          recordingSessionId?: string;
        };
        if (parsed.type === "chat" && parsed.text) {
          const incoming: ThreadMessage = {
            id: parsed.id || `dc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            seq: Date.now(),
            conversationId: session?.callId || "teleconsult-conv",
            senderType: parsed.senderRole === "Clinician" ? "Staff" : "Patient",
            senderId: parsed.senderRole === "Clinician" ? "clinician-remote" : "patient-remote",
            senderDisplayName: parsed.senderName || `${clinicName} Attending Clinician`,
            contentText: parsed.text,
            clientSentAtUtc: parsed.sentAtUtc || new Date().toISOString(),
            state: "Received",
            visibility: "Public",
            requiresAcknowledgement: false,
          };
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
          );
          if (!isChatOpenRef.current) {
            setUnreadChatCount((c) => c + 1);
          }
        } else if (parsed.type === "recording_consent_requested") {
          setPendingConsentSessionId(parsed.recordingSessionId || "pending");
          setRecordingConsent("Pending");
        }
      } catch {
        // Ignore non-JSON data channel packets
      }
    });

    return () => {
      unsubSub();
      unsubUnsub();
      unsubLocal();
      unsubConn();
      unsubDisc();
      unsubQuality();
      unsubData();
    };
  }, [mediaAdapter, session?.callId, clinicName]);

  // Picture-in-Picture & Video Element references
  const [isPipSupported, setIsPipSupported] = useState(false);
  const [isPipActive, setIsPipActive] = useState(false);
  const [videoOrientation, setVideoOrientation] = useState<"portrait" | "landscape">("portrait");
  const remoteVideoElRef = useRef<HTMLVideoElement | null>(null);
  const localVideoElRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (typeof document !== "undefined") {
      setIsPipSupported(Boolean(document.pictureInPictureEnabled));
    }
  }, []);

  useEffect(() => {
    const videoEl = remoteVideoElRef.current || localVideoElRef.current;
    if (!videoEl) return;

    const handleEnterPip = () => setIsPipActive(true);
    const handleLeavePip = () => setIsPipActive(false);

    videoEl.addEventListener("enterpictureinpicture", handleEnterPip);
    videoEl.addEventListener("leavepictureinpicture", handleLeavePip);

    return () => {
      videoEl.removeEventListener("enterpictureinpicture", handleEnterPip);
      videoEl.removeEventListener("leavepictureinpicture", handleLeavePip);
    };
  }, [remoteVideoTrack, localVideoTrack]);

  const handleTogglePip = useCallback(async () => {
    if (typeof document === "undefined") return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setIsPipActive(false);
      } else {
        const targetVideo = remoteVideoElRef.current || localVideoElRef.current;
        if (targetVideo && typeof targetVideo.requestPictureInPicture === "function") {
          await targetVideo.requestPictureInPicture();
          setIsPipActive(true);
        }
      }
    } catch (err) {
      console.warn("Failed to toggle Picture-in-Picture:", err);
    }
  }, []);

  const handleToggleOrientation = useCallback(() => {
    setVideoOrientation((prev) => (prev === "portrait" ? "landscape" : "portrait"));
  }, []);

  // useCallSession integration
  const callSession = useCallSession(session?.callId || "call-guest", {
    participantName: userRole === "Clinician" ? "Attending Clinician" : "Guest Patient",
    participantIdentity: session?.guestToken ? `guest-${session.callId}` : "guest-patient",
    isDoctor: userRole === "Clinician",
    roomName: session?.roomName,
    mediaAdapter,
    initialPaymentState: {
      policy: paymentPolicy,
      status: paymentStatus,
      isYakapExempt: isYakapExempt,
      canAdmit: true,
    },
    onJoinCall: async () => {
      if (session) {
        return {
          liveKitToken: session.guestToken,
          roomName: session.roomName,
          wsUrl: session.relayUrl,
          participantIdentity: `guest-${session.callId}`,
        };
      }
    },
    onEndCall: async () => {
      setStage("ended");
    },
  });

  // Automatically initiate call media connection upon entering in_call stage
  useEffect(() => {
    if (stage === "in_call" && session?.guestToken) {
      callSession.joinCall?.();
    }
  }, [stage, session?.guestToken]);

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
    const newId = `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const sentAtUtc = new Date().toISOString();
    const senderName = userRole === "Clinician" ? "Attending Clinician" : "Guest Patient";
    const newMsg: ThreadMessage = {
      id: newId,
      seq: messages.length + 1,
      conversationId: session?.callId || "teleconsult-conv",
      senderType: userRole === "Clinician" ? "Staff" : "Patient",
      senderId: "patient-guest-id",
      senderDisplayName: userRole === "Clinician" ? "Attending Clinician" : "You (Guest)",
      contentText: text,
      clientSentAtUtc: sentAtUtc,
      state: "Sending",
      visibility: isInternal ? "Internal" : "Public",
      requiresAcknowledgement: false,
    };

    setMessages((prev) => [...prev, newMsg]);

    if (!isInternal && mediaAdapter?.sendDataMessage) {
      try {
        await mediaAdapter.sendDataMessage(
          JSON.stringify({
            type: "chat",
            id: newId,
            senderName,
            senderRole: userRole === "Clinician" ? "Clinician" : "Patient",
            text,
            sentAtUtc,
          })
        );
        setMessages((prev) =>
          prev.map((m) => (m.id === newId ? { ...m, state: "Received" } : m))
        );
        return;
      } catch {
        // Fall through to status transition if DataChannel is temporarily offline
      }
    }

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

  const handleRespondRecordingConsent = async (approved: boolean): Promise<void> => {
    const consentSessionId = pendingConsentSessionId;
    setRecordingConsent(approved ? "Approved" : "Rejected");
    setPendingConsentSessionId(null);
    if (mediaAdapter?.sendDataMessage) {
      try {
        await mediaAdapter.sendDataMessage(
          JSON.stringify({
            type: "recording_consent_response",
            recordingSessionId: consentSessionId,
            approved,
          })
        );
      } catch {
        // Best-effort DataChannel signal
      }
    }
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

  // State 1: Verification Form (GuestJoinPage directly targeting portal-api)
  if (stage === "verify") {
    return (
      <GuestJoinPage
        inviteToken={inviteToken}
        apiBaseUrl={getPortalApiUrl()}
        clinicName={clinicName}
        clinicLogoUrl={clinicLogoUrl}
        clinicSupportPhone={clinicSupportPhone}
        mockVerificationHandler={mockVerificationHandler ? handleMockVerification : undefined}
        onSessionVerified={(verified) => {
          setSession(verified);
          setStage("waiting_room");
        }}
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
        {/* Invisible remote audio track player */}
        <WebAudioTrackView track={remoteAudioTrack} />

        {/* Navigation & Status Header with Plain Copy */}
        <header
          className="flex items-center justify-between px-4 py-3 bg-card border-b border-border shadow-sm"
          style={{ boxShadow: guestShadows.sm }}
        >
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
            <div>
              <h1 className="text-sm font-bold text-foreground">
                {clinicName} Teleconsultation
              </h1>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <span>Room: <span className="font-mono">{session?.roomName || "Consultation Room"}</span></span>
                <span>•</span>
                <span>Private Consultation Room</span>
                <span className="sr-only">End-to-End Encrypted</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
              <Lock className="w-3.5 h-3.5" />
              <span>Private Video Consultation</span>
              <span className="sr-only">End-to-End Encrypted</span>
            </div>

            <button
              type="button"
              onClick={() => setIsChatOpen((prev) => !prev)}
              className={`min-h-[44px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all cursor-pointer ${
                isChatOpen
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted text-foreground border-border hover:bg-muted/80"
              }`}
              style={{
                boxShadow: isChatOpen ? guestShadows.brandSm : guestShadows.brandSubtle,
              }}
              aria-label="Toggle consultation chat"
            >
              <MessageSquare className="w-4 h-4" />
              <span>In-Call Chat</span>
              <span className="px-1.5 py-0.5 rounded-full bg-background/20 text-[10px] font-bold">
                {unreadChatCount > 0 ? unreadChatCount : messages.length}
              </span>
            </button>

            <button
              type="button"
              onClick={async () => {
                await callSession.endCall?.();
                setStage("ended");
              }}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              style={{ boxShadow: guestShadows.dangerSm }}
              aria-label="Leave teleconsultation"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Leave</span>
            </button>
          </div>
        </header>

        {pendingConsentSessionId && (
          <div
            data-testid="banner-patient-recording-consent"
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-muted border-b border-border text-xs"
            style={{ boxShadow: guestShadows.sm }}
          >
            <span className="font-semibold text-foreground">
              The clinician has requested to record this consultation. Do you consent?
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRespondRecordingConsent(false)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-card border border-border text-foreground font-semibold hover:bg-muted/80 transition-all cursor-pointer"
                style={{ boxShadow: guestShadows.brandSubtle }}
              >
                Decline
              </button>
              <button
                type="button"
                onClick={() => void handleRespondRecordingConsent(true)}
                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold hover:opacity-95 transition-all cursor-pointer"
                style={{ boxShadow: guestShadows.brandSm }}
              >
                Approve Recording
              </button>
            </div>
          </div>
        )}

        {/* Call Workspace Grid */}
        <div className="flex-1 flex overflow-hidden">
          {/* Main Video View Area Rendering Comms SDK CallStage */}
          <div className="flex-1 relative flex flex-col">
            <CallStage
              callId={session?.callId || "call-guest"}
              roomName={session?.roomName || "Consultation Room"}
              userRole={userRole === "Clinician" ? "Clinician" : "Guest"}
              participantName={`${clinicName} Attending Clinician`}
              selfName="You (Guest)"
              hideHeader={true}
              remoteStatusLabel="Clinician Video Feed Active"
              networkQuality={networkQuality}
              isMicEnabled={callSession.mediaTracks.isMicEnabled}
              isCameraEnabled={callSession.mediaTracks.isCameraEnabled}
              isScreenSharing={callSession.mediaTracks.isScreenSharing}
              onToggleMic={callSession.mediaTracks.toggleMic}
              onToggleCamera={callSession.mediaTracks.toggleCamera}
              onToggleScreenShare={callSession.mediaTracks.toggleScreenShare}
              isChatOpen={isChatOpen}
              unreadChatCount={unreadChatCount}
              onToggleChat={() => setIsChatOpen((prev) => !prev)}
              onEndCall={async () => {
                await callSession.endCall?.();
                setStage("ended");
              }}
              videoOrientation={videoOrientation}
              onToggleOrientation={handleToggleOrientation}
              isPipSupported={isPipSupported}
              isPipActive={isPipActive}
              onTogglePip={handleTogglePip}
              renderCustomVideoSurface={(type) => {
                if (type === "remote") {
                  const isRemoteScreenShare = Boolean(
                    (remoteVideoTrack as { source?: string } | null)?.source === "screen_share"
                  );
                  return remoteVideoTrack ? (
                    <div className="w-full h-full relative">
                      <span className="sr-only">Clinician Video Feed Active</span>
                      <WebVideoTrackView
                        track={remoteVideoTrack}
                        className={isRemoteScreenShare ? "w-full h-full object-contain" : "w-full h-full object-cover"}
                        onVideoElement={(el) => {
                          remoteVideoElRef.current = el;
                        }}
                      />
                    </div>
                  ) : null;
                }
                if (type === "local") {
                  const isLocalScreen = callSession.mediaTracks.isScreenSharing;
                  return localVideoTrack ? (
                    <WebVideoTrackView
                      track={localVideoTrack}
                      muted
                      mirror={!isLocalScreen}
                      className={isLocalScreen ? "w-full h-full object-contain" : "w-full h-full object-cover"}
                      onVideoElement={(el) => {
                        localVideoElRef.current = el;
                      }}
                    />
                  ) : null;
                }
                return null;
              }}
              className="flex-1"
            />
          </div>

          {/* In-Call Chat Drawer (MessageThread) */}
          {isChatOpen && (
            <aside
              className="w-80 sm:w-96 border-l border-border bg-card flex flex-col h-full shadow-xl"
              style={{ boxShadow: guestShadows.lg }}
            >
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
      <div
        className="w-full max-w-md p-8 rounded-3xl bg-card border border-border text-center shadow-lg space-y-4"
        style={{ boxShadow: guestShadows.lg }}
      >
        <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Check className="w-8 h-8" />
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
            style={{ boxShadow: guestShadows.brandSm }}
          >
            Return to Teleconsultation Portal
          </button>
        </div>
      </div>
    </main>
  );
}
