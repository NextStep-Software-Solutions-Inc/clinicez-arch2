"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSignIn, useSignUp } from "@clerk/nextjs";
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  User,
  AtSign,
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  KeyRound, 
  ArrowLeft,
  RotateCw,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FcGoogle } from "react-icons/fc";
import { usePublicConfig } from "@/hooks/usePublicConfig";
import {
  type SignUpStep,
  shouldResumeOAuthUsernameStep,
  parseSignUpError,
  resolvePostVerificationAction,
  buildSignInHref,
} from "../_lib/signUpFlow";

// Handles Clerk username conflict error codes including form_username_exists via parseSignUpError

interface CustomSignUpFormProps {
  initialTrialDays?: number;
}

export function CustomSignUpForm({ initialTrialDays }: CustomSignUpFormProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") || "/sync-auth";

  const { trialDays: liveTrialDays, isError: isPublicConfigError } = usePublicConfig(
    initialTrialDays !== undefined
      ? { trialDays: initialTrialDays, defaultBillingCadence: "monthly" }
      : undefined
  );
  const trialDays = isPublicConfigError ? undefined : (liveTrialDays ?? initialTrialDays);

  const { isLoaded, signUp, setActive } = useSignUp();
  const { isLoaded: isSignInLoaded, signIn } = useSignIn();

  const [explicitStep, setStep] = useState<SignUpStep | null>(null);
  const step: SignUpStep =
    explicitStep ??
    (isLoaded && shouldResumeOAuthUsernameStep(signUp) ? "complete-requirements" : "sign-up");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Verification state
  const [verificationCode, setVerificationCode] = useState("");
  const [isResending, setIsResending] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isExistingAccountConflict, setIsExistingAccountConflict] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Redirect to sign-in if an OAuth sign-up transferred to an existing account requiring MFA.
  useEffect(() => {
    if (
      isSignInLoaded &&
      signIn &&
      (signIn.status === "needs_second_factor" ||
        (signIn.status as string | null) === "needs_client_trust")
    ) {
      const target = buildSignInHref(redirectUrl);
      router.replace(target);
    }
  }, [isSignInLoaded, signIn, redirectUrl, router]);

  // Google OAuth SSO
  const handleGoogleSignUp = async () => {
    if (!isLoaded || !signUp || isLoading || isSocialLoading) return;

    setIsSocialLoading(true);
    setError(null);
    setSuccessMessage(null);
    setIsExistingAccountConflict(false);

    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-up/sso-callback",
        redirectUrlComplete: redirectUrl,
      });
    } catch (err: unknown) {
      const parsed = parseSignUpError(err);
      setError(parsed.message);
      setIsExistingAccountConflict(parsed.isExistingAccountConflict);
      setSuccessMessage(null);
      setIsSocialLoading(false);
    }
  };

  // Initial Sign Up submission
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp || isLoading || isSocialLoading) return;

    setError(null);
    setSuccessMessage(null);
    setIsExistingAccountConflict(false);

    if (!firstName.trim()) {
      setError("Please enter your first name.");
      return;
    }
    if (!username.trim() || username.trim().length < 3) {
      setError("Please choose a username with at least 3 characters.");
      return;
    }
    if (!emailAddress.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!password || password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);

    try {
      const createdSignUp = await signUp.create({
        username: username.trim().toLowerCase(),
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        emailAddress: emailAddress.trim(),
        password,
      });

      if (createdSignUp.status === "complete") {
        if (createdSignUp.createdSessionId) {
          await setActive({ session: createdSignUp.createdSessionId });
          router.push(redirectUrl);
          return;
        }
        setError("Registration completed but no active session was returned. Please sign in.");
        setIsExistingAccountConflict(true);
        return;
      }

      // Send the email verification code
      const targetSignUp =
        createdSignUp && typeof createdSignUp.prepareEmailAddressVerification === "function"
          ? createdSignUp
          : signUp;
      await targetSignUp.prepareEmailAddressVerification({ strategy: "email_code" });

      setSuccessMessage(`Verification code sent to ${emailAddress.trim()}`);
      setStep("verify-email");
    } catch (err: unknown) {
      const parsed = parseSignUpError(err);
      setStep("sign-up");
      setError(parsed.message);
      setIsExistingAccountConflict(parsed.isExistingAccountConflict);
      setSuccessMessage(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Verify Email Code
  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp || isLoading) return;

    setError(null);
    setSuccessMessage(null);
    setIsExistingAccountConflict(false);

    const cleanCode = verificationCode.replace(/[\s\-_—–]+/g, "");
    if (!cleanCode) {
      setError("Please enter the 6-digit verification code.");
      return;
    }

    setIsLoading(true);

    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: cleanCode,
      });

      const action = resolvePostVerificationAction(completeSignUp, username);

      if (action.type === "complete") {
        await setActive({ session: action.sessionId });
        router.push(redirectUrl);
        return;
      }

      if (action.type === "auto-apply-retained-username") {
        try {
          const updateTarget =
            completeSignUp && typeof completeSignUp.update === "function"
              ? completeSignUp
              : signUp;
          const updatedSignUp = await updateTarget.update({
            username: action.username,
          });

          if (updatedSignUp.status === "complete") {
            if (updatedSignUp.createdSessionId) {
              await setActive({ session: updatedSignUp.createdSessionId });
              router.push(redirectUrl);
              return;
            }
            setError("Registration completed but no active session was returned. Please sign in.");
            setIsExistingAccountConflict(true);
            return;
          }

          if (updatedSignUp.unverifiedFields?.includes("email_address")) {
            setStep("verify-email");
            setError("Please complete email verification before continuing.");
            return;
          }

          if (updatedSignUp.missingFields?.includes("username") || updatedSignUp.status === "missing_requirements") {
            setStep("complete-requirements");
          } else {
            setError("Additional registration requirements are pending. Please verify your details.");
          }
        } catch (updateErr: unknown) {
          const parsed = parseSignUpError(updateErr);
          setError(parsed.message);
          setIsExistingAccountConflict(parsed.isExistingAccountConflict);
          setSuccessMessage(null);
          setStep("complete-requirements");
        }
        return;
      }

      if (action.type === "prompt-username") {
        setStep("complete-requirements");
        return;
      }

      setError(action.error);
      if (action.isExistingAccountConflict) {
        setIsExistingAccountConflict(true);
      }
    } catch (err: unknown) {
      const parsed = parseSignUpError(err);
      setError(parsed.message);
      setIsExistingAccountConflict(parsed.isExistingAccountConflict);
      setSuccessMessage(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Complete missing requirements (e.g. setting username)
  const handleCompleteRequirements = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signUp || isLoading) return;

    setError(null);
    setSuccessMessage(null);
    setIsExistingAccountConflict(false);

    if (!username.trim() || username.trim().length < 3) {
      setError("Please choose a username with at least 3 characters.");
      return;
    }

    // Defensive guard: if email_address is unverified or identity unverified, route back to verify-email
    const isEmailVerified =
      signUp.verifications?.emailAddress?.status === "verified" ||
      signUp.verifications?.externalAccount?.status === "verified";
    const hasUnverifiedEmail =
      signUp.unverifiedFields?.includes("email_address") || !isEmailVerified;

    if (hasUnverifiedEmail) {
      try {
        const prepTarget =
          typeof signUp.prepareEmailAddressVerification === "function"
            ? signUp
            : undefined;
        if (prepTarget) {
          await prepTarget.prepareEmailAddressVerification({ strategy: "email_code" });
          setSuccessMessage(`Verification code sent to ${signUp.emailAddress || emailAddress || "your email"}`);
        }
        setStep("verify-email");
        return;
      } catch (prepErr: unknown) {
        const parsed = parseSignUpError(prepErr);
        setError(parsed.message);
        setIsExistingAccountConflict(parsed.isExistingAccountConflict);
        setSuccessMessage(null);
        return;
      }
    }

    setIsLoading(true);

    try {
      const updatedSignUp = await signUp.update({
        username: username.trim().toLowerCase(),
      });

      if (updatedSignUp.status === "complete") {
        if (updatedSignUp.createdSessionId) {
          await setActive({ session: updatedSignUp.createdSessionId });
          router.push(redirectUrl);
          return;
        }
        setError("Registration completed but no active session was returned. Please sign in.");
        setIsExistingAccountConflict(true);
      } else if (updatedSignUp.unverifiedFields?.includes("email_address")) {
        const targetSignUp =
          updatedSignUp && typeof updatedSignUp.prepareEmailAddressVerification === "function"
            ? updatedSignUp
            : signUp;
        await targetSignUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setSuccessMessage(`Verification code sent to ${updatedSignUp.emailAddress || emailAddress || "your email"}`);
        setStep("verify-email");
      } else {
        setError("Additional registration requirements are pending. Please verify your details.");
      }
    } catch (err: unknown) {
      const parsed = parseSignUpError(err);
      setError(parsed.message);
      setIsExistingAccountConflict(parsed.isExistingAccountConflict);
      setSuccessMessage(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Resend code
  const handleResendCode = async () => {
    if (!isLoaded || !signUp || isResending || isLoading) return;

    setIsResending(true);
    setError(null);
    setIsExistingAccountConflict(false);

    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setSuccessMessage("A fresh verification code has been sent to your email.");
    } catch (err: unknown) {
      const parsed = parseSignUpError(err);
      setError(parsed.message);
      setIsExistingAccountConflict(parsed.isExistingAccountConflict);
      setSuccessMessage(null);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Error notification */}
      {error && (
        <div className="mb-5 p-3.5 sm:p-4 bg-destructive/10 text-destructive text-sm rounded-2xl border border-destructive/20 flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
          <div className="space-y-1.5 leading-snug">
            <p>{error}</p>
            {isExistingAccountConflict && (
              <div>
                <Link
                  href={buildSignInHref(redirectUrl)}
                  className="font-semibold underline underline-offset-4 hover:opacity-80 inline-flex items-center gap-1"
                >
                  <span>Sign in to your account</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Success notification */}
      {successMessage && (
        <div className="mb-5 p-3.5 sm:p-4 bg-primary/10 text-primary text-sm rounded-2xl border border-primary/20 flex items-start gap-3 animate-in fade-in duration-200">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
          <span className="leading-snug">{successMessage}</span>
        </div>
      )}

      {/* STEP 1: Registration Form */}
      {step === "sign-up" && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Create your account
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {trialDays && trialDays > 0
                ? `Start your ${trialDays}-day free trial and access Clinic EZ workspaces.`
                : "Create an account to access Clinic EZ workspaces."}
            </p>
          </div>

          {/* Social Sign Up (Google) */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={isSocialLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 py-2.5 sm:py-3 px-4 rounded-xl border border-border bg-background hover:bg-muted/60 text-foreground text-sm font-semibold transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {isSocialLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <FcGoogle className="h-4 w-4 shrink-0" />
            )}
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-border w-full" />
            <span className="bg-card px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider absolute">
              or register with email
            </span>
          </div>

          <form onSubmit={handleSignUp} className="space-y-3.5">
            {/* Mount for Clerk v6 Smart CAPTCHA */}
            <div id="clerk-captcha" />

            {/* Name Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  First Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                    className="w-full rounded-xl border border-input bg-background/80 px-3.5 py-2 pl-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Last Name
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Smith"
                    className="w-full rounded-xl border border-input bg-background/80 px-3.5 py-2 pl-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Username Field */}
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Username
              </label>
              <div className="relative">
                <AtSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                  placeholder="janesmith"
                  className="w-full rounded-xl border border-input bg-background/80 px-3.5 py-2 pl-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  required
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Min. 3 characters (letters, numbers, underscores).</p>
            </div>

            {/* Email Field */}
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Work Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  autoComplete="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  placeholder="jane.smith@practice.com"
                  className="w-full rounded-xl border border-input bg-background/80 px-3.5 py-2 pl-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="space-y-1">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-xl border border-input bg-background/80 px-3.5 py-2 pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading || isSocialLoading}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-md shadow-primary/25 transition-all mt-3 cursor-pointer"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Creating account...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Create Account</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </form>

          {/* Footer link to Sign In */}
          <div className="text-center text-sm text-muted-foreground pt-1">
            Already have an account?{" "}
            <Link
              href={buildSignInHref(redirectUrl)}
              className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              Sign In
            </Link>
          </div>
        </div>
      )}

      {/* STEP 2: Email Verification */}
      {step === "verify-email" && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSuccessMessage(null);
                setIsExistingAccountConflict(false);
                setStep("sign-up");
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-3 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Edit details
            </button>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Verify your email
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              We sent a 6-digit code to <span className="font-semibold text-foreground">{emailAddress || signUp?.emailAddress || "your email"}</span>.
            </p>
          </div>

          <form onSubmit={handleVerifyEmail} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Verification Code
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  autoFocus
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-xl border border-input bg-background/80 px-4 py-2.5 pl-10 text-sm text-foreground tracking-widest placeholder:tracking-normal placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-md shadow-primary/25 transition-all mt-2 cursor-pointer"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying code...</span>
                </div>
              ) : (
                <span>Complete Registration</span>
              )}
            </Button>
          </form>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={handleResendCode}
              disabled={isResending}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline cursor-pointer disabled:opacity-50"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isResending ? "animate-spin" : ""}`} />
              <span>Resend verification code</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Complete Requirements (e.g. Setting Username) */}
      {step === "complete-requirements" && (
        <div className="space-y-5 animate-in fade-in duration-300">
          <div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSuccessMessage(null);
                setIsExistingAccountConflict(false);
                setStep("sign-up");
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-3 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to registration
            </button>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold mb-2">
              <Sparkles className="h-3.5 w-3.5" />
              Final Step
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Choose your username
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Clinic EZ requires a unique username for your practitioner profile.
            </p>
          </div>

          <form onSubmit={handleCompleteRequirements} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Username
              </label>
              <div className="relative">
                <AtSign className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
                  placeholder="janesmith"
                  className="w-full rounded-xl border border-input bg-background/80 px-4 py-2.5 pl-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                At least 3 characters. Only letters, numbers, underscores, or periods.
              </p>
            </div>

            <Button
              type="submit"
              disabled={isLoading || !username.trim()}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-md shadow-primary/25 transition-all mt-2 cursor-pointer"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Finalizing account...</span>
                </div>
              ) : (
                <span>Complete Registration</span>
              )}
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
