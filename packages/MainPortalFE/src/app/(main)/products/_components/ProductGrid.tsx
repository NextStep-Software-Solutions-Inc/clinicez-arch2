"use client";

import React, { useEffect, useState } from "react";
import ProductCard from "./ProductCard";
import { Product } from "@/constants/products";
import Each from "@/components/utils/Each";

interface ProductGridProps {
    products: Product[];
}

export default function ProductGrid({ products }: ProductGridProps) {
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Simulate loading for better UX
        const timer = setTimeout(() => {
            setIsLoading(false);
        }, 800);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Each
                of={products}
                render={(product) => (
                    <ProductCard
                        key={product.id}
                        product={product}
                        isLoading={isLoading}
                    />
                )}
            />
        </div>
    );
}
