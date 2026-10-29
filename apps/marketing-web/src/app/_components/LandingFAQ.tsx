import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function LandingFAQ() {
  const faqs = [
    {
      question: "How secure is patient data?",
      answer: "Clinic EZ employs bank-grade, end-to-end encryption for all data transfers. Our infrastructure is fully HIPAA-compliant, and we utilize strict role-based access controls to ensure that only authorized personnel can view sensitive health information."
    },
    {
      question: "Do you support PhilHealth eClaims and Yakap?",
      answer: "Yes! Generating compliant PhilHealth Yakap reports is built natively into our platform. We continually update our reporting modules to comply with the latest PhilHealth standards, saving you hours of administrative work."
    },
    {
      question: "How hard is it to migrate from our old system?",
      answer: "Migration is seamless. Our onboarding team provides a dedicated concierge service to securely import your existing patient records, schedules, and inventory into Clinic EZ with zero downtime for your clinic."
    },
    {
      question: "Can I manage multiple clinic branches?",
      answer: "Absolutely. Clinic EZ is built on a robust multi-tenant architecture. You can manage multiple clinics, laboratories, and pharmacies under a single, unified organizational dashboard."
    },
    {
      question: "Is there a mobile app for my patients?",
      answer: "Yes! We are launching native iOS and Android apps for both patients and healthcare providers. Patients can book appointments, view lab results, and manage their records directly from their phones."
    }
  ];

  return (
    <section className="py-24 px-6 lg:px-8 max-w-4xl mx-auto w-full relative z-10">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight mb-4">
          Frequently Asked Questions
        </h2>
        <p className="text-muted-foreground text-lg">
          Everything you need to know about migrating to Clinic EZ.
        </p>
      </div>

      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, i) => (
          <AccordionItem key={i} value={`item-${i}`} className="border-border/50">
            <AccordionTrigger className="text-left text-lg font-semibold hover:text-primary transition-colors">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground leading-relaxed text-base">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
