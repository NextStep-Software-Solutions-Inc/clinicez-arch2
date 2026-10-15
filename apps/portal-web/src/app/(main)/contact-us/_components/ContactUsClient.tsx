"use client";

import { useState } from "react";
import { CheckCircle2, Mail, MapPin, Phone } from "lucide-react";
import { siteEmails } from "@/config/site";

export function ContactUsClient() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

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
      const res = await fetch("/api/v1/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Unable to send your message right now.");
      }
      setSubmitSuccess(
        data.message || "Thank you for reaching out. Our team will respond within 1 business day."
      );
      setFirstName("");
      setLastName("");
      setEmail("");
      setMessage("");
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Unable to send your message right now.");
    } finally {
      setIsSubmitting(false);
    }
  };

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
        {/* Contact Info */}
        <div className="flex flex-col justify-center space-y-12">
          <div className="flex items-start">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mr-6 shrink-0">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">Our Headquarters</h3>
              <p className="text-muted-foreground leading-relaxed">
                San Juan 2, Sto Nino<br />
                Lapasan, Cagayan de Oro City<br />
                Misamis Oriental<br />
                Philippines 9000
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mr-6 shrink-0">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">Email Us</h3>
              <p className="text-muted-foreground leading-relaxed">
                {[siteEmails.contact, siteEmails.sales]
                  .filter((addr): addr is string => Boolean(addr))
                  .map((addr, index) => (
                    <span key={addr}>
                      {index > 0 && <br />}
                      {addr}
                    </span>
                  ))}
              </p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary mr-6 shrink-0">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-xl font-bold mb-2">Call Us</h3>
              <p className="text-muted-foreground leading-relaxed">
                +63 (965) 429-7640<br />
                Mon - Fri, 8am - 5pm (PHT)
              </p>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="rounded-3xl border border-border bg-card/50 backdrop-blur-xl p-8 shadow-2xl shadow-primary/5 relative">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {submitError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </div>
            )}
            {submitSuccess && (
              <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 text-sm text-foreground flex items-start gap-2.5">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <span>{submitSuccess}</span>
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

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8 py-2 disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Send Message"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

