import React from "react";
import { notFound } from "next/navigation";
import { downloadables } from "../data/downloadData";
import { DownloadDetailsPageClient } from "./DownloadDetailsPageClient";

interface DownloadDetailsPageProps {
    params: Promise<{ slug: string }>;
}

export default async function DownloadDetailsPage({ params }: DownloadDetailsPageProps) {
    const { slug } = await params;
    const downloadable = downloadables.find(item => item.slug === slug);

    if (!downloadable) {
        notFound();
    }

    return <DownloadDetailsPageClient downloadable={downloadable} />;
}


export async function generateMetadata({ params }: DownloadDetailsPageProps) {
    const { slug } = await params;
    const downloadable = downloadables.find(item => item.slug === slug);

    if (!downloadable) {
        return {
            title: "Download Not Found - ClinicEZ",
        };
    }

    return {
        title: `Download ${downloadable.title} - ClinicEZ`,
        description: downloadable.description,
    };
}
