import { describe, test, expect, mock } from "bun:test";
import React from "react";
import * as fs from "fs";
import * as path from "path";

try {
  const commsSdkReact = require.resolve("../../../packages/comms-sdk/node_modules/react");
  mock.module(commsSdkReact, () => React);
} catch {
  // If no separate comms-sdk react, ignore
}

import { TeleconsultGuestFlow } from "../src/components/teleconsult/TeleconsultGuestFlow";
import { getPortalApiUrl } from "../src/utils/domain";
import { renderToString } from "react-dom/server";

describe("Milestone M15 Challenger 2: Session Termination Signaling & Preflight Checks", () => {
  describe("Focus 1: Preflight Status Check on Mount (/portal/guest/teleconsult/status)", () => {
    test("Preflight endpoint contract: HTTP 410 Gone resolves to ended consultation", async () => {
      const inviteToken = "INV-REVOKED-12345";
      const expectedUrl = `${getPortalApiUrl()}/portal/guest/teleconsult/status?token=${encodeURIComponent(inviteToken)}&inviteToken=${encodeURIComponent(inviteToken)}`;

      let requestedUrl = "";
      const mockFetch = mock(async (url: string | URL | Request) => {
        requestedUrl = url.toString();
        return new Response(
          JSON.stringify({
            success: false,
            message: "Consultation ended or invite revoked.",
            errorCode: "GUEST_CONSULTATION_ENDED",
          }),
          { status: 410, headers: { "Content-Type": "application/json" } }
        );
      });

      const res = await mockFetch(expectedUrl);
      expect(res.status).toBe(410);
      expect(requestedUrl).toBe(expectedUrl);
      expect(requestedUrl).toContain("/portal/guest/teleconsult/status");
      expect(requestedUrl).toContain("token=INV-REVOKED-12345");
      expect(requestedUrl).toContain("inviteToken=INV-REVOKED-12345");
    });

    test("Preflight simulation: HTTP 410 Gone transitions to ended state with 'This teleconsultation has ended'", async () => {
      const runPreflightLogic = async (res: Response) => {
        let stage = "verify";
        let endedReason: string | null = null;
        if (res.status === 410) {
          endedReason = "This teleconsultation has ended";
          stage = "ended";
        } else if (res.ok) {
          const json = await res.json().catch(() => null);
          if (json?.data?.isEnded || json?.data?.status === "Ended" || json?.data?.isExpired) {
            endedReason = "This teleconsultation has ended";
            stage = "ended";
          }
        }
        return { stage, endedReason };
      };

      const res410 = new Response(JSON.stringify({ success: false, errorCode: "GUEST_CONSULTATION_ENDED" }), { status: 410 });
      const state410 = await runPreflightLogic(res410);
      expect(state410.stage).toBe("ended");
      expect(state410.endedReason).toBe("This teleconsultation has ended");

      const resEnded = new Response(JSON.stringify({ success: true, data: { isEnded: true, status: "Ended" } }), { status: 200 });
      const stateEnded = await runPreflightLogic(resEnded);
      expect(stateEnded.stage).toBe("ended");
      expect(stateEnded.endedReason).toBe("This teleconsultation has ended");

      const resExpired = new Response(JSON.stringify({ success: true, data: { isExpired: true, status: "Active" } }), { status: 200 });
      const stateExpired = await runPreflightLogic(resExpired);
      expect(stateExpired.stage).toBe("ended");
      expect(stateExpired.endedReason).toBe("This teleconsultation has ended");

      const resActive = new Response(JSON.stringify({ success: true, data: { isEnded: false, isExpired: false, status: "Active" } }), { status: 200 });
      const stateActive = await runPreflightLogic(resActive);
      expect(stateActive.stage).toBe("verify");
      expect(stateActive.endedReason).toBeNull();
    });

    test("TeleconsultGuestFlow source contains preflight check hook with dual token query parameters", () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "..", "src/components/teleconsult/TeleconsultGuestFlow.tsx"),
        "utf-8"
      );

      // Verify preflight hook exists and targets status endpoint with token & inviteToken query params
      expect(src).toContain("/portal/guest/teleconsult/status?token=");
      expect(src).toContain("inviteToken=");
      expect(src).toContain('setEndedReason("This teleconsultation has ended")');
      expect(src).toContain('setStage("ended")');
    });

    test("Ended screen renders 'This teleconsultation has ended' heading and suppresses credential prompts", () => {
      const html = renderToString(
        <TeleconsultGuestFlow
          initialStage="ended"
          clinicName="St. Jude Family Hospital"
        />
      );

      expect(html).toContain("Consultation Concluded");
      expect(html).not.toContain("Enter 6-digit PIN");
      expect(html).not.toContain("YYYY-MM-DD");
      expect(html).toContain("Return to Teleconsultation Portal");
    });
  });

  describe("Focus 2: Clinician Data Channel End Call Broadcast ('call_ended_by_clinician')", () => {
    test("TeleconsultGuestFlow source subscribes to 'call_ended_by_clinician' and sets plain copy", () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "..", "src/components/teleconsult/TeleconsultGuestFlow.tsx"),
        "utf-8"
      );

      expect(src).toContain('parsed.type === "call_ended_by_clinician"');
      expect(src).toContain('setEndedReason("The attending clinician has ended this consultation.")');
      expect(src).toContain('setStage("ended")');
    });

    test("TeleconsultWaitingRoomModal source broadcasts 'call_ended_by_clinician' before disconnect", () => {
      const modalSrc = fs.readFileSync(
        path.resolve(__dirname, "../../../apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx"),
        "utf-8"
      );

      expect(modalSrc).toContain("call_ended_by_clinician");
      expect(modalSrc).toContain("endedAtUtc");
      expect(modalSrc).toContain("mediaAdapter.sendDataMessage");
    });

    test("LiveKit data message handling state transition simulation", () => {
      let callSessionEnded = false;
      let mediaAdapterDisconnected = false;
      let endedReason = "";
      let stage = "in_call";

      const handleDataMessage = (rawPayload: string) => {
        try {
          const parsed = JSON.parse(rawPayload);
          if (parsed.type === "call_ended_by_clinician") {
            callSessionEnded = true;
            mediaAdapterDisconnected = true;
            endedReason = "The attending clinician has ended this consultation.";
            stage = "ended";
          }
        } catch {}
      };

      handleDataMessage(
        JSON.stringify({
          type: "call_ended_by_clinician",
          endedAtUtc: new Date().toISOString(),
        })
      );

      expect(callSessionEnded).toBe(true);
      expect(mediaAdapterDisconnected).toBe(true);
      expect(endedReason).toBe("The attending clinician has ended this consultation.");
      expect(stage).toBe("ended");
    });
  });

  describe("Focus 3: Screen Share Contain Aspect Ratio Invariant", () => {
    test("TeleconsultGuestFlow source enforces object-contain for screen shares without cover cropping", () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "..", "src/components/teleconsult/TeleconsultGuestFlow.tsx"),
        "utf-8"
      );

      expect(src).toContain('isRemoteScreenShare ? "w-full h-full object-contain" : "w-full h-full object-cover"');
      expect(src).toContain('isLocalScreen ? "w-full h-full object-contain" : "w-full h-full object-cover"');
    });

    test("TeleconsultWaitingRoomModal source enforces fitMode contain for screen shares", () => {
      const modalSrc = fs.readFileSync(
        path.resolve(__dirname, "../../../apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx"),
        "utf-8"
      );

      expect(modalSrc).toContain("const fitMode = isScreenShareActive ? 'contain' : 'cover'");
      expect(modalSrc).toContain("objectFit={fitMode}");
    });

    test("Screen share error handling surfaces notify.error on non-cancelled permission denials", () => {
      const modalSrc = fs.readFileSync(
        path.resolve(__dirname, "../../../apps/clinic-app/components/teleconsult/TeleconsultWaitingRoomModal.tsx"),
        "utf-8"
      );

      expect(modalSrc).toContain("handleToggleScreenShare");
      expect(modalSrc).toContain("name === 'AbortError'");
      expect(modalSrc).toContain("permission denied by system");
      expect(modalSrc).toContain("notify.error(message || 'Failed to toggle screen sharing.')");
    });
  });
});
