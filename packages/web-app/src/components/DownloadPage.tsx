"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "./ui/button";
import { X } from "lucide-react";

const downloadLinks = {
    patient: [
        {
            url: "https://play.google.com/store/apps/details?id=com.clinicez.patient",
            label: "Android (Google Play)",
            icon: "🤖",
            version: "v2.3.1"
        }, {
            url: "https://apps.apple.com/ph/app/clinicez-patient/id6478954321",
            label: "iOS (App Store)",
            icon: "🍎",
            version: "v2.3.1"
        }
    ],
    clinic: [
        {
            url: "https://play.google.com/store/apps/details?id=com.clinicez.clinic",
            label: "Android (Google Play)",
            icon: "🤖",
            version: "v1.8.0"
        },
        {
            url: "https://apps.apple.com/ph/app/clinicez-clinic/id6478954322",
            label: "iOS (App Store)",
            icon: "🍎",
            version: "v1.8.0"
        }
    ],
    server: [
        {
            url: "/downloads/clinicez-backend-v4.0.2.zip",
            label: "Docker Container",
            icon: "🖥️",
            version: "v4.0.2"
        },
        {
            url: "/downloads/clinicez-backend-v4.0.2-build.zip",
            label: "Build Files",
            icon: "📦",
            version: "v4.0.2"
        }
    ]
};


export default function DownloadPage() {
    const [modalType, setModalType] = useState<null | "patient" | "clinic" | "server">(null);

    // Helper to open modal for a platform
    const openModal = (type: "patient" | "clinic" | "server") => {
        setModalType(type);
    };
    const closeModal = () => setModalType(null);

    // Modal content for each type
    const modalOptions = {
        patient: downloadLinks.patient,
        clinic: downloadLinks.clinic,
        server: downloadLinks.server
    };

    // Context/description for each platform, with version
    const modalContext = {
        patient: {
            title: "Patient App",
            desc: `For patients to manage appointments, health records, and clinic visits.`
        },
        clinic: {
            title: "Clinic App",
            desc: `For clinics to manage patient care, records, and operations.`
        },
        server: {
            title: "Server",
            desc: `Deploy your own secure server for full data control and privacy.`
        }
    };

    return (
        <div className="min-h-[100vh] flex flex-col items-center justify-center bg-white">
            <div className="w-full max-w-xl mx-auto text-center pb-8">
                <h1 className="text-3xl font-bold mb-4 text-primary">Downloads</h1>
                <p className="text-base mb-8 text-gray-600">Minimalist distribution page for ClinicEZ apps and server.</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                    {/* Patient App */}
                    <div
                        onClick={() => openModal("patient")}
                        className="rounded-lg border border-gray-200 p-6 flex flex-col items-center gap-2 bg-white hover:shadow transition"
                        aria-label="Open Patient App download options"
                    >
                        <span className="text-3xl mb-1">🧑‍⚕️</span>
                        <span className="font-semibold text-primary">Patient App</span>
                    </div>
                    {/* Clinic App */}
                    <div
                        onClick={() => openModal("clinic")}
                        className="rounded-lg border border-gray-200 p-6 flex flex-col items-center gap-2 bg-white hover:shadow transition"
                        aria-label="Open Clinic App download options"
                    >
                        <span className="text-3xl mb-1">🏥</span>
                        <span className="font-semibold text-primary">Clinic App</span>
                    </div>
                    {/* Server */}
                    <div
                        onClick={() => openModal("server")}
                        className="rounded-lg border border-gray-200 p-6 flex flex-col items-center gap-2 bg-white hover:shadow transition"
                        aria-label="Open Server download options"
                    >
                        <span className="text-3xl mb-1">🖥️</span>
                        <span className="font-semibold text-primary">Server</span>
                    </div>
                </div>
                {/* Modal */}
                {modalType && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeModal}>
                        <div
                            className="bg-white rounded-3xl shadow-2xl p-0 min-w-[700px] max-w-3xl mx-auto flex flex-col items-stretch border border-primary/20 relative overflow-hidden"
                            style={{ maxHeight: '90vh' }}
                            onClick={e => e.stopPropagation()}
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="download-modal-title"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-10 py-8 bg-gradient-to-r from-primary/10 to-white border-b border-primary/10">
                                <div className="flex items-center gap-4">
                                    <span className="text-5xl">{modalType === "patient" ? "🧑‍⚕️" : modalType === "clinic" ? "🏥" : "🖥️"}</span>
                                    <div className="text-left">
                                        <h3 id="download-modal-title" className="text-2xl font-bold text-primary mb-1">{modalContext[modalType].title}</h3>
                                        <p className="text-base text-gray-600 max-w-xl">{modalContext[modalType].desc}</p>
                                    </div>
                                </div>
                                <Button onClick={closeModal} className="" aria-label="Close modal"><X /></Button>
                            </div>
                            {/* Download Options - scrollable body */}
                            <div className="px-10 py-10 flex flex-col gap-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 120px)' }}>
                                {modalType === 'server'
                                    ? modalOptions.server
                                        .map((opt, idx) => (
                                            <a key={idx} href={opt.url} target="_blank" rel="noopener noreferrer" className="group w-full flex items-center justify-between rounded-xl border border-primary/10 bg-primary/5 px-6 py-5 hover:bg-primary/10 transition shadow-sm">
                                                <div className="flex items-center gap-4">
                                                    <span className="text-3xl">{opt.icon}</span>
                                                    <div>
                                                        <p className="font-semibold text-primary text-lg group-hover:underline">{opt.label}</p>
                                                        <p className="text-xs text-gray-400">Latest: {opt.version}</p>
                                                    </div>
                                                </div>
                                            </a>
                                        ))
                                    : modalOptions[modalType].map((opt, idx) => (
                                        <a key={idx} href={opt.url} target="_blank" rel="noopener" className="group w-full flex items-center justify-between rounded-xl border border-primary/10 bg-primary/5 px-6 py-5 hover:bg-primary/10 transition shadow-sm">
                                            <div className="flex items-center gap-4">
                                                <span className="text-3xl">{opt.icon}</span>
                                                <div>
                                                    <p className="font-semibold text-primary text-lg group-hover:underline">{opt.label}</p>
                                                    <p className="text-xs text-gray-400">Latest: {opt.version}</p>
                                                </div>
                                            </div>
                                        </a>
                                    ))}
                                {/* Installation Manual */}
                                <a href="/downloads/clinicez-installation-manual.pdf" target="_blank" rel="noopener noreferrer" className="w-full mt-2 flex items-center justify-center rounded-xl border border-primary/20 bg-primary/10 px-6 py-4 hover:bg-primary/20 transition shadow-sm text-primary font-semibold text-base">
                                    📖 Download Installation Manual (PDF)
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
