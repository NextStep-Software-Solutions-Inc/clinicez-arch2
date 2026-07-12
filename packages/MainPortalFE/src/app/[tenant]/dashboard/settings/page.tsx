import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings | Clinic EZ Dashboard",
  description: "Configure system preferences, medical portal setups, account access, and tenant configurations.",
  keywords: ["settings", "clinic settings", "account preferences", "Clinic EZ settings"],
};

export default function SettingsPage() {
    return (
        <div className="p-4">
            <h1 className="text-3xl font-bold mb-4">Settings</h1>
            <p className="text-lg text-gray-700">Configure your tenant settings here.</p>
        </div>
    );
}
