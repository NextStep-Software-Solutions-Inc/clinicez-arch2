import { describe, test, expect, mock } from "bun:test";
import React from "react";
import fs from "fs";
import path from "path";
import { renderToString } from "react-dom/server";

// Mock next/navigation
let mockSearchParams = new URLSearchParams();
let mockRouterPushed: string | null = null;
let mockRouterReplaced: string | null = null;

mock.module("next/navigation", () => ({
  useRouter: () => ({
    push: (url: string) => {
      mockRouterPushed = url;
    },
    replace: (url: string) => {
      mockRouterReplaced = url;
    },
    prefetch: () => {},
  }),
  useSearchParams: () => mockSearchParams,
}));

// Mock @clerk/nextjs
let mockSignUpState: {
  isLoaded: boolean;
  signUp: Record<string, unknown> | null;
  setActive: (opts: { session: string }) => Promise<void>;
} = {
  isLoaded: true,
  signUp: null,
  setActive: async () => {},
};

let mockSignInState: {
  isLoaded: boolean;
  signIn: Record<string, unknown> | null;
} = {
  isLoaded: true,
  signIn: null,
};

mock.module("@clerk/nextjs", () => ({
  useSignUp: () => mockSignUpState,
  useSignIn: () => mockSignInState,
}));

// Import state machine helpers and component
import {
  shouldResumeOAuthUsernameStep,
  parseSignUpError,
  resolvePostVerificationAction,
  buildSignInHref,
  type SignUpSnapshot,
} from "../src/app/sign-up/_lib/signUpFlow";
import { CustomSignUpForm } from "../src/app/sign-up/_components/CustomSignUpForm";

describe("Custom Sign-Up Flow & State Machine (Issue #78)", () => {
  describe("R1: Existing Email & Username Collision Disambiguation", () => {
    test("R1.1: parseSignUpError correctly identifies existing email collision with isExistingAccountConflict: true", () => {
      const emailCollisionErr = {
        errors: [
          {
            code: "form_identifier_exists",
            message: "That email address is taken. Please try another.",
            meta: { paramName: "email_address" },
          },
        ],
      };

      const parsed = parseSignUpError(emailCollisionErr);
      expect(parsed.isExistingAccountConflict).toBe(true);
      expect(parsed.field).toBe("email_address");
      expect(parsed.message).toBe(
        "An account with this email address already exists. Please sign in to continue or use a different email."
      );
    });

    test("R1.2: parseSignUpError flags generic form_identifier_exists without paramName as existing email conflict", () => {
      const genericCollisionErr = {
        errors: [
          {
            code: "form_identifier_exists",
            message: "Identifier already in use",
          },
        ],
      };

      const parsed = parseSignUpError(genericCollisionErr);
      expect(parsed.isExistingAccountConflict).toBe(true);
      expect(parsed.field).toBe("email_address");
      expect(parsed.message).toContain("An account with this email address already exists");
    });

    test("R1.3: parseSignUpError disambiguates form_username_exists with isExistingAccountConflict: false", () => {
      const usernameCollisionErr = {
        errors: [
          {
            code: "form_username_exists",
            message: "That username is taken. Please try another.",
          },
        ],
      };

      const parsed = parseSignUpError(usernameCollisionErr);
      expect(parsed.isExistingAccountConflict).toBe(false);
      expect(parsed.field).toBe("username");
      expect(parsed.message).toBe("This username is already taken. Please choose a different username.");
    });

    test("R1.4: parseSignUpError disambiguates form_identifier_exists when paramName is 'username'", () => {
      const usernameIdentifierErr = {
        errors: [
          {
            code: "form_identifier_exists",
            message: "Identifier already exists",
            meta: { paramName: "username" },
          },
        ],
      };

      const parsed = parseSignUpError(usernameIdentifierErr);
      expect(parsed.isExistingAccountConflict).toBe(false);
      expect(parsed.field).toBe("username");
      expect(parsed.message).toBe("This username is already taken. Please choose a different username.");
    });

    test("R1.5: parseSignUpError disambiguates form_identifier_exists when meta has snake_case param_name 'username'", () => {
      const usernameSnakeErr = {
        errors: [
          {
            code: "form_identifier_exists",
            message: "Identifier already exists",
            meta: { param_name: "username" },
          },
        ],
      };

      const parsed = parseSignUpError(usernameSnakeErr);
      expect(parsed.isExistingAccountConflict).toBe(false);
      expect(parsed.field).toBe("username");
      expect(parsed.message).toBe("This username is already taken. Please choose a different username.");
    });

    test("R1.6: buildSignInHref preserves custom redirect_url parameter or defaults to /sign-in", () => {
      expect(buildSignInHref()).toBe("/sign-in");
      expect(buildSignInHref(null)).toBe("/sign-in");
      expect(buildSignInHref("/sync-auth")).toBe("/sign-in");
      expect(buildSignInHref("/tenants/register")).toBe("/sign-in?redirect_url=%2Ftenants%2Fregister");
      expect(buildSignInHref("/custom/path?ref=trial")).toBe(
        "/sign-in?redirect_url=%2Fcustom%2Fpath%3Fref%3Dtrial"
      );
    });

    test("R1.7: shouldResumeOAuthUsernameStep returns false on existing email collision state", () => {
      // Even if Clerk leaves status at missing_requirements after collision
      const collisionSignUp: SignUpSnapshot = {
        status: "missing_requirements",
        unverifiedFields: ["email_address"],
        missingFields: ["email_address"],
        verifications: null,
      };

      expect(shouldResumeOAuthUsernameStep(collisionSignUp)).toBe(false);
    });

    test("R1.8: parseSignUpError detects existing email conflict when preceded by other validation errors", () => {
      const multiError = {
        errors: [
          { code: "form_password_length_too_short", message: "Password too short" },
          { code: "form_identifier_exists", meta: { paramName: "email_address" } },
        ],
      };

      const parsed = parseSignUpError(multiError);
      expect(parsed.isExistingAccountConflict).toBe(true);
      expect(parsed.field).toBe("email_address");
      expect(parsed.message).toContain("An account with this email address already exists");
    });

    test("R1.9: parseSignUpError detects taken username when preceded by other validation errors", () => {
      const multiError = {
        errors: [
          { code: "form_password_length_too_short", message: "Password too short" },
          { code: "form_username_exists", message: "Username taken" },
        ],
      };

      const parsed = parseSignUpError(multiError);
      expect(parsed.isExistingAccountConflict).toBe(false);
      expect(parsed.field).toBe("username");
      expect(parsed.message).toBe("This username is already taken. Please choose a different username.");
    });

    test("R1.10: parseSignUpError handles FormIdentifierExistsWithAnotherAccount case-insensitively", () => {
      const linkedAccountErr = {
        errors: [
          { code: "formidentifierexistswithanotheraccount", message: "Already exists" },
        ],
      };

      const parsed = parseSignUpError(linkedAccountErr);
      expect(parsed.isExistingAccountConflict).toBe(true);
      expect(parsed.field).toBe("email_address");
    });

    test("R1.11: parseSignUpError disambiguates phone number collision without falsely claiming email collision", () => {
      const phoneErr = {
        errors: [
          { code: "form_identifier_exists", meta: { paramName: "phone_number" } },
        ],
      };

      const parsed = parseSignUpError(phoneErr);
      expect(parsed.isExistingAccountConflict).toBe(true);
      expect(parsed.field).toBe("general");
      expect(parsed.message).toContain("phone number already exists");
      expect(parsed.message).not.toContain("email address");
    });

    test("R1.12: parseSignUpError disambiguates phone collision when paramName is at root level of error", () => {
      const phoneRootErr = {
        errors: [
          { code: "form_identifier_exists", paramName: "phone_number" },
        ],
      };

      const parsed = parseSignUpError(phoneRootErr);
      expect(parsed.isExistingAccountConflict).toBe(true);
      expect(parsed.field).toBe("general");
      expect(parsed.message).toContain("phone number already exists");
    });

    test("R1.13: parseSignUpError disambiguates phone collision with camelCase paramName 'phoneNumber'", () => {
      const phoneCamelErr = {
        errors: [{ code: "form_identifier_exists", meta: { paramName: "phoneNumber" } }],
      };
      const parsed = parseSignUpError(phoneCamelErr);
      expect(parsed.isExistingAccountConflict).toBe(true);
      expect(parsed.field).toBe("general");
      expect(parsed.message).toContain("phone number already exists");
      expect(parsed.message).not.toContain("email address");
    });

    test("R1.14: parseSignUpError disambiguates username collision with snake_case param_name 'user_name' and camelCase 'userName'", () => {
      const usernameSnakeErr = {
        errors: [{ code: "form_identifier_exists", meta: { param_name: "user_name" } }],
      };
      const parsedSnake = parseSignUpError(usernameSnakeErr);
      expect(parsedSnake.isExistingAccountConflict).toBe(false);
      expect(parsedSnake.field).toBe("username");
      expect(parsedSnake.message).toBe("This username is already taken. Please choose a different username.");

      const usernameCamelErr = {
        errors: [{ code: "form_identifier_exists", meta: { paramName: "userName" } }],
      };
      const parsedCamel = parseSignUpError(usernameCamelErr);
      expect(parsedCamel.isExistingAccountConflict).toBe(false);
      expect(parsedCamel.field).toBe("username");
    });

    test("R1.15: parseSignUpError handles single error object without outer errors array for collisions", () => {
      const singleEmailErr = {
        code: "form_identifier_exists",
        meta: { paramName: "email_address" },
      };
      const parsedEmail = parseSignUpError(singleEmailErr);
      expect(parsedEmail.isExistingAccountConflict).toBe(true);
      expect(parsedEmail.field).toBe("email_address");

      const singleUsernameErr = {
        code: "form_username_exists",
      };
      const parsedUsername = parseSignUpError(singleUsernameErr);
      expect(parsedUsername.isExistingAccountConflict).toBe(false);
      expect(parsedUsername.field).toBe("username");
    });

    test("R1.16: buildSignInHref strips whitespace and avoids redundant /sign-in redirect_url loop", () => {
      expect(buildSignInHref("  /tenants/register  ")).toBe("/sign-in?redirect_url=%2Ftenants%2Fregister");
      expect(buildSignInHref("/sign-in")).toBe("/sign-in");
      expect(buildSignInHref("   ")).toBe("/sign-in");
    });

    test("R1.17: parseSignUpError prioritizes existing email conflict over username collision when both identifiers belong to an existing account", () => {
      const bothExistErr = {
        errors: [
          { code: "form_identifier_exists", meta: { paramName: "username" } },
          { code: "form_identifier_exists", meta: { paramName: "email_address" } },
        ],
      };
      const parsed = parseSignUpError(bothExistErr);
      expect(parsed.isExistingAccountConflict).toBe(true);
      expect(parsed.field).toBe("email_address");
      expect(parsed.message).toContain("An account with this email address already exists");
    });
  });

  describe("R2: New Account Email Verification & Username Retention", () => {
    test("R2.1: In-progress new registration with pending email verification does not trigger OAuth username resumption", () => {
      const pendingVerificationSignUp: SignUpSnapshot = {
        status: "missing_requirements",
        unverifiedFields: ["email_address"],
        missingFields: [],
        username: "janesmith",
        emailAddress: "jane.smith@practice.com",
        verifications: {
          emailAddress: {
            status: "unverified",
            strategy: "email_code",
          },
        },
      };

      // Crucial: Must return false so it does not hijack Step 2 back to Step 3!
      expect(shouldResumeOAuthUsernameStep(pendingVerificationSignUp)).toBe(false);
    });

    test("R2.2: resolvePostVerificationAction completes immediately when status is complete with sessionId", () => {
      const completeSignUp: SignUpSnapshot = {
        status: "complete",
        createdSessionId: "sess_registered_999",
        missingFields: [],
        unverifiedFields: [],
      };

      const action = resolvePostVerificationAction(completeSignUp, "janesmith");
      expect(action.type).toBe("complete");
      if (action.type === "complete") {
        expect(action.sessionId).toBe("sess_registered_999");
      }
    });

    test("R2.3: resolvePostVerificationAction auto-applies retained Step 1 username if missing post-OTP", () => {
      const missingUsernameSignUp: SignUpSnapshot = {
        status: "missing_requirements",
        missingFields: ["username"],
        unverifiedFields: [],
        username: null,
      };

      const action = resolvePostVerificationAction(missingUsernameSignUp, "janesmith");
      expect(action.type).toBe("auto-apply-retained-username");
      if (action.type === "auto-apply-retained-username") {
        expect(action.username).toBe("janesmith");
      }
    });

    test("R2.4: resolvePostVerificationAction prompts for username if missing post-OTP and retained username is empty", () => {
      const missingUsernameSignUp: SignUpSnapshot = {
        status: "missing_requirements",
        missingFields: ["username"],
        unverifiedFields: [],
        username: null,
      };

      const action = resolvePostVerificationAction(missingUsernameSignUp, "  ");
      expect(action.type).toBe("prompt-username");

      const actionShort = resolvePostVerificationAction(missingUsernameSignUp, "ab");
      expect(actionShort.type).toBe("prompt-username");
    });

    test("R2.5: resolvePostVerificationAction stays on verify-email if email_address remains unverified", () => {
      const unverifiedSignUp: SignUpSnapshot = {
        status: "missing_requirements",
        missingFields: [],
        unverifiedFields: ["email_address"],
      };

      const action = resolvePostVerificationAction(unverifiedSignUp, "janesmith");
      expect(action.type).toBe("stay-verify-email");
      if (action.type === "stay-verify-email") {
        expect(action.error).toContain("has not been verified yet");
      }
    });

    test("R2.6: resolvePostVerificationAction returns human-friendly error without leaking raw Status: missing_requirements", () => {
      const missingOtherSignUp: SignUpSnapshot = {
        status: "missing_requirements",
        missingFields: ["password"],
        unverifiedFields: [],
      };

      const action = resolvePostVerificationAction(missingOtherSignUp, "janesmith");
      expect(action.type).toBe("stay-verify-email");
      if (action.type === "stay-verify-email") {
        expect(action.error).not.toContain("missing_requirements");
        expect(action.error).not.toContain("Status:");
        expect(action.error).toContain("Additional registration requirements are pending");
      }
    });

    test("R2.7: resolvePostVerificationAction handles unknown status cleanly without raw enum text", () => {
      const unknownSignUp: SignUpSnapshot = {
        status: "custom_status_code",
        missingFields: [],
        unverifiedFields: [],
      };

      const action = resolvePostVerificationAction(unknownSignUp, "janesmith");
      expect(action.type).toBe("stay-verify-email");
      if (action.type === "stay-verify-email") {
        expect(action.error).not.toContain("custom_status_code");
        expect(action.error).toContain("Additional registration information is required");
      }
    });

    test("R2.8: resolvePostVerificationAction propagates isExistingAccountConflict: true on complete status without sessionId", () => {
      const completeWithoutSession: SignUpSnapshot = {
        status: "complete",
        createdSessionId: null,
      };

      const action = resolvePostVerificationAction(completeWithoutSession, "janesmith");
      expect(action.type).toBe("stay-verify-email");
      if (action.type === "stay-verify-email") {
        expect(action.isExistingAccountConflict).toBe(true);
        expect(action.error).toContain("Please sign in");
      }
    });
  });

  describe("R3: Verified OAuth Username Resumption & Defensive State Guards", () => {
    test("R3.1: shouldResumeOAuthUsernameStep returns true for verified externalAccount OAuth callback with missing username", () => {
      const verifiedOAuthSignUp: SignUpSnapshot = {
        status: "missing_requirements",
        missingFields: ["username"],
        unverifiedFields: [],
        username: null,
        emailAddress: "oauth.user@gmail.com",
        verifications: {
          externalAccount: {
            status: "verified",
            strategy: "oauth_google",
          },
        },
      };

      expect(shouldResumeOAuthUsernameStep(verifiedOAuthSignUp)).toBe(true);
    });

    test("R3.2: shouldResumeOAuthUsernameStep returns true for verified emailAddress OAuth callback with missing username", () => {
      const verifiedEmailOAuthSignUp: SignUpSnapshot = {
        status: "missing_requirements",
        missingFields: ["username"],
        unverifiedFields: [],
        username: null,
        emailAddress: "oauth.user@gmail.com",
        verifications: {
          emailAddress: {
            status: "verified",
            strategy: "from_oauth_google",
          },
        },
      };

      expect(shouldResumeOAuthUsernameStep(verifiedEmailOAuthSignUp)).toBe(true);
    });

    test("R3.3: shouldResumeOAuthUsernameStep returns false if username is already populated", () => {
      const alreadyHasUsername: SignUpSnapshot = {
        status: "missing_requirements",
        missingFields: ["username"],
        unverifiedFields: [],
        username: "existing_user",
        verifications: {
          externalAccount: { status: "verified" },
        },
      };

      expect(shouldResumeOAuthUsernameStep(alreadyHasUsername)).toBe(false);
    });

    test("R3.4: shouldResumeOAuthUsernameStep returns false for incomplete sign-up draft missing credentials", () => {
      const incompleteDraft: SignUpSnapshot = {
        status: "missing_requirements",
        missingFields: ["email_address", "username", "password"],
        unverifiedFields: [],
        verifications: {
          externalAccount: { status: "verified" },
        },
      };

      expect(shouldResumeOAuthUsernameStep(incompleteDraft)).toBe(false);
    });

    test("R3.5: shouldResumeOAuthUsernameStep returns false if unverifiedFields has pending items", () => {
      const pendingUnverifiedFields: SignUpSnapshot = {
        status: "missing_requirements",
        missingFields: ["username"],
        unverifiedFields: ["email_address"],
        verifications: {
          externalAccount: { status: "verified" },
        },
      };

      expect(shouldResumeOAuthUsernameStep(pendingUnverifiedFields)).toBe(false);
    });

    test("R3.6: shouldResumeOAuthUsernameStep returns false for null/undefined/abandoned sign-up states", () => {
      expect(shouldResumeOAuthUsernameStep(null)).toBe(false);
      expect(shouldResumeOAuthUsernameStep(undefined)).toBe(false);
      expect(
        shouldResumeOAuthUsernameStep({
          status: "abandoned",
          missingFields: ["username"],
          verifications: { externalAccount: { status: "verified" } },
        })
      ).toBe(false);
      expect(
        shouldResumeOAuthUsernameStep({
          status: "complete",
          missingFields: [],
          verifications: { externalAccount: { status: "verified" } },
        })
      ).toBe(false);
    });

    test("R3.7: shouldResumeOAuthUsernameStep treats whitespace-only username as unpopulated", () => {
      const whitespaceUsername: SignUpSnapshot = {
        status: "missing_requirements",
        missingFields: ["username"],
        unverifiedFields: [],
        username: "   ",
        verifications: {
          externalAccount: { status: "verified" },
        },
      };

      expect(shouldResumeOAuthUsernameStep(whitespaceUsername)).toBe(true);
    });
  });

  describe("R4: Error Code Mapping & Validation Matrix", () => {
    test("R4.1: parseSignUpError maps username validation errors", () => {
      const invalidChars = parseSignUpError({
        errors: [{ code: "form_username_invalid_character" }],
      });
      expect(invalidChars.field).toBe("username");
      expect(invalidChars.message).toContain("lowercase letters, numbers, underscores");

      const invalidLength = parseSignUpError({
        errors: [{ code: "form_username_invalid_length" }],
      });
      expect(invalidLength.field).toBe("username");
      expect(invalidLength.message).toContain("between 3 and 30 characters");
    });

    test("R4.2: parseSignUpError maps password validation errors", () => {
      const tooShort = parseSignUpError({
        errors: [{ code: "form_password_length_too_short" }],
      });
      expect(tooShort.field).toBe("password");
      expect(tooShort.message).toContain("at least 8 characters");

      const pwned = parseSignUpError({
        errors: [{ code: "form_password_pwned" }],
      });
      expect(pwned.field).toBe("password");
      expect(pwned.message).toContain("compromised in a breach");
    });

    test("R4.3: parseSignUpError maps verification code and rate limit errors", () => {
      const incorrectCode = parseSignUpError({
        errors: [{ code: "form_code_incorrect" }],
      });
      expect(incorrectCode.field).toBe("code");
      expect(incorrectCode.message).toContain("verification code is incorrect");

      const expiredCode = parseSignUpError({
        errors: [{ code: "form_code_expired" }],
      });
      expect(expiredCode.field).toBe("code");
      expect(expiredCode.message).toContain("verification code has expired");

      const rateLimit = parseSignUpError({
        errors: [{ code: "too_many_requests" }],
      });
      expect(rateLimit.field).toBe("general");
      expect(rateLimit.message).toContain("Too many attempts");
    });

    test("R4.4: parseSignUpError handles standard Error and unexpected error shapes", () => {
      const jsError = parseSignUpError(new Error("Network connection dropped"));
      expect(jsError.message).toBe("Network connection dropped");
      expect(jsError.isExistingAccountConflict).toBe(false);

      const nullError = parseSignUpError(null);
      expect(nullError.message).toBe("Something went wrong. Please try again.");

      const emptyObjError = parseSignUpError({});
      expect(emptyObjError.message).toBe("Something went wrong. Please try again.");
    });

    test("R4.5: parseSignUpError parses plain object with message property", () => {
      const customMsg = parseSignUpError({ message: "Custom upstream error", errors: [] });
      expect(customMsg.message).toBe("Custom upstream error");
      expect(customMsg.isExistingAccountConflict).toBe(false);
      expect(customMsg.field).toBe("general");
    });

    test("R4.6: parseSignUpError correctly maps field property based on error code prefix", () => {
      const pwd = parseSignUpError({ errors: [{ code: "form_password_size_in_bytes_exceeded", message: "Too large" }] });
      expect(pwd.field).toBe("password");

      const usr = parseSignUpError({ errors: [{ code: "form_username_reserved", message: "Reserved" }] });
      expect(usr.field).toBe("username");

      const codeErr = parseSignUpError({ errors: [{ code: "form_code_max_attempts", message: "Exceeded" }] });
      expect(codeErr.field).toBe("code");

      const emailErr = parseSignUpError({ errors: [{ code: "form_param_format_invalid_email", message: "Bad email" }] });
      expect(emailErr.field).toBe("email_address");
    });

    test("R4.7: parseSignUpError parses plain string error directly without generic fallback", () => {
      const stringErr = parseSignUpError("Verification timed out. Please try again.");
      expect(stringErr.message).toBe("Verification timed out. Please try again.");
      expect(stringErr.isExistingAccountConflict).toBe(false);
      expect(stringErr.field).toBe("general");
    });

    test("R4.8: parseSignUpError extracts HTTP statusText when message is absent", () => {
      const httpErr = parseSignUpError({ status: 504, statusText: "Gateway Timeout" });
      expect(httpErr.message).toBe("Gateway Timeout");
      expect(httpErr.isExistingAccountConflict).toBe(false);
      expect(httpErr.field).toBe("general");
    });

    test("R4.9: parseSignUpError extracts raw string error elements inside errors array", () => {
      const stringArrErr = parseSignUpError({ errors: ["Upstream rate limit reached. Please wait."] });
      expect(stringArrErr.message).toBe("Upstream rate limit reached. Please wait.");
      expect(stringArrErr.isExistingAccountConflict).toBe(false);
      expect(stringArrErr.field).toBe("general");
    });

    test("R4.10: parseSignUpError detects root-level paramName and snake_case param_name for username collision", () => {
      const rootParamErr = parseSignUpError({
        errors: [{ code: "form_identifier_exists", paramName: "username" }],
      });
      expect(rootParamErr.isExistingAccountConflict).toBe(false);
      expect(rootParamErr.field).toBe("username");
      expect(rootParamErr.message).toBe("This username is already taken. Please choose a different username.");

      const rootSnakeParamErr = parseSignUpError({
        errors: [{ code: "form_identifier_exists", param_name: "username" }],
      });
      expect(rootSnakeParamErr.isExistingAccountConflict).toBe(false);
      expect(rootSnakeParamErr.field).toBe("username");
    });

    test("R4.11: parseSignUpError maps field based on meta.paramName even with unlisted error code", () => {
      const emailParamErr = parseSignUpError({
        errors: [{ code: "custom_verification_code", meta: { paramName: "email_address" }, message: "Domain rejected" }],
      });
      expect(emailParamErr.field).toBe("email_address");
      expect(emailParamErr.message).toBe("Domain rejected");

      const pwdParamErr = parseSignUpError({
        errors: [{ code: "custom_rule_failed", meta: { paramName: "password" }, message: "Needs special character" }],
      });
      expect(pwdParamErr.field).toBe("password");
      expect(pwdParamErr.message).toBe("Needs special character");
    });

    test("R4.12: parseSignUpError identifies email collision from Error instances and message-bearing objects", () => {
      const jsErr = new Error("An account with this email address already exists. Please sign in.");
      const parsedJsErr = parseSignUpError(jsErr);
      expect(parsedJsErr.isExistingAccountConflict).toBe(true);
      expect(parsedJsErr.field).toBe("email_address");

      const plainObjErr = { message: "That email address is already taken" };
      const parsedObjErr = parseSignUpError(plainObjErr);
      expect(parsedObjErr.isExistingAccountConflict).toBe(true);
      expect(parsedObjErr.field).toBe("email_address");
    });

    test("R4.13: parseSignUpError maps form_code_length_invalid to 6-digit message and code field", () => {
      const lenErr = parseSignUpError({ errors: [{ code: "form_code_length_invalid" }] });
      expect(lenErr.field).toBe("code");
      expect(lenErr.message).toContain("6 digits long");
    });

    test("R4.14: parseSignUpError supports obj.param and meta.param properties", () => {
      const objParamErr = parseSignUpError({
        errors: [{ code: "form_identifier_exists", param: "username" }],
      });
      expect(objParamErr.isExistingAccountConflict).toBe(false);
      expect(objParamErr.field).toBe("username");

      const metaParamErr = parseSignUpError({
        errors: [{ code: "form_identifier_exists", meta: { param: "username" } }],
      });
      expect(metaParamErr.isExistingAccountConflict).toBe(false);
      expect(metaParamErr.field).toBe("username");
    });
  });

  describe("R5: Component SSR Rendering & Design Token Compliance", () => {
    test("R5.1: CustomSignUpForm renders initial Step 1 registration form with clerk-captcha mount", () => {
      mockSignUpState = {
        isLoaded: true,
        signUp: null,
        setActive: async () => {},
      };

      const html = renderToString(<CustomSignUpForm />);

      // Must be on Create your account
      expect(html).toContain("Create your account");
      expect(html).toContain("Work Email");
      expect(html).toContain("Username");
      expect(html).toContain("Password");
      expect(html).toContain("Continue with Google");

      // Must mount clerk-captcha
      expect(html).toContain('id="clerk-captcha"');

      // Must NOT render Step 3 or Step 2 on initial render
      expect(html).not.toContain("Choose your username");
      expect(html).not.toContain("Verify your email");

      // Footer sign-in link present
      expect(html).toContain("/sign-in");
    });

    test("R5.2: CustomSignUpForm respects custom redirect_url parameter in sign-in link", () => {
      mockSearchParams = new URLSearchParams({ redirect_url: "/tenants/register" });
      mockSignUpState = {
        isLoaded: true,
        signUp: null,
        setActive: async () => {},
      };

      const html = renderToString(<CustomSignUpForm />);
      expect(html).toContain('href="/sign-in?redirect_url=%2Ftenants%2Fregister"');
    });

    test("R5.3: Static audit confirms zero hardcoded theme hex literals in CustomSignUpForm and signUpFlow", () => {
      const formPath = path.resolve(__dirname, "../src/app/sign-up/_components/CustomSignUpForm.tsx");
      const flowPath = path.resolve(__dirname, "../src/app/sign-up/_lib/signUpFlow.ts");

      const formSource = fs.readFileSync(formPath, "utf-8");
      const flowSource = fs.readFileSync(flowPath, "utf-8");

      // Must not contain hardcoded brand teal hexes
      expect(formSource).not.toContain("#0D6963");
      expect(formSource).not.toContain("#0d6963");
      expect(formSource).not.toContain("#F8FAFC");
      expect(formSource).not.toContain("#f8fafc");

      // Must not contain raw emerald-* alert classes
      expect(formSource).not.toContain("emerald-500");
      expect(formSource).not.toContain("emerald-600");
      expect(formSource).not.toContain("emerald-700");
      expect(formSource).not.toContain("emerald-400");

      // Flow library must have zero hexes
      expect(flowSource).not.toContain("#");

      // Form must use semantic design tokens
      expect(formSource).toContain("bg-primary");
      expect(formSource).toContain("text-primary");
      expect(formSource).toContain("text-destructive");
      expect(formSource).toContain("bg-destructive/10");
    });

    test("R5.4: Static audit confirms zero 'any' types in CustomSignUpForm and signUpFlow", () => {
      const formPath = path.resolve(__dirname, "../src/app/sign-up/_components/CustomSignUpForm.tsx");
      const flowPath = path.resolve(__dirname, "../src/app/sign-up/_lib/signUpFlow.ts");

      const formSource = fs.readFileSync(formPath, "utf-8");
      const flowSource = fs.readFileSync(flowPath, "utf-8");

      // Check for : any or <any> or as any
      const anyRegex = /:\s*any\b|<any>|\bas\s+any\b/;
      expect(anyRegex.test(formSource)).toBe(false);
      expect(anyRegex.test(flowSource)).toBe(false);
    });

    test("R5.5: Static audit confirms zero leaked raw 'Status: missing_requirements' enum strings", () => {
      const formPath = path.resolve(__dirname, "../src/app/sign-up/_components/CustomSignUpForm.tsx");
      const flowPath = path.resolve(__dirname, "../src/app/sign-up/_lib/signUpFlow.ts");

      const formSource = fs.readFileSync(formPath, "utf-8");
      const flowSource = fs.readFileSync(flowPath, "utf-8");

      expect(formSource).not.toContain("Status: ${");
      expect(flowSource).not.toContain("Registration status: ${");
    });

    test("R5.6: CustomSignUpForm renders Choose your username ONLY for verified OAuth missing username and stays on Step 1 for unverified pending signUp", () => {
      mockSignUpState = {
        isLoaded: true,
        signUp: {
          status: "missing_requirements",
          missingFields: [],
          unverifiedFields: ["email_address"],
          username: "janesmith",
          emailAddress: "jane@practice.com",
          verifications: { emailAddress: { status: "unverified" } },
        },
        setActive: async () => {},
      };
      const pendingHtml = renderToString(<CustomSignUpForm />);
      expect(pendingHtml).toContain("Create your account");
      expect(pendingHtml).not.toContain("Choose your username");

      mockSignUpState = {
        isLoaded: true,
        signUp: {
          status: "missing_requirements",
          missingFields: ["username"],
          unverifiedFields: [],
          username: null,
          emailAddress: "oauth.doctor@gmail.com",
          verifications: { externalAccount: { status: "verified" } },
        },
        setActive: async () => {},
      };
      const oauthHtml = renderToString(<CustomSignUpForm />);
      expect(oauthHtml).toContain("Choose your username");
      expect(oauthHtml).toContain("Back to registration");
    });
  });
});
