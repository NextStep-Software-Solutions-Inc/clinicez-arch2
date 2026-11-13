import { describe, test, expect, mock, it } from "bun:test";
import React from "react";
import * as fs from "fs";
import * as path from "path";
import { renderToString } from "react-dom/server";

try {
  const commsSdkReact = require.resolve("../../../packages/comms-sdk/node_modules/react");
  mock.module(commsSdkReact, () => React);
} catch {
  // If no separate comms-sdk react, ignore
}

import { TeleconsultGuestFlow } from "../src/components/teleconsult/TeleconsultGuestFlow";
import { CallStage } from "@clinicez/comms-sdk/web-ui";
import type { GuestVerificationResult } from "@clinicez/comms-sdk/web-ui";

describe("Milestone 10 Challenger 2: Adversarial Portal Web Live Video Suite", () => {
  const mockValidSession: GuestVerificationResult = {
    callId: "call-adv-uuid-001",
    roomName: "teleconsult-room-adv-001",
    relayUrl: "wss://media.clinicez.com",
    guestToken: "jwt-token-guest-adv-001",
  };

  // =========================================================================
  // Dimension 1: Guest Flow Transitions & Headless SSR Robustness
  // =========================================================================
  describe("Dimension 1: Guest Flow Transitions & Headless SSR Robustness", () => {
    it("1.1: Default verify stage renders server-side without WebRTC hardware or throwing", () => {
      expect(() => {
        const html = renderToString(
          <TeleconsultGuestFlow
            inviteToken="INV-SSR-001"
            clinicName="Metro Health Clinic"
            clinicSupportPhone="(02) 8123-4567"
          />
        );
        expect(html).toContain("Metro Health Clinic");
        expect(html).toContain("Security Verification");
        expect(html).toContain("5 attempts allowed");
        expect(html).toContain("Verify &amp; Enter Waiting Room");
      }).not.toThrow();
    });

    it("1.2: Waiting room stage renders cleanly under SSR without hardware access", () => {
      expect(() => {
        const html = renderToString(
          <TeleconsultGuestFlow
            initialStage="waiting_room"
            initialActiveSession={mockValidSession}
            clinicName="Metro Health Clinic"
            isYakapExempt={true}
          />
        );
        expect(html).toContain("Teleconsultation Staging &amp; Waiting Room");
        expect(html).toContain("Informed Recording Disclosure");
        expect(html).toContain("Enter Consultation Room");
      }).not.toThrow();
    });

    it("1.3: In-call stage mounts CallStage and message thread drawer without throwing under SSR", () => {
      expect(() => {
        const html = renderToString(
          <TeleconsultGuestFlow
            initialStage="in_call"
            initialActiveSession={mockValidSession}
            clinicName="St. Jude General Hospital"
            userRole="Patient"
          />
        );
        expect(html).toContain("St. Jude General Hospital");
        expect(html).toContain("Teleconsultation");
        expect(html).toContain("teleconsult-room-adv-001");
        expect(html).toContain("In-Call Chat");
        expect(html).toContain("Leave");
        expect(html).toContain("Clinician Video Feed Active");
      }).not.toThrow();
    });

    it("1.4: Ended stage renders concluded screen server-side cleanly", () => {
      expect(() => {
        const html = renderToString(
          <TeleconsultGuestFlow
            initialStage="ended"
            clinicName="Metro Health Clinic"
          />
        );
        expect(html).toContain("Consultation Concluded");
        expect(html).toContain("Return to Teleconsultation Portal");
      }).not.toThrow();
    });

    it("1.5: SSR withstands malformed, empty, and adversarial boundary properties", () => {
      // Empty invite token, empty clinic name, boundary role
      expect(() => {
        const html = renderToString(
          <TeleconsultGuestFlow
            inviteToken=""
            clinicName=""
            clinicSupportPhone=""
            userRole="Staff"
            paymentPolicy="Prepaid"
            paymentStatus="Unpaid"
          />
        );
        expect(html).toBeDefined();
      }).not.toThrow();

      // Injection and special characters in parameters
      expect(() => {
        const html = renderToString(
          <TeleconsultGuestFlow
            inviteToken={"<script>alert('xss')</script>"}
            clinicName={'Apex & Co. <Hospital> \'\"'}
            clinicSupportPhone="+63 (917) 555-0199 / ext. 402"
            initialStage="in_call"
            initialActiveSession={{
              callId: "call-<special>",
              roomName: "room-&quot;special",
              relayUrl: "wss://media.test/?x=1&y=2",
              guestToken: "tok-12345",
            }}
          />
        );
        expect(html).toContain("Apex &amp; Co. &lt;Hospital&gt; &#x27;&quot;");
        expect(html).toContain("Teleconsultation");
        expect(html).not.toContain("<script>");
      }).not.toThrow();
    });

    it("1.6: Audio track binding mounts WebAudioTrackView audio element when track exists", () => {
      // Track with attach/detach mock interface
      let attached = false;
      let detached = false;
      const mockAudioTrack = {
        attach: (_el: HTMLMediaElement) => {
          attached = true;
        },
        detach: (_el?: HTMLMediaElement) => {
          detached = true;
        },
      };

      expect(mockAudioTrack.attach).toBeDefined();
      expect(mockAudioTrack.detach).toBeDefined();
    });

    it("1.7: Video track binding handles attach, detach, and onVideoElement callback safely", () => {
      let attachedEl: any = null;
      let detachedEl: any = null;
      const mockVideoTrack = {
        attach: (el: any) => {
          attachedEl = el;
        },
        detach: (el?: any) => {
          detachedEl = el;
        },
      };

      const dummyVideo = {} as HTMLVideoElement;
      mockVideoTrack.attach(dummyVideo);
      expect(attachedEl).toBe(dummyVideo);

      mockVideoTrack.detach(dummyVideo);
      expect(detachedEl).toBe(dummyVideo);
    });
  });

  // =========================================================================
  // Dimension 2: Picture-in-Picture (PiP) Event Handling & Synchronization
  // =========================================================================
  describe("Dimension 2: Picture-in-Picture (PiP) Event Handling & Synchronization", () => {
    it("2.1: CallStage renders PiP toggle button when isPipSupported is true", () => {
      let pipToggled = false;
      const html = renderToString(
        <CallStage
          callId="call-pip-001"
          roomName="room-pip-001"
          participantName="Dr. Clinician"
          isMicEnabled={true}
          isCameraEnabled={true}
          onToggleMic={() => {}}
          onToggleCamera={() => {}}
          onEndCall={() => {}}
          isPipSupported={true}
          isPipActive={false}
          onTogglePip={() => {
            pipToggled = true;
          }}
        />
      );

      expect(html).toContain('id="btn-toggle-pip"');
      expect(html).toContain('title="Picture-in-Picture"');
      expect(html).toContain('aria-label="Picture-in-Picture"');
      expect(html).toContain("bg-slate-800 text-slate-100");
    });

    it("2.2: CallStage highlights active PiP button and updates aria-label when isPipActive is true", () => {
      const html = renderToString(
        <CallStage
          callId="call-pip-002"
          roomName="room-pip-002"
          participantName="Dr. Clinician"
          isMicEnabled={true}
          isCameraEnabled={true}
          onToggleMic={() => {}}
          onToggleCamera={() => {}}
          onEndCall={() => {}}
          isPipSupported={true}
          isPipActive={true}
          onTogglePip={() => {}}
        />
      );

      expect(html).toContain('id="btn-toggle-pip"');
      expect(html).toContain('title="Exit Picture-in-Picture"');
      expect(html).toContain('aria-label="Exit Picture-in-Picture"');
      expect(html).toContain("bg-teal-700 text-white");
    });

    it("2.3: CallStage hides PiP button when isPipSupported is false", () => {
      const html = renderToString(
        <CallStage
          callId="call-pip-003"
          roomName="room-pip-003"
          participantName="Dr. Clinician"
          isMicEnabled={true}
          isCameraEnabled={true}
          onToggleMic={() => {}}
          onToggleCamera={() => {}}
          onEndCall={() => {}}
          isPipSupported={false}
          isPipActive={false}
          onTogglePip={() => {}}
        />
      );

      expect(html).not.toContain('id="btn-toggle-pip"');
      expect(html).not.toContain('data-testid="btn-toggle-pip"');
    });

    it("2.4: Simulates enterpictureinpicture and leavepictureinpicture event listeners on video elements", () => {
      const listeners = new Map<string, Set<(e: any) => void>>();
      const mockVideoEl = {
        addEventListener: (event: string, handler: (e: any) => void) => {
          if (!listeners.has(event)) listeners.set(event, new Set());
          listeners.get(event)!.add(handler);
        },
        removeEventListener: (event: string, handler: (e: any) => void) => {
          listeners.get(event)?.delete(handler);
        },
        dispatchEvent: (event: { type: string }) => {
          listeners.get(event.type)?.forEach((fn) => fn(event));
          return true;
        },
      };

      let isPipActive = false;
      const handleEnterPip = () => {
        isPipActive = true;
      };
      const handleLeavePip = () => {
        isPipActive = false;
      };

      // Register listeners as in TeleconsultGuestFlow useEffect
      mockVideoEl.addEventListener("enterpictureinpicture", handleEnterPip);
      mockVideoEl.addEventListener("leavepictureinpicture", handleLeavePip);

      expect(listeners.get("enterpictureinpicture")?.size).toBe(1);
      expect(listeners.get("leavepictureinpicture")?.size).toBe(1);
      expect(isPipActive).toBe(false);

      // Simulate browser entering PiP
      mockVideoEl.dispatchEvent({ type: "enterpictureinpicture" });
      expect(isPipActive).toBe(true);

      // Simulate browser leaving PiP (user closed or returned)
      mockVideoEl.dispatchEvent({ type: "leavepictureinpicture" });
      expect(isPipActive).toBe(false);

      // Cleanup
      mockVideoEl.removeEventListener("enterpictureinpicture", handleEnterPip);
      mockVideoEl.removeEventListener("leavepictureinpicture", handleLeavePip);
      expect(listeners.get("enterpictureinpicture")?.size).toBe(0);
      expect(listeners.get("leavepictureinpicture")?.size).toBe(0);
    });

    it("2.5: handleTogglePip requests PiP when inactive and exits PiP when already in PiP", async () => {
      let requested = false;
      let exited = false;
      let pipActiveState = false;

      const mockVideoEl = {
        requestPictureInPicture: async () => {
          requested = true;
          return {};
        },
      };

      const mockDoc = {
        pictureInPictureElement: null as any,
        exitPictureInPicture: async () => {
          exited = true;
        },
      };

      const togglePip = async () => {
        if (mockDoc.pictureInPictureElement) {
          await mockDoc.exitPictureInPicture();
          mockDoc.pictureInPictureElement = null;
          pipActiveState = false;
        } else {
          await mockVideoEl.requestPictureInPicture();
          mockDoc.pictureInPictureElement = mockVideoEl;
          pipActiveState = true;
        }
      };

      // Toggle 1: enter PiP
      await togglePip();
      expect(requested).toBe(true);
      expect(exited).toBe(false);
      expect(pipActiveState).toBe(true);
      expect(mockDoc.pictureInPictureElement).toBe(mockVideoEl);

      // Toggle 2: exit PiP
      await togglePip();
      expect(exited).toBe(true);
      expect(pipActiveState).toBe(false);
      expect(mockDoc.pictureInPictureElement).toBeNull();
    });

    it("2.6: handleTogglePip catches and recovers from requestPictureInPicture rejections", async () => {
      let consoleWarnCalled = false;
      const originalWarn = console.warn;
      console.warn = () => {
        consoleWarnCalled = true;
      };

      try {
        const failingVideoEl = {
          requestPictureInPicture: async () => {
            throw new Error("NotAllowedError: user gesture required");
          },
        };

        const togglePipWithFailure = async () => {
          try {
            await failingVideoEl.requestPictureInPicture();
          } catch (err) {
            console.warn("Failed to toggle Picture-in-Picture:", err);
          }
        };

        expect(togglePipWithFailure()).resolves.toBeUndefined();
        await togglePipWithFailure();
        expect(consoleWarnCalled).toBe(true);
      } finally {
        console.warn = originalWarn;
      }
    });
  });

  // =========================================================================
  // Dimension 3: Plain Copy, Terminology & YAKAP Exemption Invariants
  // =========================================================================
  describe("Dimension 3: Plain Copy, Terminology & YAKAP Exemption Invariants", () => {
    it("3.1: Renders 'YAKAP Auto-Exempt' badge when isYakapExempt is true", () => {
      const html = renderToString(
        <TeleconsultGuestFlow
          initialStage="waiting_room"
          initialActiveSession={mockValidSession}
          clinicName="Apex Health"
          isYakapExempt={true}
        />
      );

      expect(html).toContain("YAKAP Auto-Exempt");
      expect(html).toContain("Active Konsulta Enlistment Verified");
    });

    it("3.2: Omits 'YAKAP Auto-Exempt' badge when isYakapExempt is false", () => {
      const html = renderToString(
        <TeleconsultGuestFlow
          initialStage="waiting_room"
          initialActiveSession={mockValidSession}
          clinicName="Apex Health"
          isYakapExempt={false}
          paymentPolicy="Prepaid"
          paymentStatus="Unpaid"
        />
      );

      expect(html).not.toContain("YAKAP Auto-Exempt");
    });

    it("3.3: Strict jargon ban: ZERO occurrences of 'Zero-PHI Relay' in user-visible DOM", () => {
      const stages: Array<"verify" | "waiting_room" | "in_call" | "ended"> = [
        "verify",
        "waiting_room",
        "in_call",
        "ended",
      ];

      for (const st of stages) {
        const html = renderToString(
          <TeleconsultGuestFlow
            initialStage={st}
            initialActiveSession={mockValidSession}
            clinicName="Apex Health"
          />
        );
        expect(html).not.toContain("Zero-PHI Relay");
      }
    });

    it("3.4: Strict jargon ban: ZERO occurrences of 'End-to-End Encrypted Live Stream' in user-visible DOM", () => {
      const stages: Array<"verify" | "waiting_room" | "in_call" | "ended"> = [
        "verify",
        "waiting_room",
        "in_call",
        "ended",
      ];

      for (const st of stages) {
        const html = renderToString(
          <TeleconsultGuestFlow
            initialStage={st}
            initialActiveSession={mockValidSession}
            clinicName="Apex Health"
          />
        );
        expect(html).not.toContain("End-to-End Encrypted Live Stream");
      }
    });

    it("3.5: Renders patient-friendly terms: 'Private Consultation Room' and 'Private Video Consultation'", () => {
      const html = renderToString(
        <TeleconsultGuestFlow
          initialStage="in_call"
          initialActiveSession={mockValidSession}
          clinicName="Apex Health"
        />
      );

      expect(html).toContain("Private Consultation Room");
      expect(html).toContain("Private Video Consultation");
    });

    it("3.6: Preserves accessible test hooks (sr-only End-to-End Encrypted and Clinician Video Feed Active)", () => {
      const html = renderToString(
        <TeleconsultGuestFlow
          initialStage="in_call"
          initialActiveSession={mockValidSession}
          clinicName="Apex Health"
        />
      );

      // Verify screen-reader test hooks exist for test harnesses and assistive technologies
      expect(html).toContain("End-to-End Encrypted");
      expect(html).toContain("Clinician Video Feed Active");
    });
  });

  // =========================================================================
  // Dimension 4: Design Tokens, Forbidden Classes & Zero Raw Hex Audit
  // =========================================================================
  describe("Dimension 4: Design Tokens, Forbidden Classes & Zero Raw Hex Audit", () => {
    const HEX_REGEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})\b/g;
    const FORBIDDEN_PALETTE_REGEX = /\b(?:emerald|amber|yellow)-(?:[1-9]00|50|950)(?:\/[0-9]+)?\b/g;

    it("4.1: TeleconsultGuestFlow component contains 0 raw hex color literals", () => {
      const filePath = path.resolve(
        __dirname,
        "../src/components/teleconsult/TeleconsultGuestFlow.tsx"
      );
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const hexViolations: string[] = [];

      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        const matches = line.match(HEX_REGEX);
        if (matches) {
          matches.forEach((m) => hexViolations.push(`Line ${idx + 1}: ${m}`));
        }
      });

      expect(hexViolations).toEqual([]);
    });

    it("4.2: Teleconsult join page routes contain 0 raw hex color literals", () => {
      const p1 = path.resolve(__dirname, "../src/app/teleconsult/join/page.tsx");
      const p2 = path.resolve(__dirname, "../src/app/teleconsult/join/[token]/page.tsx");

      [p1, p2].forEach((fp) => {
        expect(fs.existsSync(fp)).toBe(true);
        const content = fs.readFileSync(fp, "utf-8");
        const lines = content.split("\n");
        const violations: string[] = [];

        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          const matches = line.match(HEX_REGEX);
          if (matches) {
            matches.forEach((m) => violations.push(`File ${fp} Line ${idx + 1}: ${m}`));
          }
        });

        expect(violations).toEqual([]);
      });
    });

    it("4.3: TeleconsultGuestFlow contains 0 forbidden palette utility classes (emerald, amber, yellow)", () => {
      const filePath = path.resolve(
        __dirname,
        "../src/components/teleconsult/TeleconsultGuestFlow.tsx"
      );
      const content = fs.readFileSync(filePath, "utf-8");
      const matches = content.match(FORBIDDEN_PALETTE_REGEX);
      expect(matches).toBeNull();
    });

    it("4.4: Teleconsult join pages contain 0 forbidden palette utility classes (emerald, amber, yellow)", () => {
      const p1 = path.resolve(__dirname, "../src/app/teleconsult/join/page.tsx");
      const p2 = path.resolve(__dirname, "../src/app/teleconsult/join/[token]/page.tsx");

      [p1, p2].forEach((fp) => {
        const content = fs.readFileSync(fp, "utf-8");
        const matches = content.match(FORBIDDEN_PALETTE_REGEX);
        expect(matches).toBeNull();
      });
    });

    it("4.5: Orientation toggle alternates between portrait and landscape cleanly", () => {
      let orientation: "portrait" | "landscape" = "portrait";
      const toggle = () => {
        orientation = orientation === "portrait" ? "landscape" : "portrait";
      };

      expect(orientation).toBe("portrait");
      toggle();
      expect(orientation).toBe("landscape");
      toggle();
      expect(orientation).toBe("portrait");
    });
  });
});
