import React from "react";
import { notFound } from "next/navigation";
import { downloadCategories } from "../data/downloadData";
import { DownloadDetailsPageClient } from "./DownloadDetailsPageClient";
import { SerializableDownloadCategoryInfo } from "../types/downloads";

interface DownloadDetailsPageProps {
    params: Promise<{ slug: string }>;
}

export default async function DownloadDetailsPage({ params }: DownloadDetailsPageProps) {
    const { slug } = await params;
    const category = downloadCategories.find(cat => cat.slug === slug);

    if (!category) {
        notFound();
    }

    // Create a serializable version of the category without the icon component
    const serializableCategory: SerializableDownloadCategoryInfo = {
        id: category.id,
        slug: category.slug,
        title: category.title,
        description: category.description,
        primaryColor: category.primaryColor,
        options: category.options.map(option => ({
            id: option.id,
            url: option.url,
            label: option.label,
            version: option.version,
            description: option.description,
            size: option.size,
            platform: option.platform,
            isExternal: option.isExternal,
        }))
    };

    return <DownloadDetailsPageClient category={serializableCategory} />;
}

export async function generateMetadata({ params }: DownloadDetailsPageProps) {
    const { slug } = await params;
    const category = downloadCategories.find(cat => cat.slug === slug);

    if (!category) {
        return {
            title: "Download Not Found - ClinicEZ",
        };
    }

    return {
        title: `Download ${category.title} - ClinicEZ`,
        description: category.description,
    };
}
