"use client";

import React, { useState, useRef } from "react";
import { toast } from "sonner";
import { Loader2, CheckCircle2 } from "lucide-react";
import { getPortalApiUrl } from "@/utils/domain";
import { TurnstileWidget, TurnstileWidgetHandle } from "@/components/turnstile/TurnstileWidget";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      toast.error("Please enter your email address.");
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    try {
      setLoading(true);
      const res = await fetch(`${getPortalApiUrl()}/public/newsletter`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: cleanEmail,
          source: "footer",
          turnstileToken: turnstileToken || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setSubscribed(true);
        setEmail("");
        setTurnstileToken(null);
        turnstileRef.current?.reset();
        toast.success(data.message || "Thank you for subscribing to Clinic EZ updates!");
      } else {
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        toast.error(data.message || "Unable to subscribe. Please try again later.");
      }
    } catch {
      turnstileRef.current?.reset();
      setTurnstileToken(null);
      toast.error("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  if (subscribed) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm font-medium animate-in fade-in">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>You're subscribed to Clinic EZ updates!</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full max-w-sm">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 w-full">
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          aria-label="Email for newsletter subscription"
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60 transition-colors"
        />
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center justify-center h-10 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors shrink-0 shadow-sm shadow-primary/20 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              Joining...
            </>
          ) : (
            "Subscribe"
          )}
        </button>
      </form>
      <div className="w-full flex justify-start">
        <TurnstileWidget
          ref={turnstileRef}
          action="newsletter_signup"
          size="compact"
          onSuccess={(token) => setTurnstileToken(token)}
          onExpire={() => setTurnstileToken(null)}
          onError={() => setTurnstileToken(null)}
        />
      </div>
    </div>
  );
}
