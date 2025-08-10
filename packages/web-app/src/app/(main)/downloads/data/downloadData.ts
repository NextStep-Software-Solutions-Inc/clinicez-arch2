import {
    User,
    Building2,
    Server,
    Smartphone,
    Apple,
    Package,
} from "lucide-react";
import { DownloadCategoryInfo } from "../types/downloads";

export const downloadCategories: DownloadCategoryInfo[] = [
    {
        id: "patient",
        slug: "patient-app",
        title: "Patient App",
        description: "For patients to manage appointments, health records, and clinic visits with ease.",
        icon: User,
        primaryColor: "emerald",
        options: [
            {
                id: "patient-android",
                url: "https://play.google.com/store/apps/details?id=com.clinicez.patient",
                label: "Android",
                icon: Smartphone,
                version: "v2.3.1",
                description: "Download from Google Play Store",
                size: "25.4 MB",
                platform: "Android 6.0+",
                isExternal: true,
            },
            {
                id: "patient-ios",
                url: "https://apps.apple.com/ph/app/clinicez-patient/id6478954321",
                label: "iOS",
                icon: Apple,
                version: "v2.3.1",
                description: "Download from App Store",
                size: "28.7 MB",
                platform: "iOS 14.0+",
                isExternal: true,
            }
        ]
    },
    {
        id: "clinic",
        slug: "clinic-app",
        title: "Clinic App",
        description: "Comprehensive clinic management system for healthcare providers and staff.",
        icon: Building2,
        primaryColor: "blue",
        options: [
            {
                id: "clinic-android",
                url: "https://play.google.com/store/apps/details?id=com.clinicez.clinic",
                label: "Android",
                icon: Smartphone,
                version: "v1.8.0",
                description: "Download from Google Play Store",
                size: "45.2 MB",
                platform: "Android 7.0+",
                isExternal: true,
            },
            {
                id: "clinic-ios",
                url: "https://apps.apple.com/ph/app/clinicez-clinic/id6478954322",
                label: "iOS",
                icon: Apple,
                version: "v1.8.0",
                description: "Download from App Store",
                size: "52.1 MB",
                platform: "iOS 15.0+",
                isExternal: true,
            }
        ]
    },
    {
        id: "server",
        slug: "server-package",
        title: "Server Package",
        description: "Deploy your own secure server for complete data control and privacy compliance.",
        icon: Server,
        primaryColor: "purple",
        options: [
            {
                id: "server-docker",
                url: "/downloads/clinicez-backend-v4.0.2.zip",
                label: "Docker Container",
                icon: Package,
                version: "v4.0.2",
                description: "Complete Docker setup with all dependencies",
                size: "125.8 MB",
                platform: "Docker",
                isExternal: false,
            }
        ]
    }
];

export const installationManual = {
    url: "/downloads/clinicez-installation-manual.pdf",
    title: "Installation Manual",
    description: "Comprehensive setup guide for all platforms",
    version: "v2.1",
    size: "2.4 MB"
};
