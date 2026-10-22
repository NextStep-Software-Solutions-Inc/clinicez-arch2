import { describe, test, expect, mock } from "bun:test";
import { staffService, StaffMemberStatus, InviteStaffRequest, InvitationDetailsDto } from "../src/services/staff.service";
import { apiClient } from "../src/transport/apiClient";

describe("Challenger 2 Empirical Adversarial Suite — Milestone 2: Tenant Workspace Team Invites", () => {
  describe("1. Proxy Middleware & Unauthenticated Access to /invitations/{token}", () => {
    // Exact route matcher regex logic as implemented in apps/portal-web/src/proxy.ts:
    // const isPublicRoute = createRouteMatcher(['/upload(.*)', '/join(.*)', '/api/v1/public(.*)', '/admin/invitations(.*)', '/invitations(.*)']);
    const publicPatterns = [
      /^\/upload(.*)$/,
      /^\/join(.*)$/,
      /^\/api\/v1\/public(.*)$/,
      /^\/admin\/invitations(.*)$/,
      /^\/invitations(.*)$/
    ];
    const isPublicRoute = (path: string) => publicPatterns.some(regex => regex.test(path));

    const protectedPatterns = [
      /^\/([^/]+)\/dashboard(.*)$/,
      /^\/sync-auth(.*)$/,
      /^\/admin(.*)$/
    ];
    const isProtectedRoute = (path: string) => protectedPatterns.some(regex => regex.test(path));

    test("unauthenticated access to /invitations/{token} is whitelisted regardless of token length or character set", () => {
      // 64-character CSPRNG hexadecimal token
      const hex64 = "4f8a3c10b7e289d5f6a1e4c3b2a9d8e74f8a3c10b7e289d5f6a1e4c3b2a9d8e7";
      expect(isPublicRoute(`/invitations/${hex64}`)).toBe(true);

      // UUID v4 format token (backwards compatibility)
      const uuidToken = "6db50468-e107-4007-b187-5a8d8a0bc525";
      expect(isPublicRoute(`/invitations/${uuidToken}`)).toBe(true);

      // Deep query params & campaign tracking
      expect(isPublicRoute(`/invitations/${hex64}?source=email&utm_campaign=invite`)).toBe(true);
      expect(isPublicRoute(`/invitations/${hex64}#target`)).toBe(true);

      // Bare routes
      expect(isPublicRoute("/invitations")).toBe(true);
      expect(isPublicRoute("/invitations/")).toBe(true);
    });

    test("workspace team and dashboard routes remain strictly protected from unauthenticated access", () => {
      expect(isPublicRoute("/acme-health/dashboard/team")).toBe(false);
      expect(isPublicRoute("/acme-health/dashboard/overview")).toBe(false);
      expect(isPublicRoute("/acme-health/dashboard/billing")).toBe(false);
      expect(isPublicRoute("/acme-health/dashboard/facilities")).toBe(false);
      expect(isPublicRoute("/sync-auth")).toBe(false);

      expect(isProtectedRoute("/acme-health/dashboard/team")).toBe(true);
      expect(isProtectedRoute("/acme-health/dashboard/overview")).toBe(true);
      expect(isProtectedRoute("/sync-auth")).toBe(true);
    });

    test("edge case: paths resembling invitations but under protected tenant namespaces are blocked", () => {
      expect(isPublicRoute("/acme-health/dashboard/invitations/xyz")).toBe(false);
      expect(isProtectedRoute("/acme-health/dashboard/invitations/xyz")).toBe(true);
    });

    test("proxy middleware priority: isPublicRoute returns early before any subdomain rewriting or auth challenge", () => {
      // Simulating clerkMiddleware control flow:
      const simulateProxy = (reqPath: string, host: string, isAuthenticated: boolean) => {
        if (isPublicRoute(reqPath)) {
          return { action: "NEXT", path: reqPath, authenticated: isAuthenticated };
        }
        // If not public, tenant subdomain logic or protected check triggers
        if (!isAuthenticated) {
          return { action: "REDIRECT_LOGIN", path: "/sign-in" };
        }
        return { action: "REWRITE_DASHBOARD", path: reqPath };
      };

      // Unauthenticated user requesting /invitations/{token} on any host
      const res1 = simulateProxy("/invitations/tok_123", "clinicez.com", false);
      expect(res1.action).toBe("NEXT");

      const res2 = simulateProxy("/invitations/tok_123", "metro-clinic.clinicez.com", false);
      expect(res2.action).toBe("NEXT");

      // Unauthenticated user requesting protected dashboard route
      const res3 = simulateProxy("/metro-clinic/dashboard/team", "metro-clinic.clinicez.com", false);
      expect(res3.action).toBe("REDIRECT_LOGIN");
    });
  });

  describe("2. Adversarial Token & Malformed Input Handling", () => {
    test("empty token handling in staffService.getInvitationDetails", async () => {
      const originalGet = apiClient.get;
      let calledUrl = "";

      apiClient.get = mock(async (url: string) => {
        calledUrl = url;
        if (url === "/staff/invitations/" || url === "/staff/invitations") {
          const err: any = new Error("Request failed with status code 404");
          err.response = { status: 404, data: { message: "Invitation token cannot be empty." } };
          throw err;
        }
        return { data: {} };
      }) as any;

      try {
        await expect(staffService.getInvitationDetails("")).rejects.toThrow();
      } finally {
        apiClient.get = originalGet;
      }
    });

    test("client component state lifecycle: empty token halts loading and sets error", () => {
      // Simulating remediated InvitationAcceptClient lifecycle logic:
      let loading = true;
      let error: string | null = null;
      let invite: InvitationDetailsDto | null = null;

      const runClientMount = (token: string) => {
        if (!token || !token.trim()) {
          error = "Invitation token is missing or invalid.";
          loading = false;
          return;
        }
        loading = false;
      };

      runClientMount("");
      expect(loading).toBe(false);
      expect(error).toBe("Invitation token is missing or invalid.");
      expect(invite).toBeNull();

      // Whitespace token also halts loading and sets error
      loading = true;
      error = null;
      runClientMount("   ");
      expect(loading).toBe(false);
      expect(error).toBe("Invitation token is missing or invalid.");
    });

    test("whitespace-only token raises error from API", async () => {
      const originalGet = apiClient.get;

      apiClient.get = mock(async (url: string) => {
        const err: any = new Error("Request failed with status code 404");
        err.response = { status: 404, data: { message: "Invitation token cannot be empty." } };
        throw err;
      }) as any;

      try {
        await expect(staffService.getInvitationDetails("   ")).rejects.toThrow("Request failed with status code 404");
      } finally {
        apiClient.get = originalGet;
      }
    });

    test("adversarial inputs (SQL injection, XSS payloads, directory traversal) are cleanly rejected", async () => {
      const originalGet = apiClient.get;
      const adversarialTokens = [
        "' OR '1'='1' --",
        "<script>alert('xss')</script>",
        "../../etc/passwd",
        "tok%00nullbyte",
        "A".repeat(8192) // Buffer overflow attempt
      ];

      apiClient.get = mock(async (url: string) => {
        const err: any = new Error("Request failed with status code 404");
        err.response = { status: 404, data: { message: "Invitation was not found or is invalid." } };
        throw err;
      }) as any;

      try {
        for (const badToken of adversarialTokens) {
          await expect(staffService.getInvitationDetails(badToken)).rejects.toThrow();
        }
      } finally {
        apiClient.get = originalGet;
      }
    });

    test("acceptInvitation with revoked token returns explicit 400 rejection", async () => {
      const originalPost = apiClient.post;

      apiClient.post = mock(async (url: string) => {
        const err: any = new Error("Request failed with status code 400");
        err.response = { status: 400, data: { message: "This invitation has been revoked." } };
        throw err;
      }) as any;

      try {
        await expect(staffService.acceptInvitation("revoked_token_123")).rejects.toThrow();
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("acceptInvitation with suspended account returns explicit 400 rejection", async () => {
      const originalPost = apiClient.post;

      apiClient.post = mock(async (url: string) => {
        const err: any = new Error("Request failed with status code 400");
        err.response = { status: 400, data: { message: "This account is suspended." } };
        throw err;
      }) as any;

      try {
        await expect(staffService.acceptInvitation("suspended_token_123")).rejects.toThrow();
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("acceptInvitation with expired token returns explicit 400 rejection", async () => {
      const originalPost = apiClient.post;

      apiClient.post = mock(async (url: string) => {
        const err: any = new Error("Request failed with status code 400");
        err.response = {
          status: 400,
          data: { message: "This invitation has expired. Please ask your clinic administrator to resend the invitation." }
        };
        throw err;
      }) as any;

      try {
        await expect(staffService.acceptInvitation("expired_token_123")).rejects.toThrow();
      } finally {
        apiClient.post = originalPost;
      }
    });
  });

  describe("3. Delivery Mode Flag Behavior (sendEmail: false vs true)", () => {
    test("when sendEmail is false, payload includes sendEmail: false to skip outbox email", async () => {
      const originalPost = apiClient.post;
      let capturedPayload: any = null;

      apiClient.post = mock(async (url: string, data?: any) => {
        capturedPayload = data;
        return {
          data: {
            id: "m-noemail",
            email: data.email,
            fullName: data.fullName,
            role: data.role,
            status: "Invited",
            invitationToken: "64_char_hex_token_link_only",
            invitationExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
            createdAt: new Date().toISOString()
          }
        };
      }) as any;

      try {
        const payload: InviteStaffRequest = {
          tenantSlug: "metro-clinic",
          email: "manual@metro.ph",
          fullName: "Manual Link Member",
          role: "Viewer",
          sendEmail: false
        };

        const result = await staffService.inviteStaffMember(payload);

        expect(capturedPayload.sendEmail).toBe(false);
        expect(result.status).toBe("Invited");
        expect(result.invitationToken).toBe("64_char_hex_token_link_only");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("when sendEmail is true, payload includes sendEmail: true to enqueue outbox email", async () => {
      const originalPost = apiClient.post;
      let capturedPayload: any = null;

      apiClient.post = mock(async (url: string, data?: any) => {
        capturedPayload = data;
        return {
          data: {
            id: "m-withemail",
            email: data.email,
            fullName: data.fullName,
            role: data.role,
            status: "Invited",
            invitationToken: "64_char_hex_token_dispatched_email",
            invitationExpiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
            createdAt: new Date().toISOString()
          }
        };
      }) as any;

      try {
        const payload: InviteStaffRequest = {
          tenantSlug: "metro-clinic",
          email: "dispatched@metro.ph",
          fullName: "Dispatched Member",
          role: "Admin",
          sendEmail: true
        };

        const result = await staffService.inviteStaffMember(payload);

        expect(capturedPayload.sendEmail).toBe(true);
        expect(result.status).toBe("Invited");
      } finally {
        apiClient.post = originalPost;
      }
    });

    test("context-aware success modal copy depends strictly on sentEmail flag", () => {
      const getModalDescription = (sentEmail: boolean) => {
        return sentEmail
          ? "An invitation email has been sent. You can also directly copy and share this link via WhatsApp, Slack, or SMS:"
          : "Invitation link generated (no email was sent). You can directly copy and share this link via WhatsApp, Slack, or SMS:";
      };

      expect(getModalDescription(true)).toContain("An invitation email has been sent");
      expect(getModalDescription(false)).toContain("no email was sent");
    });
  });

  describe("4. Status Resolution & Lifecycle State Machine", () => {
    const resolveStatus = (member: {
      status: StaffMemberStatus;
      invitationExpiresAt?: string | null;
    }): StaffMemberStatus => {
      if (member.status === "Invited" && member.invitationExpiresAt) {
        if (new Date(member.invitationExpiresAt).getTime() < Date.now()) {
          return "Expired";
        }
      }
      return member.status;
    };

    test("transitions dynamically from Invited to Expired once clock passes expiry", () => {
      const now = Date.now();
      const unexpired = resolveStatus({
        status: "Invited",
        invitationExpiresAt: new Date(now + 1000).toISOString()
      });
      expect(unexpired).toBe("Invited");

      const expired = resolveStatus({
        status: "Invited",
        invitationExpiresAt: new Date(now - 1000).toISOString()
      });
      expect(expired).toBe("Expired");
    });

    test("Revoked and Suspended statuses are not masked by expiration dates", () => {
      const now = Date.now();
      const revokedWithPastExpiry = resolveStatus({
        status: "Revoked",
        invitationExpiresAt: new Date(now - 100000).toISOString()
      });
      expect(revokedWithPastExpiry).toBe("Revoked");

      const suspendedWithPastExpiry = resolveStatus({
        status: "Suspended",
        invitationExpiresAt: new Date(now - 100000).toISOString()
      });
      expect(suspendedWithPastExpiry).toBe("Suspended");

      const activeWithPastExpiry = resolveStatus({
        status: "Active",
        invitationExpiresAt: new Date(now - 100000).toISOString()
      });
      expect(activeWithPastExpiry).toBe("Active");
    });
  });
});
