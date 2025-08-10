"use client";

import { UserButton } from "@clerk/nextjs";
import { Star } from "lucide-react";

export default function ClerkUserButton() {
    return (
        <UserButton>
            <UserButton.MenuItems>
                <UserButton.Link
                    label="Tenant Dashboard"
                    labelIcon={<Star size={14} />}
                    href="/tenants/dashboard"
                />
            </UserButton.MenuItems>
        </UserButton>
    );
}
