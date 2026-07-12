"use client";

import { useState } from "react";
import { Building2, User, Globe, ChevronRight, CheckCircle2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { tenantService } from "@/services/tenant.service";

export function TenantRegistrationClient() {
  const [step, setStep] = useState(1);
  const router = useRouter();

  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    clinicName: "",
    tenantSlug: "",
    facilityType: "Outpatient Clinic"
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    if (step < 3) setStep(step + 1);
  };

  const handleComplete = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await tenantService.registerTenant(formData);
      
      // Redirect to sign in page
      router.push("/sign-in?registered=true");
    } catch (err: any) {
      setError(err.message);
      setStep(1); // Go back to start if error
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen bg-background relative overflow-hidden">
      
      {/* Decorative background */}
      <div className="absolute top-0 right-0 w-[50%] h-full bg-gradient-to-l from-primary/5 to-transparent pointer-events-none -z-10" />

      <div className="flex w-full max-w-6xl mx-auto items-center justify-center p-6 lg:p-12">
        
        {/* Left Side: Info / Testimonial */}
        <div className="hidden lg:flex flex-col w-1/2 pr-16 justify-center">
          <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary mb-8 w-fit">
            Start Your Journey
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl mb-6">
            Welcome to the future of healthcare.
          </h1>
          <p className="text-lg text-muted-foreground mb-12">
            Join thousands of clinics and hospitals globally that trust Clinic EZ to manage their daily operations securely and efficiently.
          </p>

          <div className="flex flex-col space-y-6">
            <div className="flex items-center">
              <CheckCircle2 className="h-6 w-6 text-primary mr-4 shrink-0" />
              <span className="font-medium text-foreground">Secure HIPAA-compliant environment</span>
            </div>
            <div className="flex items-center">
              <CheckCircle2 className="h-6 w-6 text-primary mr-4 shrink-0" />
              <span className="font-medium text-foreground">Instant multi-tenant deployment</span>
            </div>
            <div className="flex items-center">
              <CheckCircle2 className="h-6 w-6 text-primary mr-4 shrink-0" />
              <span className="font-medium text-foreground">24/7 dedicated enterprise support</span>
            </div>
          </div>
        </div>

        {/* Right Side: Registration Wizard */}
        <div className="w-full lg:w-1/2">
          <div className="rounded-3xl border border-border bg-card/60 backdrop-blur-2xl p-8 lg:p-12 shadow-2xl shadow-primary/5">
            
            {/* Step Indicators */}
            <div className="flex items-center justify-between mb-10">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-colors ${
                    step >= i ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {i}
                  </div>
                  {i < 3 && (
                    <div className={`h-1 w-12 sm:w-24 mx-2 rounded-full transition-colors ${
                      step > i ? 'bg-primary' : 'bg-muted'
                    }`} />
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-600 text-sm rounded-md border border-red-200">
                {error}
              </div>
            )}

            {/* Step 1: Admin Details */}
            {step === 1 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2">Administrator Profile</h2>
                  <p className="text-sm text-muted-foreground">This will be the primary owner of the organization.</p>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">First Name</label>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                        <input type="text" value={formData.firstName} onChange={(e) => setFormData({...formData, firstName: e.target.value})} className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-primary" placeholder="John" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Last Name</label>
                      <input type="text" value={formData.lastName} onChange={(e) => setFormData({...formData, lastName: e.target.value})} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary" placeholder="Doe" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Professional Email</label>
                    <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary" placeholder="admin@clinic.com" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                      <input type="password" value={formData.password} onChange={(e) => setFormData({...formData, password: e.target.value})} className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-primary" placeholder="••••••••" />
                    </div>
                  </div>
                </div>

                <button onClick={handleNext} className="w-full mt-6 h-11 inline-flex items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  Continue <ChevronRight className="ml-2 h-4 w-4" />
                </button>
              </div>
            )}

            {/* Step 2: Organization Details */}
            {step === 2 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2">Organization Details</h2>
                  <p className="text-sm text-muted-foreground">Tell us about your healthcare facility.</p>
                </div>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Clinic / Hospital Name</label>
                    <div className="relative">
                      <Building2 className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                      <input type="text" value={formData.clinicName} onChange={(e) => setFormData({...formData, clinicName: e.target.value})} className="h-11 w-full rounded-md border border-input bg-background pl-10 pr-3 text-sm focus-visible:ring-2 focus-visible:ring-primary" placeholder="City General Hospital" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Tenant Slug (URL)</label>
                    <div className="relative flex items-center">
                      <Globe className="absolute left-3 h-5 w-5 text-muted-foreground" />
                      <span className="absolute left-10 text-sm text-muted-foreground">clinicez.net/</span>
                      <input type="text" value={formData.tenantSlug} onChange={(e) => setFormData({...formData, tenantSlug: e.target.value})} className="h-11 w-full rounded-md border border-input bg-background pl-[135px] pr-3 text-sm focus-visible:ring-2 focus-visible:ring-primary font-mono" placeholder="city-general" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Facility Type</label>
                    <select value={formData.facilityType} onChange={(e) => setFormData({...formData, facilityType: e.target.value})} className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-primary">
                      <option>Outpatient Clinic</option>
                      <option>Hospital</option>
                      <option>Laboratory</option>
                      <option>Pharmacy</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 mt-6">
                  <button onClick={() => setStep(1)} className="w-1/3 h-11 inline-flex items-center justify-center rounded-md border border-input bg-background text-sm font-medium hover:bg-muted transition-colors">
                    Back
                  </button>
                  <button onClick={handleNext} className="w-2/3 h-11 inline-flex items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                    Continue <ChevronRight className="ml-2 h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Finalization */}
            {step === 3 && (
              <div className="space-y-6 text-center animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex justify-center mb-6">
                  <div className="h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center">
                    {isLoading ? (
                      <div className="h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-10 w-10 text-emerald-600" />
                    )}
                  </div>
                </div>
                
                <h2 className="text-2xl font-bold mb-2">You are all set!</h2>
                <p className="text-sm text-muted-foreground mb-8">
                  Your tenant workspace is ready to be provisioned. By clicking complete, you agree to our Terms of Service and Privacy Policy.
                </p>

                <div className="flex gap-4 mt-6">
                  <button onClick={() => setStep(2)} disabled={isLoading} className="w-1/3 h-11 inline-flex items-center justify-center rounded-md border border-input bg-background text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50">
                    Back
                  </button>
                  <button onClick={handleComplete} disabled={isLoading} className="w-2/3 h-11 inline-flex items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {isLoading ? "Provisioning..." : "Provision Workspace"}
                  </button>
                </div>
              </div>
            )}

            <div className="mt-8 text-center text-sm text-muted-foreground">
              Already have an account? <Link href="/sign-in" className="font-semibold text-primary hover:underline">Log in</Link>
            </div>

          </div>
        </div>

      </div>
    </main>
  );
}
