"use client";

import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download } from "lucide-react";
import { DownloadModalProps, DownloadOption } from "../types/downloads";
import { DownloadOption as DownloadOptionComponent } from "./DownloadOption";
import { installationManual } from "../data/downloadData";

export function DownloadModal({ isOpen, onClose, category }: DownloadModalProps) {
    const [downloadingItems, setDownloadingItems] = useState<Set<string>>(new Set());
    const [activeTab, setActiveTab] = useState("downloads");

    const handleDownload = async (option: DownloadOption) => {
        setDownloadingItems(prev => new Set([...prev, option.id]));
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

    if (!category) return null;

    const IconComponent = category.icon;

    return (
        <Dialog open={isOpen} onOpenChange={onClose} >
            <DialogContent className="sm:max-w-[80vw] md:max-w-[50vw] max-h-[90vh] h-[90vh] p-0 flex flex-col">
                {/* Simple Header */}
                <DialogHeader className="p-6 border-b bg-muted/30 flex-shrink-0">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-lg bg-primary/10 text-primary">
                            <IconComponent className="h-8 w-8" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3">
                                <DialogTitle className="text-2xl font-bold">
                                    {category.title}
                                </DialogTitle>
                            </div>
                            <DialogDescription className="text-base mt-1">
                                {category.description}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Main Content */}
                <div className="flex-1 min-h-0 flex flex-col">
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
                        <div className="px-6 flex-shrink-0">
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
                        </div>

                        <div className="flex-1 min-h-0 overflow-y-auto">
                            <TabsContent value="downloads" className="p-6 space-y-6 m-0 data-[state=active]:block">
                                <h3 className="text-lg font-semibold">Available Downloads</h3>
                                <div className="grid gap-4">
                                    {category.options.map((option) => (
                                        <DownloadOptionComponent
                                            key={option.id}
                                            option={option}
                                            onDownload={handleDownload}
                                            isDownloading={downloadingItems.has(option.id)}
                                        />
                                    ))}
                                </div>
                            </TabsContent>

                            <TabsContent value="docs" className="p-6 space-y-6 m-0 data-[state=active]:block">
                                <h3 className="text-lg font-semibold">Documentation</h3>
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
                            </TabsContent>
                        </div>
                    </Tabs>
                </div>
            </DialogContent>
        </Dialog>
    );
}
