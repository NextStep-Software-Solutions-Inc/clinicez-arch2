"use client";

import { useState, useEffect } from "react";
import { Building2, User, Globe, ChevronRight, CheckCircle2, Lock, Sparkles, ShieldCheck, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser, useAuth } from "@clerk/nextjs";
import { tenantService } from "@/services/tenant.service";
import { apiErrorCode, apiErrorMessage } from "@/lib/apiError";
import { getConsoleBaseDomain } from "@/utils/domain";

export function TenantRegistrationClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planParam = searchParams.get("plan");
  const billingParam = searchParams.get("billing");
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken } = useAuth();

  const baseDomain = getConsoleBaseDomain() || (typeof window !== "undefined" ? window.location.host : "");
  const domainPrefix = baseDomain ? `${baseDomain}/` : "/";

  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    name: "",
    tenantSlug: "",
    tenantType: "Workplace",
  });

  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingWorkspace, setExistingWorkspace] = useState<{ slug: string; name: string } | null>(null);

  // When signed in, auto-fill credentials from Clerk profile
  useEffect(() => {
    if (isSignedIn && user) {
      setFormData((prev) => ({
        ...prev,
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.primaryEmailAddress?.emailAddress || "",
      }));
    }
  }, [isSignedIn, user]);

  // Generate slug suggestion from name
  const handleNameChange = (val: string) => {
    const updated: { name: string; tenantSlug?: string } = { name: val };
    if (!slugManuallyEdited) {
      const generatedSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      updated.tenantSlug = generatedSlug;
    }
    setFormData((prev) => ({ ...prev, ...updated }));
  };

  const handleAuthenticatedSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!formData.name.trim()) {
      setError("Please enter a workplace or entity name.");
      return;
    }
    if (!formData.tenantSlug.trim()) {
      setError("Please enter a workspace URL slug.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const token = await getToken();
      await tenantService.createTenant(
        {
          name: formData.name.trim(),
          tenantSlug: formData.tenantSlug.trim().toLowerCase(),
          tenantType: formData.tenantType,
          firstName: user?.firstName || undefined,
          lastName: user?.lastName || undefined,
          email: user?.primaryEmailAddress?.emailAddress || undefined,
        },
        token
      );

      // Route authenticated user directly to their new workplace dashboard (or billing if a plan was chosen)
      const targetSlug = formData.tenantSlug.trim().toLowerCase();
      const destination = planParam
        ? `/${targetSlug}/dashboard/billing?plan=${encodeURIComponent(planParam)}${
            billingParam ? `&billing=${encodeURIComponent(billingParam)}` : ""
          }`
        : `/${targetSlug}/dashboard`;
      router.push(destination);
    } catch (err: unknown) {
      if (apiErrorCode(err) === "owner_already_has_workspace" && user) {
        const owned = await tenantService
          .getTenantByOwner(user.id, await getToken())
          .catch(() => null);
        if (owned) {
          setExistingWorkspace({ slug: owned.tenantSlug, name: owned.name || owned.tenantSlug });
          return;
        }
      }
      setError(apiErrorMessage(err, "Failed to create workplace. Please try again."));
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnonymousRegister = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await tenantService.registerTenant({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        name: formData.name,
        tenantSlug: formData.tenantSlug.toLowerCase(),
        tenantType: formData.tenantType,
      });

      router.push("/sign-in?registered=true");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "Failed to register workplace."));
      setStep(1);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isLoaded) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-sm font-medium text-muted-foreground">Loading setup...</p>
        </div>
      </main>
    );
  }

  if (existingWorkspace) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card/70 p-8 text-center shadow-2xl shadow-primary/5 space-y-5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">You already own a workspace</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Each account can own one workspace, and yours is <strong className="text-foreground">{existingWorkspace.name}</strong>. Add more
            clinics, laboratories and pharmacies inside it, or hand it over to someone else before starting a new one.
          </p>
          <Link
            href={`/${existingWorkspace.slug}/dashboard`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            Open {existingWorkspace.name}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen bg-background relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-[50%] h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none -z-10" />

      <div className="flex w-full max-w-6xl mx-auto items-center justify-center px-3 py-6 sm:px-6 sm:py-8 lg:p-12">
        {/* Left Side: Context / Info */}
        <div className="hidden lg:flex flex-col w-1/2 pr-16 justify-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary mb-8 w-fit">
            <Sparkles className="h-4 w-4" />
            {isSignedIn ? "Workplace Setup" : "Start Your Journey"}
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-6">
            {isSignedIn ? "Set up your clinical workplace." : "Welcome to the future of healthcare."}
          </h1>
          <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
            {isSignedIn
              ? "A workplace is your primary entity, personal practice, or account. Once your workplace is ready, you can configure individual clinics, laboratories, pharmacies, and organizations inside."
              : "Join thousands of healthcare practitioners and medical workplaces that trust Clinic EZ to power their operations securely."}
          </p>

          <div className="flex flex-col space-y-5">
            <div className="flex items-center">
              <CheckCircle2 className="h-5 w-5 text-primary mr-3.5 shrink-0" />
              <span className="font-medium text-foreground">Complete workspace isolation & multi-tenancy</span>
            </div>
            <div className="flex items-center">
              <CheckCircle2 className="h-5 w-5 text-primary mr-3.5 shrink-0" />
              <span className="font-medium text-foreground">Add and manage multiple operational facilities inside</span>
            </div>
            <div className="flex items-center">
              <CheckCircle2 className="h-5 w-5 text-primary mr-3.5 shrink-0" />
              <span className="font-medium text-foreground">Enterprise HIPAA and HL7 FHIR compliance ready</span>
            </div>
          </div>
        </div>

        {/* Right Side: Setup Wizard / Form */}
        <div className="w-full lg:w-1/2">
          <div className="rounded-2xl sm:rounded-3xl border border-border bg-card/70 backdrop-blur-2xl p-4 sm:p-8 lg:p-12 shadow-2xl shadow-primary/5">
            {error && (
              <div className="mb-6 p-4 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20 animate-in fade-in duration-200">
                {error}
              </div>
            )}

            {/* FLOW A: AUTHENTICATED USER (The Primary Hardened Path) */}
            {isSignedIn ? (
              <div className="space-y-6 animate-in fade-in duration-300">
                {/* User identity badge */}
                <div className="flex items-center justify-between gap-2 p-3 sm:p-3.5 bg-primary/5 rounded-2xl border border-primary/15 mb-2">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center text-primary font-bold text-sm shrink-0 overflow-hidden">
                      {user?.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={user.imageUrl} alt={user.fullName || "User"} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        (user?.firstName?.[0] || "U").toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-foreground truncate">
                          {user?.fullName || user?.firstName || "Healthcare Administrator"}
                        </span>
                        <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {user?.primaryEmailAddress?.emailAddress}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 px-2.5 py-0.5 rounded-full shrink-0">
                    Verified
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl font-bold tracking-tight mb-1">Set Up Your Workplace</h2>
                  <p className="text-xs text-muted-foreground">
                    Define your entity or personal workplace. You can create individual clinics inside later.
                  </p>
                </div>

                <form onSubmit={handleAuthenticatedSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Workplace / Entity Name
                    </label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleNameChange(e.target.value)}
                        className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                        placeholder="e.g. Dr. Jane Smith Practice"
                        required
                        disabled={isLoading}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Workspace URL Identifier
                    </label>
                    <div className="flex items-center rounded-xl border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary">
                      <span className="flex items-center gap-1.5 pl-3 pr-2 text-xs sm:text-sm font-medium text-muted-foreground bg-muted/30 h-11 border-r border-input/60 select-none shrink-0">
                        <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{domainPrefix}</span>
                      </span>
                      <input
                        type="text"
                        value={formData.tenantSlug}
                        onChange={(e) => {
                          setSlugManuallyEdited(true);
                          setFormData({ ...formData, tenantSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") });
                        }}
                        className="h-11 flex-1 bg-transparent px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-w-0"
                        placeholder="my-workplace"
                        required
                        disabled={isLoading}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      This will be your permanent workplace URL link.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Entity Classification
                    </label>
                    <select
                      value={formData.tenantType}
                      onChange={(e) => setFormData({ ...formData, tenantType: e.target.value })}
                      className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                      disabled={isLoading}
                    >
                      <option value="Workplace">Workplace / Medical Practice</option>
                      <option value="Person">Individual Practitioner / Person</option>
                      <option value="Entity">Healthcare Entity / Enterprise Group</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-4 h-11 inline-flex items-center justify-center rounded-xl bg-primary px-8 text-sm font-bold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
                  >
                    {isLoading ? (
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                        <span>Provisioning Workplace...</span>
                      </div>
                    ) : (
                      <>
                        Provision Workplace <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              /* FLOW B: UNCONNECTED VISITOR (Provide Quick Sign-up / Sign-in or Multi-step Form) */
              <div>
                {/* Step Indicators */}
                <div className="flex items-center justify-between mb-8">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                          step >= i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {i}
                      </div>
                      {i < 3 && (
                        <div
                          className={`h-1 w-12 sm:w-20 mx-2 rounded-full transition-colors ${
                            step > i ? "bg-primary" : "bg-muted"
                          }`}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Step 1: Admin User Account Details */}
                {step === 1 && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">Create Your Account</h2>
                      <p className="text-sm text-muted-foreground">
                        Set up your administrator credentials for your new workplace.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-muted-foreground uppercase">First Name</label>
                          <div className="relative">
                            <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                            <input
                              type="text"
                              value={formData.firstName}
                              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                              className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                              placeholder="Jane"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-muted-foreground uppercase">Last Name</label>
                          <input
                            type="text"
                            value={formData.lastName}
                            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                            placeholder="Smith"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase">Professional Email</label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                          placeholder="admin@practice.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                          <input
                            type="password"
                            value={formData.password}
                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                            placeholder="••••••••"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!formData.firstName || !formData.email || !formData.password) {
                          setError("Please complete all profile fields.");
                          return;
                        }
                        setError(null);
                        setStep(2);
                      }}
                      className="w-full mt-4 h-11 inline-flex items-center justify-center rounded-xl bg-primary px-8 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Continue <ChevronRight className="ml-2 h-4 w-4" />
                    </button>
                  </div>
                )}

                {/* Step 2: Workplace Details */}
                {step === 2 && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div>
                      <h2 className="text-2xl font-bold mb-1">Workplace Details</h2>
                      <p className="text-sm text-muted-foreground">
                        Define your primary entity or practice workplace.
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase">Workplace / Entity Name</label>
                        <div className="relative">
                          <Building2 className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                          <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => handleNameChange(e.target.value)}
                            className="h-11 w-full rounded-xl border border-input bg-background pl-10 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                            placeholder="e.g. Apex Health Partners"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase">Workspace URL Identifier</label>
                        <div className="flex items-center rounded-xl border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-primary">
                          <span className="flex items-center gap-1.5 pl-3 pr-2 text-xs sm:text-sm font-medium text-muted-foreground bg-muted/30 h-11 border-r border-input/60 select-none shrink-0">
                            <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span>{domainPrefix}</span>
                          </span>
                          <input
                            type="text"
                            value={formData.tenantSlug}
                            onChange={(e) => {
                              setSlugManuallyEdited(true);
                              setFormData({ ...formData, tenantSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") });
                            }}
                            className="h-11 flex-1 bg-transparent px-3 text-sm font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none min-w-0"
                            placeholder="apex-health"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-muted-foreground uppercase">Entity Classification</label>
                        <select
                          value={formData.tenantType}
                          onChange={(e) => setFormData({ ...formData, tenantType: e.target.value })}
                          className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                        >
                          <option value="Workplace">Workplace / Medical Practice</option>
                          <option value="Person">Individual Practitioner / Person</option>
                          <option value="Entity">Healthcare Entity / Enterprise Group</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex gap-4 mt-6">
                      <button
                        type="button"
                        onClick={() => setStep(1)}
                        className="w-1/3 h-11 inline-flex items-center justify-center rounded-xl border border-input bg-background text-sm font-medium hover:bg-muted transition-colors"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!formData.name || !formData.tenantSlug) {
                            setError("Please enter your workplace name and URL slug.");
                            return;
                          }
                          setError(null);
                          setStep(3);
                        }}
                        className="w-2/3 h-11 inline-flex items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        Continue <ChevronRight className="ml-2 h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Confirmation */}
                {step === 3 && (
                  <div className="space-y-6 text-center animate-in fade-in duration-300">
                    <div className="flex justify-center mb-6">
                      <div className="h-20 w-20 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center">
                        {isLoading ? (
                          <div className="h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-10 w-10 text-emerald-600 dark:text-emerald-400" />
                        )}
                      </div>
                    </div>

                    <h2 className="text-2xl font-bold mb-2">Ready to provision!</h2>
                    <p className="text-sm text-muted-foreground mb-6">
                      Your workplace <strong className="text-foreground">{formData.name}</strong> will be created at{" "}
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                        {domainPrefix}{formData.tenantSlug}
                      </code>
                      .
                    </p>

                    <div className="flex gap-4 mt-6">
                      <button
                        type="button"
                        onClick={() => setStep(2)}
                        disabled={isLoading}
                        className="w-1/3 h-11 inline-flex items-center justify-center rounded-xl border border-input bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        onClick={handleAnonymousRegister}
                        disabled={isLoading}
                        className="w-2/3 h-11 inline-flex items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                      >
                        {isLoading ? "Provisioning..." : "Provision Workplace"}
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-8 text-center text-sm text-muted-foreground">
                  Already have an account?{" "}
                  <Link href="/sign-in" className="font-semibold text-primary hover:underline">
                    Log in
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
