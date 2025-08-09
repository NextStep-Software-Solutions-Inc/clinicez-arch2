import React from "react";
import Link from "next/link";
import { findEmojiByPartialKey } from "@/lib/find-emoji";

const solutions = [
    {
        key: "opd",
        title: "Clinic OPD",
        description: "Outpatient Department management for clinics, including appointments and patient flow.",
        link: "/solution/opd"
    },
    {
        key: "pharmacy",
        title: "Pharmacy",
        description: "Integrated pharmacy management for prescriptions, inventory, and billing.",
        link: "/solution/pharmacy"
    },
    {
        key: "accounting",
        title: "Accounting",
        description: "Clinic accounting and billing solution for financial management.",
        link: "/solution/accounting"
    },
    {
        key: "bed",
        title: "Bed Management",
        description: "Manage clinic/hospital beds, occupancy, and assignments.",
        link: "/solution/bed"
    },
    {
        key: "laboratory",
        title: "Laboratory",
        description: "Lab test ordering, results tracking, and integration with patient records.",
        link: "/solution/laboratory"
    },
    {
        key: "prescription",
        title: "Prescription Builder",
        description: "Easy-to-use prescription builder for doctors and staff.",
        link: "/solution/prescription"
    },
    {
        key: "medcert",
        title: "Medcert Builder",
        description: "Medical certificate builder for generating and managing medcerts.",
        link: "/solution/medcert"
    },
    {
        key: "philhealth",
        title: "PhilHealth eKonsulta integration",
        description: "Integration with PhilHealth eKonsulta, claims processing, and eligibility verification.",
        link: "/solution/philhealth"
    }
];

export default function SolutionList() {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {solutions.map((sol) => (
                <Link href={sol.link} key={sol.key} className="group">
                    <div className="p-7 rounded-2xl bg-white shadow-lg border border-slate-100 transition-transform hover:-translate-y-1 hover:shadow-xl flex flex-col h-full">
                        <span className="text-3xl mb-2">{findEmojiByPartialKey(sol.title)}</span>
                        <span className="text-2xl font-bold mb-2 text-gray-900 group-hover:text-primary transition-colors">{sol.title}</span>
                        <span className="mb-4 text-base text-gray-600 font-normal">{sol.description}</span>
                        <span className="mt-auto text-primary font-semibold text-sm group-hover:underline">View Details &rarr;</span>
                    </div>
                </Link>
            ))}
        </div>
    );
}
