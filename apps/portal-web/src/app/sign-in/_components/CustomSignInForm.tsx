"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useSignIn } from "@clerk/nextjs";
import { 
  Mail, 
  Lock, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  KeyRound, 
  ArrowLeft,
  ShieldCheck,
  Smartphone,
  RotateCw
} from "lucide-react";
import { Button } from "@/components/ui/button";

type AuthStep = "sign-in" | "forgot-password" | "reset-password" | "second-factor";
type SecondFactorStrategy = "totp" | "phone_code" | "email_code" | "backup_code";

interface SecondFactorDescriptor {
  strategy: string;
  safeIdentifier?: string;
  phoneNumberId?: string;
  emailAddressId?: string;
  primary?: boolean;
  default?: boolean;
}

const SECOND_FACTOR_LABELS: Record<SecondFactorStrategy, string> = {
  totp: "Authenticator App",
  phone_code: "SMS Code",
  email_code: "Email Code",
  backup_code: "Backup Code",
};

export function CustomSignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect_url") || "/sync-auth";

  const { isLoaded, signIn, setActive } = useSignIn();

  const [step, setStep] = useState<AuthStep>("sign-in");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Forgot / Reset password state
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  // 2FA / MFA state
  const [secondFactorCode, setSecondFactorCode] = useState("");
  const [secondFactorStrategy, setSecondFactorStrategy] = useState<SecondFactorStrategy>("totp");
  const [availableSecondFactors, setAvailableSecondFactors] = useState<SecondFactorStrategy[]>(["totp"]);
  const [secondFactorTarget, setSecondFactorTarget] = useState<string | null>(null);
  const [isResendingSecondFactor, setIsResendingSecondFactor] = useState(false);
  const autoEnteredSignInIdRef = useRef<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const getErrorMessage = (err: any): string => {
    if (err?.errors && err.errors.length > 0) {
      const code = err.errors[0]?.code;
      const message = err.errors[0]?.longMessage || err.errors[0]?.message;

      if (code === "form_identifier_not_found" || code === "form_password_incorrect") {
        return "Incorrect email or password. Please check your credentials.";
      }
      if (code === "form_code_incorrect") {
        return "The verification code is incorrect. Please check and try again.";
      }
      if (code === "verification_expired") {
        return "The verification code has expired. Please request a new code.";
      }
      if (code === "too_many_attempts") {
        return "Too many failed attempts. Please wait a moment before trying again.";
      }
      if (code === "form_password_pwned") {
        return "This password has been compromised in a breach. Please choose a different password.";
      }
      return message || "An error occurred. Please try again.";
    }
    return err?.message || "Something went wrong. Please try again.";
  };

  const findFactorForStrategy = (
    factors: SecondFactorDescriptor[] | null | undefined,
    strategy: SecondFactorStrategy
  ): SecondFactorDescriptor | undefined => {
    if (!factors || factors.length === 0) return undefined;
    const matches = factors.filter((f) => f && f.strategy === strategy);
    if (matches.length === 0) return undefined;
    return (
      matches.find((f) => f.default === true) ??
      matches.find((f) => f.primary === true) ??
      matches[0]
    );
  };

  const getSafeIdentifierForStrategy = (
    factors: SecondFactorDescriptor[] | null | undefined,
    strategy: SecondFactorStrategy
  ): string | null => {
    const match = findFactorForStrategy(factors, strategy);
    return match?.safeIdentifier ?? null;
  };

  const prepareSecondFactorForStrategy = async (
    signInResource: NonNullable<typeof signIn>,
    factors: SecondFactorDescriptor[] | null | undefined,
    strategy: "phone_code" | "email_code"
  ) => {
    const factor = findFactorForStrategy(factors, strategy);
    if (strategy === "phone_code") {
      await signInResource.prepareSecondFactor({
        strategy: "phone_code",
        ...(factor?.phoneNumberId ? { phoneNumberId: factor.phoneNumberId } : {}),
      });
    } else {
      await signInResource.prepareSecondFactor({
        strategy: "email_code",
        ...(factor?.emailAddressId ? { emailAddressId: factor.emailAddressId } : {}),
      });
    }
  };

  const enterSecondFactorStep = async (signInResource: NonNullable<typeof signIn>) => {
    const rawFactors = (signInResource.supportedSecondFactors ?? []) as SecondFactorDescriptor[];
    const statusStr = signInResource.status as string | null;
    const priorityOrder: SecondFactorStrategy[] =
      statusStr === "needs_client_trust"
        ? ["email_code", "totp", "phone_code", "backup_code"]
        : ["totp", "phone_code", "email_code", "backup_code"];

    const supportedSet = new Set<SecondFactorStrategy>();
    for (const factor of rawFactors) {
      if (
        factor.strategy === "totp" ||
        factor.strategy === "phone_code" ||
        factor.strategy === "email_code" ||
        factor.strategy === "backup_code"
      ) {
        supportedSet.add(factor.strategy);
      }
    }

    const orderedStrategies = priorityOrder.filter((s) => supportedSet.has(s));
    const fallbackStrategy: SecondFactorStrategy =
      statusStr === "needs_client_trust" ? "email_code" : "totp";
    const resolvedStrategies: SecondFactorStrategy[] =
      orderedStrategies.length > 0 ? orderedStrategies : [fallbackStrategy];
    const initialStrategy = resolvedStrategies[0];

    autoEnteredSignInIdRef.current = signInResource.id || "active-mfa";
    setAvailableSecondFactors(resolvedStrategies);
    setSecondFactorStrategy(initialStrategy);
    setSecondFactorTarget(getSafeIdentifierForStrategy(rawFactors, initialStrategy));
    setSecondFactorCode("");
    setStep("second-factor");

    if (initialStrategy === "phone_code" || initialStrategy === "email_code") {
      try {
        await prepareSecondFactorForStrategy(signInResource, rawFactors, initialStrategy);
      } catch (err: any) {
        setError(getErrorMessage(err));
      }
    }
  };

  // Detect second-factor requirement when returning from OAuth SSO callback
  useEffect(() => {
    if (
      isLoaded &&
      signIn &&
      step === "sign-in" &&
      (signIn.status === "needs_second_factor" ||
        (signIn.status as string | null) === "needs_client_trust")
    ) {
      const signInKey = signIn.id || "active-mfa";
      if (autoEnteredSignInIdRef.current === signInKey) {
        return;
      }
      autoEnteredSignInIdRef.current = signInKey;
      void enterSecondFactorStep(signIn);
    }
  }, [isLoaded, signIn, step]);

  // Primary Email + Password Sign In
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    if (!identifier.trim()) {
      setError("Please enter your email or username.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn.create({
        identifier: identifier.trim(),
        password,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
      } else if (
        result.status === "needs_second_factor" ||
        (result.status as string | null) === "needs_client_trust"
      ) {
        await enterSecondFactorStep(result);
      } else if (result.status === "needs_first_factor") {
        setError("Additional authentication required. Please try again.");
      } else {
        setError(`Unexpected sign-in status: ${result.status}`);
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Google OAuth SSO
  const handleGoogleSignIn = async () => {
    if (!isLoaded || !signIn) return;

    setIsSocialLoading(true);
    setError(null);

    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: "/sign-in/sso-callback",
        redirectUrlComplete: redirectUrl,
      });
    } catch (err: any) {
      setError(getErrorMessage(err));
      setIsSocialLoading(false);
    }
  };

  // Step 1 of Password Reset: Request Code
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    if (!identifier.trim()) {
      setError("Please enter your email address to receive a reset code.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: identifier.trim(),
      });
      setSuccessMessage("A verification code has been sent to your email.");
      setStep("reset-password");
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2 of Password Reset: Submit Code & New Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    if (!resetCode.trim()) {
      setError("Please enter the verification code sent to your email.");
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: resetCode.trim(),
        password: newPassword,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
      } else if (
        result.status === "needs_second_factor" ||
        (result.status as string | null) === "needs_client_trust"
      ) {
        setSuccessMessage(null);
        await enterSecondFactorStep(result);
      } else {
        setError("Password reset incomplete. Please try again.");
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSwitchSecondFactorStrategy = async (nextStrategy: SecondFactorStrategy) => {
    if (
      !isLoaded ||
      !signIn ||
      nextStrategy === secondFactorStrategy ||
      isLoading ||
      isResendingSecondFactor
    ) {
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setSecondFactorCode("");
    setSecondFactorStrategy(nextStrategy);

    const rawFactors = (signIn.supportedSecondFactors ?? []) as SecondFactorDescriptor[];
    setSecondFactorTarget(getSafeIdentifierForStrategy(rawFactors, nextStrategy));

    if (nextStrategy === "phone_code" || nextStrategy === "email_code") {
      setIsResendingSecondFactor(true);
      try {
        await prepareSecondFactorForStrategy(signIn, rawFactors, nextStrategy);
        setSuccessMessage(
          nextStrategy === "phone_code"
            ? "A verification code has been sent via SMS."
            : "A verification code has been sent to your email."
        );
      } catch (err: any) {
        setError(getErrorMessage(err));
      } finally {
        setIsResendingSecondFactor(false);
      }
    }
  };

  const handleResendSecondFactor = async () => {
    if (
      !isLoaded ||
      !signIn ||
      (secondFactorStrategy !== "phone_code" && secondFactorStrategy !== "email_code") ||
      isResendingSecondFactor
    ) {
      return;
    }

    setIsResendingSecondFactor(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const rawFactors = (signIn.supportedSecondFactors ?? []) as SecondFactorDescriptor[];
      await prepareSecondFactorForStrategy(signIn, rawFactors, secondFactorStrategy);
      setSuccessMessage(
        secondFactorStrategy === "phone_code"
          ? "A fresh verification code has been sent via SMS."
          : "A fresh verification code has been sent to your email."
      );
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsResendingSecondFactor(false);
    }
  };

  // 2FA Verification Handler
  const handleSecondFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !signIn) return;

    if (!secondFactorCode.trim()) {
      setError("Please enter your verification code.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await signIn.attemptSecondFactor({
        strategy: secondFactorStrategy,
        code: secondFactorCode.trim(),
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.push(redirectUrl);
      } else {
        setError("Verification code incorrect or expired.");
      }
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Notifications / Errors */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 text-destructive text-sm rounded-2xl border border-destructive/20 flex items-start gap-3 animate-in fade-in duration-200">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5 text-destructive" />
          <span className="leading-snug">{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 p-4 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-sm rounded-2xl border border-emerald-500/20 flex items-start gap-3 animate-in fade-in duration-200">
          <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
          <span className="leading-snug">{successMessage}</span>
        </div>
      )}

      {/* STEP 1: Standard Sign In */}
      {step === "sign-in" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Sign in to Clinic EZ
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Access your clinical workspaces, patients, and portal services.
            </p>
          </div>

          {/* Social Sign In (Google) */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isSocialLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-border bg-background hover:bg-muted/60 text-foreground text-sm font-semibold transition-all shadow-sm active:scale-[0.99] disabled:opacity-50 cursor-pointer"
          >
            {isSocialLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>Continue with Google</span>
          </button>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-border w-full" />
            <span className="bg-card px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider absolute">
              or continue with email
            </span>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Email or Username
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="doctor@example.com"
                  className="w-full rounded-xl border border-input bg-background/80 px-4 py-2.5 pl-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setStep("forgot-password");
                  }}
                  className="text-xs font-medium text-primary hover:underline cursor-pointer"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl border border-input bg-background/80 px-4 py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading || isSocialLoading}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-md shadow-primary/25 transition-all mt-2 cursor-pointer"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Signing in...</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Sign In</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </Button>
          </form>

          {/* Footer link to Sign Up */}
          <div className="text-center text-sm text-muted-foreground pt-2">
            Don&apos;t have an account?{" "}
            <Link
              href="/sign-up"
              className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
            >
              Start your free trial
            </Link>
          </div>
        </div>
      )}

      {/* STEP 2: Forgot Password Request */}
      {step === "forgot-password" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSuccessMessage(null);
                setStep("sign-in");
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-4 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Sign In
            </button>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Reset Your Password
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              Enter your email address and we&apos;ll send you a verification code to reset your password.
            </p>
          </div>

          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="email"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="doctor@example.com"
                  className="w-full rounded-xl border border-input bg-background/80 px-4 py-2.5 pl-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
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
                  <span>Sending code...</span>
                </div>
              ) : (
                <span>Send Reset Code</span>
              )}
            </Button>
          </form>
        </div>
      )}

      {/* STEP 3: Submit Reset Code & New Password */}
      {step === "reset-password" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setSuccessMessage(null);
                setStep("forgot-password");
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground mb-4 transition-colors cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Change Email
            </button>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Create New Password
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              Check your inbox at <span className="font-semibold text-foreground">{identifier}</span> for your reset code.
            </p>
          </div>

          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Verification Code
              </label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="123456"
                  className="w-full rounded-xl border border-input bg-background/80 px-4 py-2.5 pl-10 text-sm text-foreground tracking-widest placeholder:tracking-normal placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full rounded-xl border border-input bg-background/80 px-4 py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3.5 top-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
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
                  <span>Updating password...</span>
                </div>
              ) : (
                <span>Reset & Sign In</span>
              )}
            </Button>
          </form>
        </div>
      )}

      {/* STEP 4: Two-Factor / MFA Screen */}
      {step === "second-factor" && (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {secondFactorStrategy === "totp" && "Two-Factor Authentication"}
              {secondFactorStrategy === "phone_code" && "SMS Verification Code"}
              {secondFactorStrategy === "email_code" && "Email Verification Code"}
              {secondFactorStrategy === "backup_code" && "Backup Code Verification"}
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5">
              {secondFactorStrategy === "totp" &&
                "Enter the 6-digit authentication code from your authenticator app to complete sign in."}
              {secondFactorStrategy === "phone_code" &&
                `Enter the 6-digit verification code sent via SMS${secondFactorTarget ? ` to ${secondFactorTarget}` : ""} to complete sign in.`}
              {secondFactorStrategy === "email_code" &&
                `Enter the 6-digit verification code sent${secondFactorTarget ? ` to ${secondFactorTarget}` : " to your email"} to complete sign in.`}
              {secondFactorStrategy === "backup_code" &&
                "Enter one of your single-use recovery backup codes to complete sign in."}
            </p>
          </div>

          <form onSubmit={handleSecondFactor} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {secondFactorStrategy === "backup_code" ? "Recovery Backup Code" : "Security Code"}
                </label>
                {(secondFactorStrategy === "phone_code" || secondFactorStrategy === "email_code") && (
                  <button
                    type="button"
                    onClick={handleResendSecondFactor}
                    disabled={isResendingSecondFactor || isLoading}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <RotateCw className={`h-3 w-3 ${isResendingSecondFactor ? "animate-spin" : ""}`} />
                    <span>Resend code</span>
                  </button>
                )}
              </div>
              <div className="relative">
                {secondFactorStrategy === "totp" && (
                  <ShieldCheck className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                )}
                {secondFactorStrategy === "phone_code" && (
                  <Smartphone className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                )}
                {secondFactorStrategy === "email_code" && (
                  <Mail className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                )}
                {secondFactorStrategy === "backup_code" && (
                  <KeyRound className="absolute left-3.5 top-3.5 h-4 w-4 text-muted-foreground" />
                )}
                <input
                  type="text"
                  autoFocus
                  inputMode={secondFactorStrategy === "backup_code" ? "text" : "numeric"}
                  autoComplete={secondFactorStrategy === "backup_code" ? "off" : "one-time-code"}
                  maxLength={secondFactorStrategy === "backup_code" ? 32 : 6}
                  value={secondFactorCode}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (secondFactorStrategy === "backup_code") {
                      setSecondFactorCode(val);
                    } else {
                      setSecondFactorCode(val.replace(/\D/g, "").slice(0, 6));
                    }
                  }}
                  placeholder={secondFactorStrategy === "backup_code" ? "Enter backup code" : "123456"}
                  className="w-full rounded-xl border border-input bg-background/80 px-4 py-2.5 pl-10 text-sm text-foreground tracking-widest placeholder:tracking-normal placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isLoading || isResendingSecondFactor || !secondFactorCode.trim()}
              className="w-full h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm shadow-md shadow-primary/25 transition-all mt-2 cursor-pointer"
            >
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Verifying...</span>
                </div>
              ) : (
                <span>Verify & Continue</span>
              )}
            </Button>

            {availableSecondFactors.length > 1 && (
              <div className="pt-2 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
                  Use another verification method
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availableSecondFactors.map((strategy) => {
                    const isActive = strategy === secondFactorStrategy;
                    return (
                      <button
                        key={strategy}
                        type="button"
                        disabled={isActive || isLoading || isResendingSecondFactor}
                        onClick={() => handleSwitchSecondFactorStrategy(strategy)}
                        className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                          isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background hover:bg-muted/60 text-foreground"
                        } disabled:opacity-60`}
                      >
                        {strategy === "totp" && <ShieldCheck className="h-3.5 w-3.5 shrink-0" />}
                        {strategy === "phone_code" && <Smartphone className="h-3.5 w-3.5 shrink-0" />}
                        {strategy === "email_code" && <Mail className="h-3.5 w-3.5 shrink-0" />}
                        {strategy === "backup_code" && <KeyRound className="h-3.5 w-3.5 shrink-0" />}
                        <span>{SECOND_FACTOR_LABELS[strategy]}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                autoEnteredSignInIdRef.current = signIn?.id || "active-mfa";
                setError(null);
                setSuccessMessage(null);
                setSecondFactorCode("");
                setStep("sign-in");
              }}
              className="w-full text-center text-xs font-medium text-muted-foreground hover:text-foreground pt-2 cursor-pointer"
            >
              Cancel and sign in with a different account
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
