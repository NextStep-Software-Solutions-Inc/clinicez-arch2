import { LucideIcon } from "lucide-react";

export type DownloadCategory = "patient" | "clinic" | "server";

export interface DownloadOption {
    id: string;
    url: string;
    label: string;
    icon: LucideIcon;
    version: string;
    description?: string;
    size?: string;
    platform?: string;
    isExternal?: boolean;
}

export interface SerializableDownloadOption {
    id: string;
    url: string;
    label: string;
    version: string;
    description?: string;
    size?: string;
    platform?: string;
    isExternal?: boolean;
}

export interface DownloadCategoryInfo {
    id: DownloadCategory;
    slug: string;
    title: string;
    description: string;
    icon: LucideIcon;
    options: DownloadOption[];
    primaryColor?: string;
}

export interface SerializableDownloadCategoryInfo {
    id: DownloadCategory;
    slug: string;
    title: string;
    description: string;
    options: SerializableDownloadOption[];
    primaryColor?: string;
}

export interface DownloadModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: DownloadCategoryInfo | null;
}

export interface DownloadCardProps {
    category: DownloadCategoryInfo;
    onClick: () => void;
    isLoading?: boolean;
}

export interface DownloadOptionProps {
    option: DownloadOption;
    onDownload?: (option: DownloadOption) => void;
    isDownloading?: boolean;
}
