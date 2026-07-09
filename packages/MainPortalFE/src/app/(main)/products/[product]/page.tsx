import { notFound } from "next/navigation";
import { products } from "@/constants/products";
import { ProductDetailsPageClient } from "./ProductDetailsPageClient";

interface ProductDetailsPageProps {
    params: Promise<{ product: string }>;
}

export default async function ProductDetailsPage({ params }: ProductDetailsPageProps) {
    const { product } = await params;
    const productDetails = products.find(item => item.slug === product);
    if (!productDetails) {
        notFound();
    }

    return <ProductDetailsPageClient product={productDetails} />;
}

export async function generateMetadata({ params }: ProductDetailsPageProps) {
    const { product } = await params;
    const productDetails = products.find(item => item.slug === product);

    if (!productDetails) {
        return {
            title: "Product Not Found - Clinic EZ",
        };
    }

    return {
        title: `${productDetails.title} - Clinic EZ`,
        description: productDetails.description,
    };
}

export async function generateStaticParams() {
    return products.map(product => ({
        product: product.slug
    }));
}