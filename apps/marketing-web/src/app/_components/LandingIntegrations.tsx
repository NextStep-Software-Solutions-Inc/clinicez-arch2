export function LandingIntegrations() {
  const partners = [
    "PhilHealth", "Maxicare", "Intellicare", "GCash", "PayMongo", "Maya", 
    "Healthway", "Medicard", "Hi-Precision", "Watsons", "Mercury Drug",
    "PhilHealth", "Maxicare", "Intellicare", "GCash", "PayMongo", "Maya", 
    "Healthway", "Medicard", "Hi-Precision", "Watsons", "Mercury Drug"
  ];

  return (
    <section className="py-16 border-y border-border/10 bg-muted/20 overflow-hidden relative">
      <div className="absolute inset-y-0 left-0 w-16 md:w-48 bg-gradient-to-r from-background to-transparent z-10" />
      <div className="absolute inset-y-0 right-0 w-16 md:w-48 bg-gradient-to-l from-background to-transparent z-10" />
      
      <div className="text-center mb-10 text-sm font-semibold text-muted-foreground tracking-widest uppercase">
        Seamlessly integrates with your favorite providers
      </div>
      
      <style>{`
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee-custom {
          animation: marquee 40s linear infinite;
        }
      `}</style>
      <div className="flex w-max animate-marquee-custom">
        {partners.map((partner, i) => (
          <div key={i} className="mx-8 md:mx-12 flex items-center justify-center opacity-40 hover:opacity-100 transition-opacity cursor-default">
            <span className="text-2xl md:text-3xl font-extrabold tracking-tighter text-foreground whitespace-nowrap">
              {partner}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
