"use client";

import React from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Product } from "@/constants/products";
import Icon from "@/components/Icon";

interface ProductDetailsPageClientProps {
    product: Product;
}

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1, delayChildren: 0.1 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.5, ease: "easeOut" as any },
    },
};

export function ProductDetailsPageClient({ product }: ProductDetailsPageClientProps) {
    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            {/* Background Gradients */}
            <div className={`absolute top-0 right-0 w-[800px] h-[600px] bg-${product.primaryColor}/10 blur-[120px] rounded-full pointer-events-none -z-10`} />
            <div className={`absolute bottom-[-20%] left-[-10%] w-[600px] h-[600px] bg-${product.primaryColor}/5 blur-[100px] rounded-full pointer-events-none -z-10`} />

            <div className="container mx-auto px-4 py-24 max-w-7xl relative z-10">
                <motion.div variants={containerVariants} initial="hidden" animate="visible">
                    
                    {/* Back Button */}
                    <motion.div className="mb-12" variants={itemVariants}>
                        <Link href="/products">
                            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-full px-6">
                                <ArrowLeft className="h-4 w-4" />
                                Back to all modules
                            </Button>
                        </Link>
                    </motion.div>

                    {/* Hero Section */}
                    <motion.div className="mb-24 flex flex-col items-start max-w-4xl" variants={itemVariants}>
                        <div className={`p-5 rounded-3xl bg-${product.primaryColor}/10 text-${product.primaryColor} mb-8 shadow-inner shadow-${product.primaryColor}/20`}>
                            <Icon name={product.icon} className="h-12 w-12" />
                        </div>
                        <h1 className="text-5xl md:text-7xl font-extrabold text-foreground mb-6 tracking-tight">
                            {product.title}
                        </h1>
                        <p className="text-xl md:text-2xl text-muted-foreground mb-10 leading-relaxed max-w-3xl">
                            {product.description}
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <Link href="/tenants/register">
                                <Button size="lg" className={`rounded-full px-8 bg-${product.primaryColor} hover:bg-${product.primaryColor}/90 text-white font-bold h-14 text-base shadow-lg shadow-${product.primaryColor}/25`}>
                                    Start Free Trial
                                    <ArrowRight className="ml-2 h-5 w-5" />
                                </Button>
                            </Link>
                            <Link href="/contact-us">
                                <Button size="lg" variant="outline" className="rounded-full px-8 h-14 text-base font-bold bg-background/50 backdrop-blur-sm">
                                    Book a Demo
                                </Button>
                            </Link>
                        </div>
                    </motion.div>

                    {/* Features Grid */}
                    <motion.div className="mb-32" variants={itemVariants}>
                        <h2 className="text-3xl font-bold mb-12">Core Capabilities</h2>
                        <div className="grid md:grid-cols-2 gap-8">
                            {product.features.map((feature, idx) => (
                                <div key={idx} className="flex gap-6 p-8 rounded-3xl bg-card border border-border/50 shadow-sm hover:shadow-md transition-shadow">
                                    <div className={`flex-shrink-0 w-14 h-14 rounded-2xl bg-${product.primaryColor}/10 flex items-center justify-center text-${product.primaryColor}`}>
                                        <Icon name={feature.icon} className="h-7 w-7" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold mb-3">{feature.title}</h3>
                                        <p className="text-muted-foreground leading-relaxed">
                                            {feature.description}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* Benefits Section */}
                    <motion.div className="mb-32" variants={itemVariants}>
                        <div className={`rounded-[3rem] bg-${product.primaryColor}/5 border border-${product.primaryColor}/10 p-12 md:p-20`}>
                            <h2 className="text-3xl md:text-4xl font-bold mb-16 text-center">Why Clinics Choose Our {product.title}</h2>
                            <div className="grid md:grid-cols-2 gap-12 max-w-5xl mx-auto">
                                {product.benefits.map((benefit, idx) => (
                                    <div key={idx} className="flex flex-col items-center text-center">
                                        <div className={`w-20 h-20 rounded-full bg-background flex items-center justify-center mb-6 shadow-xl shadow-${product.primaryColor}/10 text-${product.primaryColor}`}>
                                            <Icon name={benefit.icon} className="h-10 w-10" />
                                        </div>
                                        <h3 className="text-2xl font-bold mb-4">{benefit.title}</h3>
                                        <p className="text-muted-foreground text-lg leading-relaxed">
                                            {benefit.description}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>

                    {/* Bottom CTA */}
                    <motion.div variants={itemVariants} className="text-center pb-12">
                        <h2 className="text-4xl font-extrabold mb-6">Ready to upgrade your workflow?</h2>
                        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
                            Join hundreds of modern clinics using Clinic EZ to streamline their operations.
                        </p>
                        <Link href="/sign-up">
                            <Button size="lg" className={`rounded-full px-10 h-16 text-lg bg-${product.primaryColor} hover:bg-${product.primaryColor}/90 text-white font-bold shadow-xl shadow-${product.primaryColor}/25`}>
                                Get Started Today
                            </Button>
                        </Link>
                    </motion.div>

                </motion.div>
            </div>
        </div>
    );
}
