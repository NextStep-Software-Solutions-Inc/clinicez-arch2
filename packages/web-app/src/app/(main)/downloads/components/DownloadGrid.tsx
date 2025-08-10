"use client";

import React from "react";
import { DownloadCard } from "./DownloadCard";
import { Downloadable } from "../data/downloadData";

interface DownloadGridProps {
    categories: Downloadable[];
    onCategoryClick: (category: Downloadable) => void;
    isLoading?: boolean;
}

export function DownloadGrid({ categories, onCategoryClick, isLoading = false }: DownloadGridProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {
                categories.map((category) => (
                    <DownloadCard
                        key={category.id}
                        category={category}
                        onClick={() => onCategoryClick(category)}
                        isLoading={isLoading}
                    />
                ))
            }
        </div>
    );
}
