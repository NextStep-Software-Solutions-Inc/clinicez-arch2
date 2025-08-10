"use client";

const MOCK_API_DELAY = 1000;

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "./ui/form";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "./ui/card";
import HeroBackground from "./HeroBackground";
import SecondaryBackgroundImage from "@/public/assets/secondary-background.png";

const tenantSchema = z.object({
    displayName: z.string().min(2, "Display name is required").max(64),
    slug: z.string().min(2, "Slug is required").max(32).regex(/^[a-z0-9-]+$/, "Slug must be lowercase, alphanumeric, and may contain dashes"),
});

type TenantFormValues = z.infer<typeof tenantSchema>;

export default function TenantRegistration() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [countdown, setCountdown] = useState(3);
    const form = useForm<TenantFormValues>({
        resolver: zodResolver(tenantSchema),
        defaultValues: {
            displayName: "",
            slug: "",
        },
        mode: "onChange",
    });

    // Auto-generate slug from display name, but allow user to override
    const displayName = useWatch({ control: form.control, name: "displayName" });
    const slugValue = useWatch({ control: form.control, name: "slug" });
    const userModifiedSlug = useRef(false);

    // Only mark userModifiedSlug when the user actually edits the slug field
    const lastAutoSlug = useRef("");

    useEffect(() => {
        if (!displayName && !userModifiedSlug.current) {
            lastAutoSlug.current = "";
            form.setValue("slug", "", { shouldValidate: true });
        } else if (displayName && !userModifiedSlug.current) {
            const autoSlug = displayName
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")
                .slice(0, 32);
            lastAutoSlug.current = autoSlug;
            form.setValue("slug", autoSlug, { shouldValidate: true });
        }
    }, [displayName, form]);

    // If user edits slug field, mark as userModifiedSlug
    useEffect(() => {
        if (slugValue !== lastAutoSlug.current && slugValue !== "") {
            userModifiedSlug.current = true;
        }
        // If slug is cleared, allow auto-generation again
        if (slugValue === "") {
            userModifiedSlug.current = false;
        }
    }, [slugValue]);

    async function onSubmit(data: TenantFormValues) {
        setIsSubmitting(true);
        // TODO: Replace with real registration API call
        await new Promise(res => setTimeout(res, MOCK_API_DELAY));
        setIsSubmitting(false);
        setSuccess(true);
        setCountdown(3);
        setIsSubmitting(false);
        setSuccess(true);
        setCountdown(3);
    }

    useEffect(() => {
        if (success && countdown > 0) {
            const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
            return () => clearTimeout(timer);
        } else if (success && countdown === 0) {
            router.push("/tenant/dashboard");
        }
    }, [success, countdown, router]);

    return (
        <div className="relative flex items-center justify-center min-h-screen">
            <HeroBackground path={SecondaryBackgroundImage} opacity={0.3} />
            <Card className="w-full max-w-lg mx-auto shadow-2xl border-0 bg-white/40 backdrop-blur-md">
                {success ? (
                    <div className="flex flex-col items-center justify-center py-16">
                        <CardTitle className="text-3xl font-extrabold text-green-700 mb-4">Registration Successful!</CardTitle>
                        <CardDescription className="text-lg text-muted-foreground mb-2">Redirecting to dashboard in <span className="font-bold text-blue-700">{countdown}</span>...</CardDescription>
                    </div>
                ) : (
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 px-2 py-8" autoComplete="off">
                            <CardHeader>
                                <CardTitle className="text-3xl font-extrabold text-blue-900">Tenant Registration</CardTitle>
                                <CardDescription className="text-base text-muted-foreground">Register your tenant. Please provide a display name and unique slug.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <FormField control={form.control} name="displayName" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Display Name</FormLabel>
                                        <FormControl><Input {...field} placeholder="Tenant Display Name" autoFocus /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                                <FormField control={form.control} name="slug" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Unique Slug</FormLabel>
                                        <FormControl><Input {...field} placeholder="e.g. my-clinic" /></FormControl>
                                        <FormDescription>Lowercase, alphanumeric, dashes allowed. Auto-generated from display name, but you can change it.</FormDescription>
                                        <FormMessage />
                                    </FormItem>
                                )} />
                            </CardContent>
                            <CardFooter>
                                <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-lg transition-all duration-300" disabled={!form.formState.isValid || isSubmitting}>
                                    {isSubmitting ? "Registering..." : "Register"}
                                </Button>
                            </CardFooter>
                        </form>
                    </Form>
                )}
            </Card>
        </div>
    );
}
