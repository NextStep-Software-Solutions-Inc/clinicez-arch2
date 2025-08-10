"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    ArrowLeft,
    Download,
    FileText,
    Shield,
    Clock,
    Users,
    CheckCircle,
    ExternalLink,
    User,
    Building2,
    Server,
    Smartphone,
    Apple,
    Package,
} from "lucide-react";
import { SerializableDownloadCategoryInfo, SerializableDownloadOption } from "../types/downloads";
import { DownloadOption as DownloadOptionComponent } from "../components/DownloadOption";
import { installationManual } from "../data/downloadData";

interface DownloadDetailsPageClientProps {
    category: SerializableDownloadCategoryInfo;
}

// Icon mapping based on category ID and option labels
const getCategoryIcon = (categoryId: string) => {
    switch (categoryId) {
        case "patient": return User;
        case "clinic": return Building2;
        case "server": return Server;
        default: return Download;
    }
};

const getOptionIcon = (label: string) => {
    switch (label.toLowerCase()) {
        case "android": return Smartphone;
        case "ios": return Apple;
        case "docker container": return Package;
        default: return Download;
    }
};

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

export function DownloadDetailsPageClient({ category }: DownloadDetailsPageClientProps) {
    const [downloadingItems, setDownloadingItems] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState("downloads");

    const handleDownload = async (option: SerializableDownloadOption) => {
        setDownloadingItems(prev => new Set([...prev, option.id]));

        if (option.isExternal) {
            window.open(option.url, '_blank');
        } else {
            const link = document.createElement('a');
            link.href = option.url;
            link.download = option.url.split('/').pop() || '';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }

        // Simulate download time
        await new Promise(resolve => setTimeout(resolve, 1000));
        setDownloadingItems(prev => {
            const newSet = new Set(prev);
            newSet.delete(option.id);
            return newSet;
        });
    };

    const handleManualDownload = () => {
        const link = document.createElement('a');
        link.href = installationManual.url;
        link.download = installationManual.url.split('/').pop() || '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const IconComponent = getCategoryIcon(category.id);

    const features = [
        {
            icon: Shield,
            title: "Secure & Private",
            description: "End-to-end encryption with HIPAA compliance"
        },
        {
            icon: Clock,
            title: "Regular Updates",
            description: "Automatic updates with latest features and security patches"
        },
        {
            icon: Users,
            title: "24/7 Support",
            description: "Expert technical support whenever you need assistance"
        }
    ];

    return (
        <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 mt-16">
            <motion.div
                className="container mx-auto px-4 py-8 max-w-7xl"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
            >
                {/* Back Navigation */}
                <motion.div className="mb-8" variants={itemVariants}>
                    <Link href="/downloads">
                        <Button variant="ghost" className="gap-2">
                            <ArrowLeft className="h-4 w-4" />
                            Back to Downloads
                        </Button>
                    </Link>
                </motion.div>

                {/* Header Section */}
                <motion.div className="mb-12" variants={itemVariants}>
                    <div className="flex items-start gap-6 mb-6">
                        <div className="p-4 rounded-2xl bg-primary/10 text-primary">
                            <IconComponent className="h-12 w-12" />
                        </div>
                        <div className="flex-1">
                            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
                                {category.title}
                            </h1>
                            <p className="text-xl text-muted-foreground mb-4 leading-relaxed">
                                {category.description}
                            </p>
                            <div className="flex items-center gap-4">
                                <Badge variant="secondary" className="text-sm py-1">
                                    Latest Version
                                </Badge>
                                <Badge variant="outline" className="text-sm py-1">
                                    Free Download
                                </Badge>
                            </div>
                        </div>
                    </div>
                </motion.div>

                {/* Features Grid */}
                <motion.div className="mb-12" variants={itemVariants}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {features.map((feature) => {
                            const FeatureIcon = feature.icon;
                            return (
                                <Card key={feature.title} className="border-0 bg-muted/30">
                                    <CardContent className="p-6">
                                        <div className="flex items-center gap-4 mb-3">
                                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                                <FeatureIcon className="h-5 w-5" />
                                            </div>
                                            <h3 className="font-semibold">{feature.title}</h3>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{feature.description}</p>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                </motion.div>

                <Separator className="mb-12" />

                {/* Main Content */}
                <motion.div variants={itemVariants}>
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                        <TabsList className="grid w-full grid-cols-2">
                            <TabsTrigger value="downloads" className="flex items-center justify-center">
                                <Download className="h-4 w-4 mr-2" />
                                Downloads
                            </TabsTrigger>
                            <TabsTrigger value="docs" className="flex items-center justify-center">
                                <FileText className="h-4 w-4 mr-2" />
                                Documentation
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="downloads" className="space-y-6">
                            <div className="text-center mb-8">
                                <h2 className="text-3xl font-bold text-foreground mb-4">
                                    Available Downloads
                                </h2>
                                <p className="text-muted-foreground max-w-2xl mx-auto">
                                    Choose the platform that best fits your device. All downloads include the latest features
                                    and security updates.
                                </p>
                            </div>

                            <div className="grid gap-6 max-w-4xl mx-auto">
                                {category.options.map((option) => {
                                    // Create a full option object with icon for the component
                                    const fullOption = {
                                        ...option,
                                        icon: getOptionIcon(option.label)
                                    };
                                    return (
                                        <Card key={option.id} className="overflow-hidden">
                                            <CardContent className="p-6">
                                                <DownloadOptionComponent
                                                    option={fullOption}
                                                    onDownload={handleDownload}
                                                    isDownloading={downloadingItems.has(option.id)}
                                                />
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>                            {/* System Requirements */}
                            <Card className="max-w-4xl mx-auto mt-8">
                                <CardContent className="p-6">
                                    <h3 className="text-lg font-semibold mb-4">System Requirements</h3>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        {category.options.map((option) => {
                                            const OptionIcon = getOptionIcon(option.label);
                                            return (
                                                <div key={option.id} className="space-y-2">
                                                    <div className="flex items-center gap-2">
                                                        <OptionIcon className="h-5 w-5 text-primary" />
                                                        <span className="font-medium">{option.label}</span>
                                                    </div>
                                                    <ul className="text-sm text-muted-foreground space-y-1 ml-7">
                                                        <li>• Platform: {option.platform}</li>
                                                        <li>• Version: {option.version}</li>
                                                        <li>• Size: {option.size}</li>
                                                    </ul>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="docs" className="space-y-6">
                            <div className="text-center mb-8">
                                <h2 className="text-3xl font-bold text-foreground mb-4">
                                    Documentation & Support
                                </h2>
                                <p className="text-muted-foreground max-w-2xl mx-auto">
                                    Get detailed installation guides, user manuals, and support resources.
                                </p>
                            </div>

                            <div className="max-w-4xl mx-auto space-y-6">
                                <Card>
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                <FileText className="h-8 w-8 text-primary" />
                                                <div>
                                                    <h4 className="font-semibold">{installationManual.title}</h4>
                                                    <p className="text-sm text-muted-foreground">
                                                        {installationManual.description} • {installationManual.size}
                                                    </p>
                                                </div>
                                            </div>
                                            <Button onClick={handleManualDownload}>
                                                <Download className="h-4 w-4 mr-2" />
                                                Download PDF
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-6">
                                        <h4 className="font-semibold mb-4">Quick Start Guide</h4>
                                        <div className="space-y-3">
                                            <div className="flex items-start gap-3">
                                                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                                <div>
                                                    <p className="font-medium">Download & Install</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        Download the app for your platform and follow the installation wizard.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                                <div>
                                                    <p className="font-medium">Setup Account</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        Create your account or sign in with existing credentials.
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-start gap-3">
                                                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                                                <div>
                                                    <p className="font-medium">Configure Settings</p>
                                                    <p className="text-sm text-muted-foreground">
                                                        Customize the app settings according to your clinic's needs.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardContent className="p-6">
                                        <h4 className="font-semibold mb-4">Support Resources</h4>
                                        <div className="grid md:grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <h5 className="font-medium">Contact Support</h5>
                                                <div className="space-y-1 text-sm text-muted-foreground">
                                                    <p>📧 support@clinicez.com</p>
                                                    <p>📞 +1 (555) 123-4567</p>
                                                    <p>💬 Live Chat Available</p>
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <h5 className="font-medium">Online Resources</h5>
                                                <div className="space-y-1 text-sm">
                                                    <Button variant="ghost" size="sm" className="p-0 h-auto justify-start">
                                                        <ExternalLink className="h-3 w-3 mr-1" />
                                                        Knowledge Base
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="p-0 h-auto justify-start">
                                                        <ExternalLink className="h-3 w-3 mr-1" />
                                                        Video Tutorials
                                                    </Button>
                                                    <Button variant="ghost" size="sm" className="p-0 h-auto justify-start">
                                                        <ExternalLink className="h-3 w-3 mr-1" />
                                                        Community Forum
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>
                    </Tabs>
                </motion.div>
            </motion.div>
        </div>
    );
}
