"use client";

import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Download, Loader2 } from "lucide-react";
import { DownloadOptionProps } from "../types/downloads";

export function DownloadOption({ option, onDownload, isDownloading = false }: DownloadOptionProps) {
    const [isHovered, setIsHovered] = useState(false);

    const handleDownload = () => {
        if (onDownload) {
            onDownload(option);
        }

        if (option.isExternal) {
            window.open(option.url, '_blank', 'noopener noreferrer');
        } else {
            const link = document.createElement('a');
            link.href = option.url;
            link.download = option.url.split('/').pop() || '';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const IconComponent = option.icon;

    return (
        <Card
            className="group transition-all duration-300 hover:shadow-lg hover:shadow-primary/10 border-border/50 hover:border-primary/30"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <CardContent className="p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4 flex-1">
                        <div className="flex-shrink-0 p-3 rounded-xl bg-primary/10 text-primary group-hover:bg-primary/20 transition-colors">
                            <IconComponent className="h-6 w-6" />
                        </div>

                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 mb-2">
                                <h4 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors">
                                    {option.label}
                                </h4>
                                <Badge variant="secondary" className="text-xs">
                                    {option.version}
                                </Badge>
                                {option.isExternal && (
                                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                                )}
                            </div>

                            {option.description && (
                                <p className="text-muted-foreground text-sm mb-2">
                                    {option.description}
                                </p>
                            )}

                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                {option.size && (
                                    <span className="flex items-center gap-1">
                                        <Download className="h-3 w-3" />
                                        {option.size}
                                    </span>
                                )}
                                {option.platform && (
                                    <span>{option.platform}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <Button
                        onClick={handleDownload}
                        disabled={isDownloading}
                        className={`transition-all duration-300 ${isHovered ? 'scale-105' : 'scale-100'
                            }`}
                        size="sm"
                    >
                        {isDownloading ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Downloading...
                            </>
                        ) : (
                            <>
                                <Download className="h-4 w-4 mr-2" />
                                Download
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
