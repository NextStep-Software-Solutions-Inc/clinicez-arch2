import { notFound } from "next/navigation";
import { products } from "@/constants/products";
import { ProductDetailsPageClient } from "./ProductDetailsPageClient";

interface ProductDetailsPageProps {
    params: Promise<{ product: string }>;
}

export default async function ProductDetailsPage({ params }: ProductDetailsPageProps) {
    const { product } = await params;
    const productDetials = products.find(item => item.slug === product);
    if (!productDetials) {
        notFound();
    }

    return <ProductDetailsPageClient product={productDetials} />;
}

export async function generateMetadata({ params }: ProductDetailsPageProps) {
    const { product } = await params;
    const productDetials = products.find(item => item.slug === product);

    if (!productDetials) {
        return {
            title: "Product Not Found - ClinicEZ",
        };
    }

    return {
        title: `${productDetials.title} - ClinicEZ`,
        description: productDetials.description,
    };
}

export async function generateStaticParams() {
    return products.map(product => ({
        slug: product.slug
    }));
}