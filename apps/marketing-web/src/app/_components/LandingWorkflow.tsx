import { Building2, UserPlus, CalendarCheck } from "lucide-react";

export function LandingWorkflow() {
  const steps = [
    {
      title: "1. Register Your Tenant",
      description: "Sign up and create your organization's unified workspace in minutes. Our onboarding wizard handles the rest.",
      icon: Building2,
    },
    {
      title: "2. Invite Your Staff",
      description: "Add doctors, nurses, and admins with secure, role-based access controls powered by our enterprise identity system.",
      icon: UserPlus,
    },
    {
      title: "3. Start Seeing Patients",
      description: "Begin scheduling appointments, conducting telehealth calls, and generating structured SOAP notes instantly.",
      icon: CalendarCheck,
    },
  ];

  return (
    <section className="py-24 px-6 lg:px-8 max-w-7xl mx-auto w-full relative z-10">
      <div className="text-center mb-20">
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
          How It Works
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Migrating your clinic shouldn't be a headache. We've streamlined the process so you can be up and running in three simple steps.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-12 md:gap-8 relative">
        {/* Connector Line for Desktop */}
        <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-border/50 z-0" />

        {steps.map((step, i) => {
          const Icon = step.icon;
          return (
            <div key={i} className="relative z-10 flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-background border-4 border-background flex items-center justify-center mb-8 shadow-xl shadow-primary/5">
                <div className="w-full h-full rounded-full bg-primary/10 flex items-center justify-center text-primary transition-transform hover:scale-110">
                  <Icon className="w-10 h-10" />
                </div>
              </div>
              <h3 className="text-2xl font-bold mb-3">{step.title}</h3>
              <p className="text-muted-foreground leading-relaxed">
                {step.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
