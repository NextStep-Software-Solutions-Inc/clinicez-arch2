"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";
import { Downloadable } from "../data/downloadData";
import Icon from "@/components/Icon";

interface DownloadCardProps {
    category: Downloadable;
    onClick: () => void;
    isLoading?: boolean;
}

export function DownloadCard({ category, onClick, isLoading = false }: DownloadCardProps) {
    const [isHovered, setIsHovered] = useState(false);

    if (isLoading) {
        return (
            <Card className="h-full">
                <CardHeader className="space-y-4">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-12 w-12 rounded-xl" />
                        <Skeleton className="h-6 w-16" />
                    </div>
                    <Skeleton className="h-6 w-3/4" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-10 w-full" />
                </CardContent>
            </Card>
        );
    }

    const getColorClasses = (color: string) => {
        const colorMap = {
            emerald: {
                icon: "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200",
                badge: "bg-emerald-100 text-emerald-700 border-emerald-200",
                button: "hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
            },
            blue: {
                icon: "bg-blue-100 text-blue-600 group-hover:bg-blue-200",
                badge: "bg-blue-100 text-blue-700 border-blue-200",
                button: "hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300"
            },
            purple: {
                icon: "bg-purple-100 text-purple-600 group-hover:bg-purple-200",
                badge: "bg-purple-100 text-purple-700 border-purple-200",
                button: "hover:bg-purple-50 hover:text-purple-700 hover:border-purple-300"
            }
        };
        return colorMap[color as keyof typeof colorMap] || colorMap.blue;
    };

    const colors = getColorClasses(category.primaryColor || 'blue');

    return (
        <Card
            className="group h-full cursor-pointer transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 border-border/50 hover:border-primary/30 hover:-translate-y-1"
            onClick={onClick}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onClick();
                }
            }}
            aria-label={`Open ${category.title} download options`}
        >
            <CardHeader className="space-y-4">
                <div className="flex items-start justify-between">
                    <div
                        className={`p-4 rounded-xl transition-all duration-300 ${colors.icon}`}
                    >
                        <Icon name={category.icon} className="h-8 w-8" />
                    </div>

                </div>

                <div>
                    <h3 className="font-bold text-xl text-foreground group-hover:text-primary transition-colors mb-2">
                        {category.title}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed">
                        {category.description}
                    </p>
                </div>
            </CardHeader>

            <CardContent className="pt-0">
                <div className="space-y-4">
                    <div className="text-xs text-muted-foreground">
                        {category.options.length} download{category.options.length !== 1 ? 's' : ''} available
                    </div>

                    <Button
                        variant="outline"
                        className={`w-full group/button transition-all duration-300 ${colors.button} ${isHovered ? 'scale-[1.02]' : 'scale-100'
                            }`}
                        size="lg"
                    >
                        <span className="mr-2">View Downloads</span>
                        <ChevronRight className="h-4 w-4 transition-transform group-hover/button:translate-x-1" />
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
