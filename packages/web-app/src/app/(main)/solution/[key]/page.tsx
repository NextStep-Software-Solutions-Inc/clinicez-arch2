import { notFound } from "next/navigation";
import HeroBackground from "@/components/HeroBackground";
import MainBackgroundImage from "@/../public/assets/main-background.png";

const solutionDetails = {
    opd: {
        title: "Clinic OPD",
        description: "Comprehensive outpatient department management for clinics, including appointments, patient flow, and visit tracking.",
        features: [
            "Appointment scheduling",
            "Patient queue management",
            "Visit history",
            "Doctor assignment",
            "OPD billing integration"
        ]
    },
    pharmacy: {
        title: "Pharmacy",
        description: "Integrated pharmacy management for prescriptions, inventory, and billing.",
        features: [
            "Prescription fulfillment",
            "Inventory tracking",
            "Automated billing",
            "Expiry alerts",
            "Supplier management"
        ]
    },
    accounting: {
        title: "Accounting",
        description: "Clinic accounting and billing solution for financial management.",
        features: [
            "Invoice generation",
            "Expense tracking",
            "Financial reports",
            "Insurance claims",
            "Multi-currency support"
        ]
    },
    bed: {
        title: "Bed Management",
        description: "Manage clinic/hospital beds, occupancy, and assignments.",
        features: [
            "Bed assignment",
            "Occupancy dashboard",
            "Discharge planning",
            "Ward management",
            "Real-time status"
        ]
    },
    laboratory: {
        title: "Laboratory",
        description: "Lab test ordering, results tracking, and integration with patient records.",
        features: [
            "Test ordering",
            "Result entry",
            "Patient record integration",
            "Lab billing",
            "Reference lab support"
        ]
    },
    prescription: {
        title: "Prescription Builder",
        description: "Easy-to-use prescription builder for doctors and staff.",
        features: [
            "Template-based prescriptions",
            "Drug database integration",
            "Print/export options",
            "E-signature support",
            "Patient instructions"
        ]
    },
    medcert: {
        title: "Medcert Builder",
        description: "Medical certificate builder for generating and managing medcerts.",
        features: [
            "Certificate templates",
            "Doctor signature",
            "Patient linking",
            "Export/print",
            "Validity tracking"
        ]
    }
};

const solutionContexts = {
    opd: {
        overview: "Clinic OPD (Outpatient Department) is the heart of patient care in any clinic. Our OPD module streamlines appointment scheduling, patient flow, and visit management, ensuring a seamless experience for both staff and patients.",
        benefits: [
            "Reduce patient wait times with smart queue management.",
            "Track patient visits and histories for better care continuity.",
            "Assign doctors efficiently and manage daily schedules.",
            "Integrate OPD billing for transparent financial operations."
        ],
        useCases: [
            "Multi-doctor clinics",
            "Specialty clinics",
            "Walk-in and scheduled appointments"
        ],
        integrations: [
            "EMR/EHR systems",
            "Billing & accounting",
            "Laboratory & pharmacy modules"
        ]
    },
    pharmacy: {
        overview: "The Pharmacy module empowers clinics to manage prescriptions, inventory, and billing with ease. It supports automated stock tracking, expiry alerts, and supplier management for a safe and efficient pharmacy operation.",
        benefits: [
            "Automate inventory tracking and reduce stockouts.",
            "Fulfill prescriptions quickly and accurately.",
            "Integrated billing for seamless transactions.",
            "Expiry alerts to ensure medication safety."
        ],
        useCases: [
            "In-house clinic pharmacies",
            "Retail pharmacy integration",
            "Prescription fulfillment"
        ],
        integrations: [
            "Prescription builder",
            "Accounting",
            "Inventory management"
        ]
    },
    accounting: {
        overview: "Accounting is critical for clinic sustainability. Our module provides robust tools for invoice generation, expense tracking, financial reporting, and insurance claims, all in one place.",
        benefits: [
            "Automate invoice and receipt generation.",
            "Track expenses and manage budgets.",
            "Generate financial reports for compliance.",
            "Support for insurance claims and multi-currency."
        ],
        useCases: [
            "Private clinics",
            "Multi-branch clinics",
            "Insurance billing"
        ],
        integrations: [
            "OPD & pharmacy billing",
            "Insurance systems",
            "Financial reporting tools"
        ]
    },
    bed: {
        overview: "Bed Management helps clinics and hospitals optimize bed occupancy, assignments, and discharge planning. Real-time dashboards and ward management features ensure efficient patient flow.",
        benefits: [
            "Monitor bed occupancy in real time.",
            "Streamline patient admissions and discharges.",
            "Ward management for multi-bed facilities.",
            "Improve resource allocation."
        ],
        useCases: [
            "Inpatient clinics",
            "Hospitals",
            "Emergency wards"
        ],
        integrations: [
            "OPD & admission modules",
            "Discharge planning",
            "Ward dashboards"
        ]
    },
    laboratory: {
        overview: "The Laboratory module enables clinics to order tests, track results, and integrate findings with patient records. It supports lab billing and reference lab workflows for comprehensive diagnostics.",
        benefits: [
            "Order and track lab tests digitally.",
            "Integrate results with EMR/EHR.",
            "Automate lab billing.",
            "Support for reference labs."
        ],
        useCases: [
            "Diagnostic clinics",
            "Multi-specialty clinics",
            "Reference lab integration"
        ],
        integrations: [
            "Patient records",
            "Billing",
            "Lab equipment"
        ]
    },
    prescription: {
        overview: "Prescription Builder simplifies the process of creating, managing, and printing prescriptions. It offers template-based workflows, drug database integration, and e-signature support for modern clinics.",
        benefits: [
            "Create prescriptions quickly with templates.",
            "Integrate with drug databases for safety.",
            "Print or export prescriptions easily.",
            "Support for e-signatures and patient instructions."
        ],
        useCases: [
            "General practice",
            "Specialty clinics",
            "Telemedicine"
        ],
        integrations: [
            "Pharmacy",
            "EMR/EHR",
            "Patient portal"
        ]
    },
    medcert: {
        overview: "Medcert Builder allows clinics to generate, manage, and track medical certificates. It supports customizable templates, doctor signatures, and patient linking for compliance and convenience.",
        benefits: [
            "Generate certificates with customizable templates.",
            "Link certificates to patient records.",
            "Export and print certificates.",
            "Track validity and compliance."
        ],
        useCases: [
            "Occupational health",
            "School health",
            "Travel medicine"
        ],
        integrations: [
            "Patient records",
            "Doctor signature",
            "Export tools"
        ]
    }
};

interface SolutionDetailProps {
    params: Promise<{ key: string }>;
}

export default async function SolutionDetailPage({ params }: SolutionDetailProps) {
    const { key } = await params;
    const details = solutionDetails[key as keyof typeof solutionDetails];
    const context = solutionContexts[key as keyof typeof solutionContexts];
    if (!details || !context) return notFound();
    return (
        <main className="relative min-h-[70vh] flex flex-col items-center justify-start py-0 px-0 overflow-hidden">
            <HeroBackground path={MainBackgroundImage} opacity={0.3} />
            <section className="w-full pt-20 pb-12 px-4">
                <div className="max-w-3xl w-full mx-auto text-center my-10">
                    <h1 className="font-geist-sans text-5xl md:text-6xl font-normal tracking-tight text-primary my-4 drop-shadow-sm">{details.title}</h1>
                    <p className="font-geist-sans text-xl md:text-2xl text-gray-700 mb-8">{details.description}</p>
                </div>
                <div className="max-w-2xl w-full mx-auto mb-10">
                    <div className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg p-8 border border-slate-100">
                        <h2 className="text-xl font-bold text-primary mb-2">Overview</h2>
                        <p className="text-base text-gray-700 mb-4">{context.overview}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Benefits</h3>
                                <ul className="list-disc pl-6 text-gray-700 space-y-1">
                                    {context.benefits.map((b, i) => (
                                        <li key={i} className="text-base">{b}</li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 mb-2">Use Cases</h3>
                                <ul className="list-disc pl-6 text-gray-700 space-y-1">
                                    {context.useCases.map((u, i) => (
                                        <li key={i} className="text-base">{u}</li>
                                    ))}
                                </ul>
                            </div>
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 mb-2">Integrations</h3>
                            <ul className="list-disc pl-6 text-gray-700 space-y-1">
                                {context.integrations.map((int, i) => (
                                    <li key={i} className="text-base">{int}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
                <div className="max-w-2xl w-full mx-auto">
                    <h2 className="text-2xl font-bold text-primary mb-6 text-center">Key Features</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {details.features.map((f, i) => (
                            <div key={i} className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg p-6 flex items-center gap-3 border border-slate-100">
                                <span className="inline-block w-3 h-3 rounded-full bg-primary"></span>
                                <span className="font-geist-sans text-base text-gray-900">{f}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </main>
    );
}
