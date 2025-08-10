import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, ExternalLink } from "lucide-react";
import { DownloadableOption } from "../data/downloadData";
import Icon from "@/components/Icon";

interface DownloadOptionProps {
    option: DownloadableOption;
    onDownload?: (option: DownloadableOption) => void;
    isDownloading?: boolean;
}

export function DownloadOption({ option, onDownload, isDownloading = false }: DownloadOptionProps) {
    const handleDownload = () => {
        if (onDownload) {
            onDownload(option);
        }
    };

    return (
        <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10 text-primary">
                    <Icon name={option.icon} className="h-6 w-6" />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold text-lg">{option.label}</h4>
                        <Badge variant="outline" className="text-xs">
                            {option.version}
                        </Badge>
                        {option.isExternal && (
                            <Badge variant="secondary" className="text-xs">
                                <ExternalLink className="h-3 w-3 mr-1" />
                                External
                            </Badge>
                        )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                        {option.description}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {option.size && <span>Size: {option.size}</span>}
                        {option.platform && <span>Platform: {option.platform}</span>}
                    </div>
                </div>
            </div>
            <Button
                onClick={handleDownload}
                disabled={isDownloading}
                className="ml-4"
                size="lg"
            >
                {isDownloading ? (
                    <>
                        <div className="animate-spin h-4 w-4 mr-2 border-2 border-current border-t-transparent rounded-full" />
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
    );
}
