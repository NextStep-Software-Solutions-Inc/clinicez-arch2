export type SignUpStep = "sign-up" | "verify-email" | "complete-requirements";

export interface SignUpVerification {
  status: string | null;
  strategy?: string | null;
  attempts?: number | null;
  error?: unknown;
}

export interface SignUpVerifications {
  emailAddress?: SignUpVerification | null;
  externalAccount?: SignUpVerification | null;
  phoneNumber?: SignUpVerification | null;
}

export interface SignUpSnapshot {
  status: string | null;
  missingFields?: string[] | null;
  unverifiedFields?: string[] | null;
  username?: string | null;
  emailAddress?: string | null;
  createdSessionId?: string | null;
  verifications?: SignUpVerifications | null;
}

export interface SignUpClerkErrorDetail {
  code?: string;
  message?: string;
  longMessage?: string;
  meta?: {
    paramName?: string;
    param_name?: string;
    [key: string]: unknown;
  };
}

export interface ParsedSignUpError {
  message: string;
  isExistingAccountConflict: boolean;
  field: "email_address" | "username" | "password" | "code" | "general";
}

export type PostVerificationAction =
  | { type: "complete"; sessionId: string }
  | { type: "auto-apply-retained-username"; username: string }
  | { type: "prompt-username" }
  | { type: "stay-verify-email"; error: string; isExistingAccountConflict?: boolean };

/**
 * Pure state guard evaluating whether the sign-up session is returning from
 * a verified external identity (Google OAuth/SSO) where the user identity is
 * verified and ONLY the username remains to be set.
 */
export function shouldResumeOAuthUsernameStep(
  signUp: SignUpSnapshot | null | undefined
): boolean {
  if (!signUp || signUp.status !== "missing_requirements") {
    return false;
  }

  const emailVerified = signUp.verifications?.emailAddress?.status === "verified";
  const externalVerified = signUp.verifications?.externalAccount?.status === "verified";
  if (!emailVerified && !externalVerified) {
    return false;
  }

  if ((signUp.unverifiedFields ?? []).length > 0) {
    return false;
  }

  const missing = signUp.missingFields ?? [];
  if (missing.includes("email_address") || missing.includes("password")) {
    return false;
  }

  const hasMissingUsername = missing.includes("username") || missing.includes("user_name");
  const hasNoUsername = !signUp.username || !signUp.username.trim();

  return hasMissingUsername && hasNoUsername;
}

function extractParamName(e: unknown): string {
  if (!e || typeof e !== "object") return "";
  const obj = e as Record<string, unknown>;
  const meta = obj.meta as Record<string, unknown> | undefined;
  const param =
    (typeof meta?.paramName === "string" ? meta.paramName : undefined) ||
    (typeof meta?.param_name === "string" ? meta.param_name : undefined) ||
    (typeof meta?.param === "string" ? meta.param : undefined) ||
    (typeof obj.paramName === "string" ? obj.paramName : undefined) ||
    (typeof obj.param_name === "string" ? obj.param_name : undefined) ||
    (typeof obj.param === "string" ? obj.param : undefined) ||
    "";
  return param.toLowerCase().replace(/[-_]/g, "");
}

/**
 * Type-safe Clerk API error parser that disambiguates email collision from
 * username collision and standard form validation failures.
 * Inspects all errors in the response to prioritize critical collision detection.
 */
export function parseSignUpError(err: unknown): ParsedSignUpError {
  if (!err) {
    return {
      message: "Something went wrong. Please try again.",
      isExistingAccountConflict: false,
      field: "general",
    };
  }

  // Handle plain string error
  if (typeof err === "string" && err.trim().length > 0) {
    return {
      message: err.trim(),
      isExistingAccountConflict: false,
      field: "general",
    };
  }

  let rawErrors: unknown[] | null = null;
  if (typeof err === "object" && err !== null) {
    if ("errors" in err && Array.isArray((err as { errors: unknown[] }).errors)) {
      rawErrors = (err as { errors: unknown[] }).errors;
    } else if ("code" in err && typeof (err as { code: unknown }).code === "string") {
      rawErrors = [err];
    }
  }

  if (rawErrors && rawErrors.length > 0) {
    // 1. Prioritize existing account / email collision first so returning users
    // entering both their existing username and existing email receive Sign-In guidance
    const emailConflict = rawErrors.find((e) => {
      if (!e || typeof e !== "object") return false;
      const code = (typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : "").toLowerCase();
      const param = extractParamName(e);
      if (param === "username" || code === "form_username_exists") return false;
      return (
        code === "form_identifier_exists" ||
        code === "formidentifierexistswithanotheraccount" ||
        code.includes("identifier_exists")
      );
    });
    if (emailConflict) {
      const param = extractParamName(emailConflict);
      if (param === "phonenumber" || param === "phone") {
        return {
          message: "An account with this phone number already exists. Please sign in to continue or use a different phone number.",
          isExistingAccountConflict: true,
          field: "general",
        };
      }
      return {
        message: "An account with this email address already exists. Please sign in to continue or use a different email.",
        isExistingAccountConflict: true,
        field: "email_address",
      };
    }

    // 2. Check taken username conflict when email is not already registered
    const usernameConflict = rawErrors.find((e) => {
      if (!e || typeof e !== "object") return false;
      const code = (typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : "").toLowerCase();
      const param = extractParamName(e);
      return code === "form_username_exists" || (code === "form_identifier_exists" && param === "username");
    });
    if (usernameConflict) {
      return {
        message: "This username is already taken. Please choose a different username.",
        isExistingAccountConflict: false,
        field: "username",
      };
    }

    // 3. Check for specific known error codes across the error array
    for (const item of rawErrors) {
      if (!item || typeof item !== "object") continue;
      const code = (typeof (item as { code?: unknown }).code === "string" ? (item as { code: string }).code : "").toLowerCase();

      if (code === "form_username_invalid_character") {
        return {
          message: "Username may only contain lowercase letters, numbers, underscores, and periods.",
          isExistingAccountConflict: false,
          field: "username",
        };
      }
      if (code === "form_username_invalid_length") {
        return {
          message: "Username must be between 3 and 30 characters long.",
          isExistingAccountConflict: false,
          field: "username",
        };
      }
      if (code === "form_password_length_too_short") {
        return {
          message: "Password must be at least 8 characters long.",
          isExistingAccountConflict: false,
          field: "password",
        };
      }
      if (code === "form_password_pwned") {
        return {
          message: "This password has been compromised in a breach. Please choose a different password.",
          isExistingAccountConflict: false,
          field: "password",
        };
      }
      if (code === "form_code_length_invalid") {
        return {
          message: "Verification code must be 6 digits long.",
          isExistingAccountConflict: false,
          field: "code",
        };
      }
      if (code === "form_code_incorrect" || code === "form_code_invalid") {
        return {
          message: "The verification code is incorrect. Please check your inbox and try again.",
          isExistingAccountConflict: false,
          field: "code",
        };
      }
      if (code === "form_code_expired" || code === "verification_expired") {
        return {
          message: "The verification code has expired. Please request a new code.",
          isExistingAccountConflict: false,
          field: "code",
        };
      }
      if (code === "too_many_requests" || code === "too_many_attempts") {
        return {
          message: "Too many attempts. Please wait a moment and try again.",
          isExistingAccountConflict: false,
          field: "general",
        };
      }
    }

    const first = rawErrors[0];
    if (typeof first === "string" && first.trim()) {
      return {
        message: first.trim(),
        isExistingAccountConflict: false,
        field: "general",
      };
    }

    if (first && typeof first === "object") {
      const firstObj = first as Record<string, unknown>;
      const rawMessage =
        (typeof firstObj.longMessage === "string" ? firstObj.longMessage : undefined) ||
        (typeof firstObj.message === "string" ? firstObj.message : undefined) ||
        "";
      const firstCode = (typeof firstObj.code === "string" ? firstObj.code : "").toLowerCase();
      const firstParam = extractParamName(firstObj);

      let field: "email_address" | "username" | "password" | "code" | "general" = "general";
      if (firstParam === "emailaddress" || firstParam === "email" || firstCode.includes("email")) {
        field = "email_address";
      } else if (firstParam === "username" || firstCode.startsWith("form_username_")) {
        field = "username";
      } else if (firstParam === "password" || firstCode.startsWith("form_password_")) {
        field = "password";
      } else if (firstParam === "code" || firstParam === "verificationcode" || firstCode.startsWith("form_code_") || firstCode.includes("verification_")) {
        field = "code";
      }

      return {
        message: rawMessage || "An error occurred during registration. Please try again.",
        isExistingAccountConflict: false,
        field,
      };
    }
  }

  // Handle plain object with message property
  if (typeof err === "object" && "message" in err && typeof (err as { message?: unknown }).message === "string") {
    const msg = (err as { message: string }).message.trim();
    if (msg) {
      const lower = msg.toLowerCase();
      const isEmailConflict =
        lower.includes("email") &&
        (lower.includes("already exists") || lower.includes("taken") || lower.includes("exists"));
      return {
        message: msg,
        isExistingAccountConflict: isEmailConflict,
        field: isEmailConflict ? "email_address" : "general",
      };
    }
  }

  // Handle HTTP statusText property if message is not present
  if (typeof err === "object" && "statusText" in err && typeof (err as { statusText?: unknown }).statusText === "string") {
    const statusText = (err as { statusText: string }).statusText.trim();
    if (statusText) {
      return {
        message: statusText,
        isExistingAccountConflict: false,
        field: "general",
      };
    }
  }

  if (err instanceof Error) {
    const msg = err.message || "An unexpected error occurred. Please try again.";
    const lower = msg.toLowerCase();
    const isEmailConflict =
      lower.includes("email") &&
      (lower.includes("already exists") || lower.includes("taken") || lower.includes("exists"));
    return {
      message: msg,
      isExistingAccountConflict: isEmailConflict,
      field: isEmailConflict ? "email_address" : "general",
    };
  }

  return {
    message: "Something went wrong. Please try again.",
    isExistingAccountConflict: false,
    field: "general",
  };
}

/**
 * Resolves the deterministic post-OTP verification action:
 * - If complete, session is activated immediately.
 * - If username is missing but was retained in form state, it can be auto-applied.
 * - If still missing and not retained, prompts user for username.
 * - Otherwise, stays on verification step with error explanation without leaking internal status enums.
 */
export function resolvePostVerificationAction(
  signUp: SignUpSnapshot | null | undefined,
  retainedUsername: string
): PostVerificationAction {
  if (!signUp) {
    return {
      type: "stay-verify-email",
      error: "Registration session not found. Please try again.",
    };
  }

  if (signUp.status === "complete") {
    if (signUp.createdSessionId) {
      return {
        type: "complete",
        sessionId: signUp.createdSessionId,
      };
    }
    return {
      type: "stay-verify-email",
      error: "Registration completed but no active session was returned. Please sign in.",
      isExistingAccountConflict: true,
    };
  }

  if (signUp.unverifiedFields?.includes("email_address")) {
    return {
      type: "stay-verify-email",
      error: "The email address has not been verified yet. Please check your verification code.",
    };
  }

  if (signUp.status === "missing_requirements") {
    if (signUp.missingFields?.includes("username")) {
      const cleanUsername = retainedUsername.trim().toLowerCase();
      if (cleanUsername.length >= 3) {
        return {
          type: "auto-apply-retained-username",
          username: cleanUsername,
        };
      }
      return {
        type: "prompt-username",
      };
    }

    return {
      type: "stay-verify-email",
      error: "Additional registration requirements are pending. Please complete all required steps.",
    };
  }

  return {
    type: "stay-verify-email",
    error: "Additional registration information is required. Please check your details and try again.",
  };
}

/**
 * Generates sign-in destination URL preserving custom redirect_url parameter.
 */
export function buildSignInHref(redirectUrl?: string | null): string {
  const trimmed = redirectUrl?.trim();
  if (trimmed && trimmed !== "/sync-auth" && trimmed !== "/sign-in") {
    return `/sign-in?redirect_url=${encodeURIComponent(trimmed)}`;
  }
  return "/sign-in";
}

function isSafeRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

function mergeOnboardingParams(
  targetPath: string,
  plan?: string | null,
  billing?: string | null
): string {
  const qIndex = targetPath.indexOf("?");
  const basePath = qIndex >= 0 ? targetPath.slice(0, qIndex) : targetPath;
  const existingQuery = qIndex >= 0 ? targetPath.slice(qIndex + 1) : "";
  const qs = new URLSearchParams(existingQuery);

  const cleanPlan = plan?.trim() || "";
  const cleanBilling = billing?.trim() || "";

  if (cleanPlan && !qs.get("plan")) {
    qs.set("plan", cleanPlan);
  }
  if (cleanBilling && !qs.get("billing")) {
    qs.set("billing", cleanBilling);
  }

  const serialized = qs.toString();
  return serialized ? `${basePath}?${serialized}` : basePath;
}

/**
 * Resolves the post-authentication destination for fresh sign-ups AND already-signed-in
 * users arriving on /sign-up (for instance from marketing-web pricing cards with ?plan=...&billing=...).
 */
export function resolveSignUpRedirectTarget(params: {
  redirectUrl?: string | null;
  plan?: string | null;
  billing?: string | null;
  alreadySignedIn?: boolean;
}): string {
  const rawRedirect = params.redirectUrl?.trim() || "";
  const safeRedirect =
    rawRedirect && isSafeRelativePath(rawRedirect) && !rawRedirect.startsWith("/sign-up")
      ? rawRedirect
      : "";

  const cleanPlan = params.plan?.trim() || "";
  const cleanBilling = params.billing?.trim() || "";

  if (safeRedirect.startsWith("/tenants/register")) {
    return mergeOnboardingParams(safeRedirect, cleanPlan, cleanBilling);
  }

  if (cleanPlan || cleanBilling) {
    if (safeRedirect && !safeRedirect.startsWith("/sync-auth")) {
      return safeRedirect;
    }
    return mergeOnboardingParams("/tenants/register", cleanPlan, cleanBilling);
  }

  if (safeRedirect) {
    return safeRedirect;
  }

  return "/sync-auth";
}
