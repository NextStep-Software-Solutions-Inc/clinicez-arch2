import dynamicIconImports from "lucide-react/dynamicIconImports";

export type ModuleFeature = {
    title: string;
    description: string;
    icon: keyof typeof dynamicIconImports;
};

export type ModuleBenefit = {
    title: string;
    description: string;
    icon: keyof typeof dynamicIconImports;
};

export type Product = {
    id: string;
    slug: string;
    title: string;
    description: string;
    icon: keyof typeof dynamicIconImports;
    primaryColor: string;
    features: ModuleFeature[];
    benefits: ModuleBenefit[];
};

export const products: Product[] = [
    {
        id: "emr",
        slug: "emr",
        title: "Patient Management (EMR)",
        description: "Centralized electronic medical records with complete patient history, allergies, and ongoing treatments accessible instantly.",
        icon: "users",
        primaryColor: "primary",
        features: [
            {
                title: "Complete Patient History",
                description: "Access a unified timeline of every patient interaction, diagnosis, and treatment plan in one place.",
                icon: "history",
            },
            {
                title: "Allergy & Alert Tracking",
                description: "Automatically flag critical allergies and medical conditions to ensure patient safety across all encounters.",
                icon: "alert-triangle",
            },
            {
                title: "Document Management",
                description: "Securely upload and associate lab results, imaging reports, and external medical records directly to the patient's file.",
                icon: "folder",
            },
            {
                title: "Family Linking",
                description: "Group family members together to streamline pediatric care and shared billing workflows.",
                icon: "network",
            }
        ],
        benefits: [
            {
                title: "Reduce Errors",
                description: "Having all information in one place drastically reduces the chance of misdiagnosis or adverse drug interactions.",
                icon: "shield-check",
            },
            {
                title: "Save Time",
                description: "Stop hunting for paper charts. Instantly pull up records from anywhere, securely.",
                icon: "clock",
            }
        ]
    },
    {
        id: "scheduling",
        slug: "scheduling",
        title: "Smart Scheduling",
        description: "Automated appointment booking, conflict resolution, and SMS reminders to drastically reduce patient no-shows.",
        icon: "calendar-days",
        primaryColor: "emerald-500",
        features: [
            {
                title: "Online Booking Portal",
                description: "Allow patients to book their own appointments 24/7 through a secure, brandable patient portal.",
                icon: "globe",
            },
            {
                title: "Automated Reminders",
                description: "Send automated SMS and email reminders customized to your clinic's workflow to minimize no-shows.",
                icon: "bell",
            },
            {
                title: "Multi-Provider Calendars",
                description: "Manage complex schedules across multiple doctors, rooms, and equipment with drag-and-drop ease.",
                icon: "users-2",
            },
            {
                title: "Waitlist Management",
                description: "Automatically notify patients on your waitlist when an earlier slot opens up.",
                icon: "list",
            }
        ],
        benefits: [
            {
                title: "Maximize Revenue",
                description: "Keep your calendar full and reduce costly no-shows with smart waitlists and automated reminders.",
                icon: "trending-up",
            },
            {
                title: "Enhance Patient Experience",
                description: "Give patients the convenience of booking their own appointments without playing phone tag.",
                icon: "heart",
            }
        ]
    },
    {
        id: "prescriptions",
        slug: "prescriptions",
        title: "E-Prescriptions",
        description: "Digitally sign and send prescriptions directly to partnered pharmacies or print them with QR validation.",
        icon: "syringe",
        primaryColor: "blue-500",
        features: [
            {
                title: "Digital Signatures",
                description: "Legally compliant digital signatures allowing you to prescribe medications from anywhere.",
                icon: "pen-tool",
            },
            {
                title: "Pharmacy Integration",
                description: "Send prescriptions directly to partnered pharmacies to streamline patient fulfillment.",
                icon: "store",
            },
            {
                title: "Drug Interaction Checks",
                description: "Automatic alerts for potential drug-to-drug or drug-to-allergy interactions before you finalize.",
                icon: "shield-alert",
            },
            {
                title: "Prescription History",
                description: "Quickly view past prescriptions and issue one-click refills for chronic care patients.",
                icon: "rotate-cw",
            }
        ],
        benefits: [
            {
                title: "Improve Safety",
                description: "Eliminate handwriting errors and automatically check for dangerous interactions.",
                icon: "shield-check",
            },
            {
                title: "Faster Workflow",
                description: "Save minutes per patient by utilizing customizable prescription templates and one-click refills.",
                icon: "zap",
            }
        ]
    },
    {
        id: "billing",
        slug: "billing",
        title: "Billing & Invoicing",
        description: "Integrated financial module supporting multi-currency, PhilHealth processing, and automated tax calculations.",
        icon: "receipt",
        primaryColor: "amber-500",
        features: [
            {
                title: "Automated Invoicing",
                description: "Generate itemized invoices automatically based on the procedures and consultations logged.",
                icon: "file-spreadsheet",
            },
            {
                title: "PhilHealth Integration",
                description: "Seamlessly process eClaims and generate compliant Yakap reports without leaving the app.",
                icon: "file-text",
            },
            {
                title: "Payment Gateways",
                description: "Accept GCash, PayMongo, and major credit cards directly through the patient portal.",
                icon: "credit-card",
            },
            {
                title: "Financial Analytics",
                description: "Track revenue, outstanding balances, and insurance claims with real-time dashboards.",
                icon: "bar-chart-3",
            }
        ],
        benefits: [
            {
                title: "Get Paid Faster",
                description: "Integrated payment links and automated follow-ups reduce your accounts receivable.",
                icon: "coins",
            },
            {
                title: "Simplify Compliance",
                description: "Keep your accounting clean with automated tax calculations and instant HMO reporting.",
                icon: "check-square",
            }
        ]
    },
    {
        id: "notes",
        slug: "notes",
        title: "Clinical Notes",
        description: "Customizable charting templates for different specialties ensuring fast and compliant clinical documentation.",
        icon: "clipboard-list",
        primaryColor: "indigo-500",
        features: [
            {
                title: "SOAP Templates",
                description: "Pre-built, customizable Subjective, Objective, Assessment, and Plan templates tailored to your specialty.",
                icon: "layout-template",
            },
            {
                title: "AI Summarizer",
                description: "Let our advanced AI convert raw consultation dictations into perfectly structured notes.",
                icon: "sparkles",
            },
            {
                title: "Drawing & Annotation",
                description: "Draw directly on anatomical diagrams or patient photos to visually document findings.",
                icon: "edit-3",
            },
            {
                title: "Macro Shortcuts",
                description: "Create custom text expansion macros to instantly insert frequently used phrases or protocols.",
                icon: "keyboard",
            }
        ],
        benefits: [
            {
                title: "Focus on the Patient",
                description: "Spend less time typing and more time caring for the person in front of you.",
                icon: "user-check",
            },
            {
                title: "Ensure Compliance",
                description: "Standardized templates ensure you never miss critical documentation requirements.",
                icon: "file-check",
            }
        ]
    },
    {
        id: "telehealth",
        slug: "telehealth",
        title: "Teleconsultation",
        description: "Secure, WebRTC-powered high definition video calls integrated directly into the patient's appointment window.",
        icon: "stethoscope",
        primaryColor: "rose-500",
        features: [
            {
                title: "HD Video Calls",
                description: "Crystal clear, encrypted video consultations powered by enterprise-grade WebRTC.",
                icon: "video",
            },
            {
                title: "Integrated Charting",
                description: "Take notes, review history, and prescribe medication simultaneously in a side-by-side view during the call.",
                icon: "columns",
            },
            {
                title: "Screen Sharing",
                description: "Share your screen to review lab results or imaging reports directly with the patient.",
                icon: "monitor",
            },
            {
                title: "Waiting Room",
                description: "A virtual waiting room where patients can test their audio/video and fill out pre-assessment forms.",
                icon: "coffee",
            }
        ],
        benefits: [
            {
                title: "Expand Your Reach",
                description: "Consult with patients regardless of their geographical location, increasing your clinic's accessibility.",
                icon: "globe-2",
            },
            {
                title: "Seamless Experience",
                description: "No third-party apps required. Patients join directly via a secure link from any browser.",
                icon: "laptop",
            }
        ]
    }
];

// Dummy object to ensure Tailwind JIT compiler doesn't purge dynamic color classes
// By having the exact full class strings in a scanned file, Tailwind will include them in the CSS bundle.
export const _safelistColors = {
    primary: ["bg-primary", "text-primary", "bg-primary/5", "bg-primary/10", "hover:bg-primary/90", "shadow-primary/5", "shadow-primary/10", "shadow-primary/20", "shadow-primary/25", "border-primary/10", "border-primary/50"],
    emerald: ["bg-emerald-500", "text-emerald-500", "bg-emerald-500/5", "bg-emerald-500/10", "hover:bg-emerald-500/90", "shadow-emerald-500/5", "shadow-emerald-500/10", "shadow-emerald-500/20", "shadow-emerald-500/25", "border-emerald-500/10", "border-emerald-500/50"],
    blue: ["bg-blue-500", "text-blue-500", "bg-blue-500/5", "bg-blue-500/10", "hover:bg-blue-500/90", "shadow-blue-500/5", "shadow-blue-500/10", "shadow-blue-500/20", "shadow-blue-500/25", "border-blue-500/10", "border-blue-500/50"],
    amber: ["bg-amber-500", "text-amber-500", "bg-amber-500/5", "bg-amber-500/10", "hover:bg-amber-500/90", "shadow-amber-500/5", "shadow-amber-500/10", "shadow-amber-500/20", "shadow-amber-500/25", "border-amber-500/10", "border-amber-500/50"],
    indigo: ["bg-indigo-500", "text-indigo-500", "bg-indigo-500/5", "bg-indigo-500/10", "hover:bg-indigo-500/90", "shadow-indigo-500/5", "shadow-indigo-500/10", "shadow-indigo-500/20", "shadow-indigo-500/25", "border-indigo-500/10", "border-indigo-500/50"],
    rose: ["bg-rose-500", "text-rose-500", "bg-rose-500/5", "bg-rose-500/10", "hover:bg-rose-500/90", "shadow-rose-500/5", "shadow-rose-500/10", "shadow-rose-500/20", "shadow-rose-500/25", "border-rose-500/10", "border-rose-500/50"],
};
