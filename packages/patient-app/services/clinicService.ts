import { randomUUID } from "expo-crypto";
import { db } from "@/db";
import type { Clinic, NewClinic } from "@/db/schema";
import { clinics } from "@/db/schema";
import { resolveMockInviteCode } from "./mockData";

/**
 * Join a clinic by manually providing its name and backend URL.
 * This is the primary path for development and direct-URL invitations.
 */
export async function joinClinicManually(
    name: string,
    baseUrl: string,
    inviteCode?: string,
): Promise<Clinic> {
    const clinic: NewClinic = {
        id: randomUUID(),
        name: name.trim(),
        baseUrl: baseUrl.trim().replace(/\/+$/, ""),
        inviteCode: inviteCode?.trim() ?? null,
        joinedAt: new Date(),
        syncedAt: null,
    };
    await db.insert(clinics).values(clinic);
    return clinic as Clinic;
}

/**
 * Resolve a short invite code to a clinic and persist it.
 *
 * Demo codes (DEMO-001, DEMO-002) are resolved instantly from local mock
 * data — no network required. All other codes are sent to the ClinicEZ
 * central registry.
 *
 * Registry response shape: { name: string; baseUrl: string }
 */
export async function joinClinicByInviteCode(code: string): Promise<Clinic> {
    // ── 1. Check demo / mock codes first (no network needed) ──────────────────
    const mock = resolveMockInviteCode(code);
    if (mock) {
        return joinClinicManually(mock.name, mock.baseUrl, code);
    }

    // ── 2. Real registry lookup ────────────────────────────────────────────────
    const registryUrl = `https://api.clinicez.app/v1/invite/${encodeURIComponent(code.trim())}`;
    let data: { name: string; baseUrl: string };
    try {
        const res = await fetch(registryUrl);
        if (!res.ok) {
            throw new Error(`Registry returned ${res.status}`);
        }
        data = (await res.json()) as { name: string; baseUrl: string };
    } catch {
        throw new Error(
            "Could not resolve the invite code. Please check the code and try again, or use manual setup.",
        );
    }

    if (!data.name || !data.baseUrl) {
        throw new Error("Invalid response from clinic registry.");
    }

    return joinClinicManually(data.name, data.baseUrl, code);
}
