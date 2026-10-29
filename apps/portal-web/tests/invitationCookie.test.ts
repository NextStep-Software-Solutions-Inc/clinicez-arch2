import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import {
  PENDING_INVITATION_COOKIE_NAME,
  serializePendingInvitation,
  parsePendingInvitation,
  setPendingInvitationCookie,
  getPendingInvitationCookie,
  clearPendingInvitationCookie,
  type PendingInvitationCookiePayload,
} from "../src/lib/invitationCookie";

describe("Pending Invitation Cookie Utility (invitationCookie.ts)", () => {
  describe("serializePendingInvitation", () => {
    test("serializes valid workspace payload to JSON string", () => {
      const payload: PendingInvitationCookiePayload = {
        type: "workspace",
        token: "tok_workspace_12345",
      };
      const serialized = serializePendingInvitation(payload);
      expect(JSON.parse(serialized)).toEqual({
        type: "workspace",
        token: "tok_workspace_12345",
      });
    });

    test("serializes valid workspace payload and trims whitespace in token", () => {
      const payload: PendingInvitationCookiePayload = {
        type: "workspace",
        token: "  tok_workspace_67890  ",
      };
      const serialized = serializePendingInvitation(payload);
      expect(JSON.parse(serialized)).toEqual({
        type: "workspace",
        token: "tok_workspace_67890",
      });
    });
  });

  describe("parsePendingInvitation", () => {
    test("parses plain JSON string", () => {
      const raw = JSON.stringify({ type: "workspace", token: "abc-123" });
      const parsed = parsePendingInvitation(raw);
      expect(parsed).toEqual({ type: "workspace", token: "abc-123" });
    });

    test("parses URI-encoded JSON string", () => {
      const raw = encodeURIComponent(JSON.stringify({ type: "workspace", token: "workspace-token-xyz" }));
      const parsed = parsePendingInvitation(raw);
      expect(parsed).toEqual({ type: "workspace", token: "workspace-token-xyz" });
    });

    test("returns null for null, undefined, or empty/whitespace string", () => {
      expect(parsePendingInvitation(null)).toBeNull();
      expect(parsePendingInvitation(undefined)).toBeNull();
      expect(parsePendingInvitation("")).toBeNull();
      expect(parsePendingInvitation("   ")).toBeNull();
    });

    test("returns null for invalid or corrupted JSON", () => {
      expect(parsePendingInvitation("not-json-at-all")).toBeNull();
      expect(parsePendingInvitation("{type: workspace, token:}")).toBeNull();
    });

    test("returns null for unsupported type values including admin", () => {
      expect(parsePendingInvitation(JSON.stringify({ type: "admin", token: "abc" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "superadmin", token: "abc" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "member", token: "abc" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: 123, token: "abc" }))).toBeNull();
    });

    test("returns null for missing, empty, or whitespace-only token", () => {
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: "" }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: "   " }))).toBeNull();
      expect(parsePendingInvitation(JSON.stringify({ type: "workspace", token: null }))).toBeNull();
    });

    test("returns trimmed token when valid token has surrounding whitespace", () => {
      const raw = JSON.stringify({ type: "workspace", token: "  tok_padded  " });
      const parsed = parsePendingInvitation(raw);
      expect(parsed).toEqual({ type: "workspace", token: "tok_padded" });
    });
  });

  describe("Browser Document Cookie Interactions", () => {
    let originalDocument: any;

    beforeEach(() => {
      originalDocument = (globalThis as any).document;
    });

    afterEach(() => {
      (globalThis as any).document = originalDocument;
    });

    test("safely no-ops in non-browser environments when document is undefined", () => {
      delete (globalThis as any).document;
      expect(() => setPendingInvitationCookie({ type: "workspace", token: "tok" })).not.toThrow();
      expect(getPendingInvitationCookie()).toBeNull();
      expect(() => clearPendingInvitationCookie()).not.toThrow();
    });

    test("sets, reads, and clears pending invitation cookie in mock browser environment", () => {
      let cookieStore = "";
      (globalThis as any).document = {
        get cookie() {
          return cookieStore;
        },
        set cookie(val: string) {
          const [pair] = val.split(";");
          const [k] = pair.split("=");
          if (val.includes("Max-Age=0") || val.includes("Expires=Thu, 01 Jan 1970")) {
            // Remove cookie
            const entries = cookieStore.split("; ").filter((entry) => !entry.startsWith(`${k.trim()}=`));
            cookieStore = entries.join("; ");
          } else {
            // Upsert cookie
            const entries = cookieStore.split("; ").filter((entry) => entry && !entry.startsWith(`${k.trim()}=`));
            entries.push(pair.trim());
            cookieStore = entries.join("; ");
          }
        },
      };

      expect(getPendingInvitationCookie()).toBeNull();

      // 1. Set cookie
      setPendingInvitationCookie({ type: "workspace", token: "tok_session_99" });
      expect(cookieStore).toContain(PENDING_INVITATION_COOKIE_NAME);

      // 2. Read cookie
      const retrieved = getPendingInvitationCookie();
      expect(retrieved).toEqual({ type: "workspace", token: "tok_session_99" });

      // 3. Clear cookie
      clearPendingInvitationCookie();
      expect(getPendingInvitationCookie()).toBeNull();
    });
  });
});
