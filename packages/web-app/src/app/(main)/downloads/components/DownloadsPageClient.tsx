"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Download, Sparkles, Shield, Zap } from "lucide-react";
import { DownloadGrid } from "./DownloadGrid";
import { downloadCategories } from "../data/downloadData";
import { DownloadCategoryInfo } from "../types/downloads";

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: {
            staggerChildren: 0.1,
            delayChildren: 0.2,
        },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: {
            duration: 0.6,
            ease: [0.6, -0.05, 0.01, 0.99] as const,
        },
    },
};

const features = [
    {
        icon: Shield,
        title: "Secure & Compliant",
        description: "HIPAA compliant with end-to-end encryption",
    },
    {
        icon: Zap,
        title: "Fast & Reliable",
        description: "Optimized performance for healthcare workflows",
    },
    {
        icon: Sparkles,
        title: "Easy to Use",
        description: "Intuitive interface designed for healthcare professionals",
    },
];

export function DownloadsPageClient() {
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        // Simulate loading for better UX
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 800);

        return () => clearTimeout(timer);
    }, []);

    const handleCategoryClick = (category: DownloadCategoryInfo) => {
        router.push(`/downloads/${category.slug}`);
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20">
            <motion.div
                className="container mx-auto px-4 py-16 max-w-7xl"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {/* Header Section */}
                <motion.div className="text-center mb-16" variants={itemVariants}>
                    <div className="flex items-center justify-center mb-6">
                        <div className="p-4 rounded-2xl bg-primary/10 text-primary">
                            <Download className="h-12 w-12" />
                        </div>
                    </div>

                    <motion.h1
                        className="text-4xl md:text-5xl font-bold text-foreground mb-6"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.6, delay: 0.3 }}
                    >
                        Download Clinic
                        <span className="text-primary">EZ</span>
                    </motion.h1>

                    <motion.p
                        className="text-xl text-muted-foreground max-w-3xl mx-auto mb-8 leading-relaxed"
                        variants={itemVariants}
                    >
                        Get the complete healthcare management solution. Download our apps and server packages
                        to start managing your clinic efficiently.
                    </motion.p>

                    <motion.div className="flex items-center justify-center gap-4" variants={itemVariants}>
                        <Badge variant="secondary" className="text-sm py-1">
                            Trusted by 500+ clinics
                        </Badge>
                        <Badge variant="outline" className="text-sm py-1">
                            Free for small practices
                        </Badge>
                    </motion.div>
                </motion.div>

                {/* Features Section */}
                <motion.div className="mb-16" variants={itemVariants}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {features.map((feature) => {
                            const IconComponent = feature.icon;
                            return (
                                <motion.div
                                    key={feature.title}
                                    className="text-center"
                                    variants={itemVariants}
                                    whileHover={{ scale: 1.05 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <div className="flex items-center justify-center mb-4">
                                        <div className="p-3 rounded-xl bg-primary/10 text-primary">
                                            <IconComponent className="h-6 w-6" />
                                        </div>
                                    </div>
                                    <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
                                    <p className="text-muted-foreground text-sm">{feature.description}</p>
                                </motion.div>
                            );
                        })}
                    </div>
                </motion.div>

                <Separator className="mb-16" />

                {/* Downloads Section */}
                <motion.div variants={itemVariants}>
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-foreground mb-4">
                            Choose Your Platform
                        </h2>
                        <p className="text-muted-foreground max-w-2xl mx-auto">
                            Select the application that best fits your needs. All downloads include the latest features
                            and security updates.
                        </p>
                    </div>

                    <DownloadGrid
                        categories={downloadCategories}
                        onCategoryClick={handleCategoryClick}
                        isLoading={isLoading}
                    />
                </motion.div>

                {/* Support Section */}
                <motion.div
                    className="mt-20 text-center p-8 rounded-2xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20"
                    variants={itemVariants}
                >
                    <h3 className="text-2xl font-bold text-foreground mb-4">
                        Need Help Getting Started?
                    </h3>
                    <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                        Our support team is ready to help you set up and configure ClinicEZ for your healthcare practice.
                        Get expert assistance with installation, training, and customization.
                    </p>
                    <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
                        <span>📧 support@clinicez.com</span>
                        <span>•</span>
                        <span>📞 +1 (555) 123-4567</span>
                        <span>•</span>
                        <span>💬 Live Chat Available</span>
                    </div>
                </motion.div>
            </motion.div>
        </div>
    );
}
