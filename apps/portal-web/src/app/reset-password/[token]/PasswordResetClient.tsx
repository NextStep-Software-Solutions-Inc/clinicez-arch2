"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { staffService, PortalPasswordResetDetailsDto } from "@/services/staff.service";
import { toast } from "sonner";

export default function PasswordResetClient({ token }: { token: string }) {
  const router = useRouter();
  const [details, setDetails] = useState<PortalPasswordResetDetailsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (!token || !token.trim()) {
      setError("Password reset token is missing or invalid.");
      setLoading(false);
      return;
    }

    const fetchDetails = async () => {
      try {
        const data = await staffService.getPasswordResetDetails(token);
        setDetails(data);
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || "Password reset link is invalid or has already been used.");
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);

    if (newPassword.trim().length < 8) {
      setActionError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setActionError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await staffService.completePasswordReset(token, newPassword);
      setCompleted(true);
      toast.success("Password updated! You can now sign in with your new password.");
    } catch (err: any) {
      setActionError(err.response?.data?.message || err.message || "Failed to update password. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      <div className="pointer-events-none absolute -top-24 left-1/4 w-[480px] h-[480px] rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 right-1/4 w-[480px] h-[480px] rounded-full bg-teal-500/10 blur-3xl" />

      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2.5 group">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/25">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-lg tracking-tight text-foreground leading-none">
              Clinic <span className="text-primary">EZ</span>
            </span>
            <span className="text-[11px] font-medium text-muted-foreground tracking-wider uppercase mt-0.5">
              Account Security
            </span>
          </div>
        </Link>
      </header>

      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-lg">
          {loading ? (
            <Card className="border-border/80 shadow-xl rounded-2xl">
              <CardContent className="py-16 flex flex-col items-center justify-center text-center gap-4">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-sm font-medium text-muted-foreground">Verifying password reset link...</p>
              </CardContent>
            </Card>
          ) : error || !details ? (
            <Card className="border-border/80 shadow-xl rounded-2xl overflow-hidden">
              <div className="h-1.5 bg-destructive w-full" />
              <CardContent className="pt-8 pb-6 px-8 text-center space-y-4">
                <div className="mx-auto w-14 h-14 bg-destructive/10 text-destructive rounded-2xl flex items-center justify-center">
                  <AlertCircle className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-xl font-bold text-foreground">Reset Link Unavailable</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {error || "This password reset link is invalid or has already been used."}
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/30 border-t border-border/60 px-8 py-4 flex justify-center">
                <Button asChild variant="outline" className="rounded-xl font-semibold">
                  <Link href="/sign-in">Go to Sign In</Link>
                </Button>
              </CardFooter>
            </Card>
          ) : details.isExpired ? (
            <Card className="border-border/80 shadow-xl rounded-2xl overflow-hidden">
              <div className="h-1.5 bg-warning w-full" />
              <CardContent className="pt-8 pb-6 px-8 text-center space-y-4">
                <div className="mx-auto w-14 h-14 bg-warning/10 text-warning rounded-2xl flex items-center justify-center">
                  <Clock className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-xl font-bold text-foreground">Password Reset Link Expired</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    This password reset link for <strong>{details.scopeName}</strong> has expired (valid for 7 days). Please ask your administrator to send a new reset link.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/30 border-t border-border/60 px-8 py-4 flex justify-center">
                <Button asChild variant="outline" className="rounded-xl font-semibold">
                  <Link href="/sign-in">Go to Sign In</Link>
                </Button>
              </CardFooter>
            </Card>
          ) : completed ? (
            <Card className="border-border/80 shadow-xl rounded-2xl overflow-hidden">
              <div className="h-1.5 bg-success w-full" />
              <CardContent className="pt-8 pb-6 px-8 text-center space-y-4">
                <div className="mx-auto w-14 h-14 bg-success/10 text-success rounded-2xl flex items-center justify-center">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <div className="space-y-1.5">
                  <h1 className="text-xl font-bold text-foreground">Password Updated</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    Your password for <strong>{details.email}</strong> has been updated. You can now sign in to <strong>{details.scopeName}</strong>.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="bg-muted/30 border-t border-border/60 px-8 py-4 flex justify-center">
                <Button onClick={() => router.push("/sign-in")} className="w-full rounded-xl font-semibold gap-2">
                  Continue to Sign In <ArrowRight className="w-4 h-4" />
                </Button>
              </CardFooter>
            </Card>
          ) : (
            <Card className="border-border/80 shadow-xl rounded-2xl overflow-hidden">
              <div className="h-1.5 bg-primary w-full" />
              <CardContent className="pt-8 pb-6 px-8 space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <KeyRound className="w-6 h-6" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-foreground">Set Your New Password</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Choose a new password for your Clinic EZ account.
                    </p>
                  </div>
                </div>

                <div className="rounded-xl bg-muted/40 border border-border/60 p-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Account</span>
                    <span className="font-semibold text-foreground">{details.fullName}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email</span>
                    <span className="text-muted-foreground">{details.email}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Organization</span>
                    <span className="font-medium text-foreground">{details.scopeName}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Role</span>
                    <Badge variant="secondary" className="text-xs">{details.role}</Badge>
                  </div>
                </div>

                {actionError && (
                  <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{actionError}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="new-password">New Password</Label>
                    <div className="relative">
                      <Input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="At least 8 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm-password">Confirm New Password</Label>
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Re-enter your new password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                    />
                  </div>

                  <Button type="submit" disabled={submitting} className="w-full rounded-xl font-semibold gap-2">
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Updating Password...
                      </>
                    ) : (
                      <>
                        Save New Password <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
