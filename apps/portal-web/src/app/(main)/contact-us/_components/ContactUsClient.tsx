"use client";

import { useEffect, useState, useRef } from "react";
import { Check, CheckCircle2, Copy, Loader2, Mail, MapPin, Phone } from "lucide-react";
import { siteEmails } from "@/config/site";
import { getPortalApiUrl } from "@/utils/domain";
import { TurnstileWidget, TurnstileWidgetHandle } from "@/components/turnstile/TurnstileWidget";

interface PublicContactInfo {
  headquartersAddress: string;
  supportEmail: string;
  salesEmail: string;
  phoneNumber: string;
  operatingHours: string;
}

const DEFAULT_CONTACT_INFO: PublicContactInfo = {
  headquartersAddress:
    "San Juan 2, Sto Nino\nLapasan, Cagayan de Oro City\nMisamis Oriental\nPhilippines 9000",
  supportEmail: siteEmails.support || "support@clinicez.com",
  salesEmail: siteEmails.sales || "sales@clinicez.com",
  phoneNumber: "+63 (965) 429-7640",
  operatingHours: "Mon - Fri, 8am - 5pm (PHT)",
};

export function ContactUsClient() {
  const [contactInfo, setContactInfo] = useState<PublicContactInfo>(DEFAULT_CONTACT_INFO);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadContactInfo() {
      try {
        const res = await fetch(`${getPortalApiUrl()}/contact/info`, {
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data) {
            setContactInfo({
              headquartersAddress: data.headquartersAddress || DEFAULT_CONTACT_INFO.headquartersAddress,
              supportEmail: data.supportEmail || DEFAULT_CONTACT_INFO.supportEmail,
              salesEmail: data.salesEmail || DEFAULT_CONTACT_INFO.salesEmail,
              phoneNumber: data.phoneNumber || DEFAULT_CONTACT_INFO.phoneNumber,
              operatingHours: data.operatingHours || DEFAULT_CONTACT_INFO.operatingHours,
            });
          }
        }
      } catch {
        // Fall back gracefully to DEFAULT_CONTACT_INFO
      } finally {
        if (isMounted) setLoadingInfo(false);
      }
    }
    loadContactInfo();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleCopy = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (!firstName.trim() || !lastName.trim() || !email.trim() || !message.trim()) {
      setSubmitError("Please fill in your name, email address, and message.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`${getPortalApiUrl()}/contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          name: `${firstName} ${lastName}`.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          message: message.trim(),
          turnstileToken: turnstileToken || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        turnstileRef.current?.reset();
        setTurnstileToken(null);
        throw new Error(data.message || "Unable to send your message right now.");
      }
      setSubmitSuccess(
        data.message || "Thank you for reaching out. Our team will respond within 1 business day."
      );
      setFirstName("");
      setLastName("");
      setEmail("");
      setMessage("");
      setTurnstileToken(null);
      turnstileRef.current?.reset();
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Unable to send your message right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayEmails = Array.from(
    new Set([contactInfo.supportEmail, contactInfo.salesEmail].filter(Boolean))
  );

  return (
    <main className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      <div className="absolute top-0 right-[-10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px] pointer-events-none -z-10" />

      <section className="pt-32 pb-16 px-6 lg:px-8 text-center max-w-3xl mx-auto">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl mb-6">
          Get in touch.
        </h1>
        <p className="text-lg text-muted-foreground">
          Have a question about Clinic EZ? Our team is here to help you modernize your healthcare practice.
        </p>
      </section>

      <section className="py-12 px-6 lg:px-8 max-w-6xl mx-auto w-full grid md:grid-cols-2 gap-12 lg:gap-24 mb-24">
        {/* Contact Info (Direct Channels) */}
        <div className="flex flex-col justify-center space-y-12">
          {/* Headquarters */}
          <div className="flex items-start">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mr-6 shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold mb-2">Our Headquarters</h3>
              {loadingInfo ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 w-48 bg-muted rounded" />
                  <div className="h-4 w-56 bg-muted rounded" />
                  <div className="h-4 w-40 bg-muted rounded" />
                </div>
              ) : (
                <p className="text-muted-foreground leading-relaxed">
                  {contactInfo.headquartersAddress.split("\n").map((line, idx) => (
                    <span key={idx}>
                      {idx > 0 && <br />}
                      {line}
                    </span>
                  ))}
                </p>
              )}
            </div>
          </div>

          {/* Email Us */}
          <div className="flex items-start">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mr-6 shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold mb-2">Email Us</h3>
              {loadingInfo ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-4 w-44 bg-muted rounded" />
                  <div className="h-4 w-40 bg-muted rounded" />
                </div>
              ) : (
                <div className="space-y-2">
                  {displayEmails.map((addr) => {
                    const isCopied = copiedKey === addr;
                    return (
                      <div key={addr} className="flex items-center gap-2">
                        <a
                          href={`mailto:${addr}?subject=Clinic%20EZ%20Inquiry`}
                          className="text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
                        >
                          {addr}
                        </a>
                        <button
                          type="button"
                          onClick={() => handleCopy(addr, addr)}
                          title="Copy email address"
                          className="inline-flex items-center justify-center p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                        >
                          {isCopied ? (
                            <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        {isCopied && (
                          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                            Copied
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Phone */}
          <div className="flex items-start">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mr-6 shrink-0">
              <Phone className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xl font-bold mb-2">Call Us</h3>
              {loadingInfo ? (
                <div className="h-4 w-36 bg-muted rounded animate-pulse" />
              ) : (
                <a
                  href={`tel:${contactInfo.phoneNumber.replace(/[^+\d]/g, "")}`}
                  className="text-muted-foreground hover:text-primary transition-colors"
                >
                  {contactInfo.phoneNumber}
                </a>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                {contactInfo.operatingHours}
              </p>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="bg-card border border-border/60 rounded-2xl p-8 sm:p-10 shadow-sm relative">
          <h2 className="text-2xl font-bold mb-2">Send us a message</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Fill out the form below and we will get back to you shortly.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {submitSuccess && (
              <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                <span>{submitSuccess}</span>
              </div>
            )}

            {submitError && (
              <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {submitError}
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="firstName" className="text-sm font-medium text-foreground">First name</label>
                <input
                  id="firstName"
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="John"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-medium text-foreground">Last name</label>
                <input
                  id="lastName"
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Doe"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-foreground">Email address</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="john@clinic.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="message" className="text-sm font-medium text-foreground">Message</label>
              <textarea
                id="message"
                rows={5}
                required
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="How can we help you today?"
              />
            </div>

            <TurnstileWidget
              ref={turnstileRef}
              action="contact_us"
              onSuccess={(token) => setTurnstileToken(token)}
              onExpire={() => setTurnstileToken(null)}
              onError={() => setTurnstileToken(null)}
            />

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 py-2 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Message"
              )}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
