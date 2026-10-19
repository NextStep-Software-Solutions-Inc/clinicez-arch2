import { api } from './apiClient';
import type { BookingShareSection } from '../sharing/bookingSections';

export interface CreateBookingDraftRequest {
    clinicId: string;
    organizationId?: string | null;
    /** YYYY-MM-DD */
    preferredDate?: string | null;
    /** HH:mm */
    preferredTime?: string | null;
    reason?: string | null;
    notes?: string | null;
    /** JSON array of ShareableFieldKey values */
    shareFieldsJson: string;
    /** PascalCase sharing scope names, never Demographics (the API answers 400 otherwise) */
    shareSections?: BookingShareSection[];
    attachedFileIdsJson?: string;
}

/**
 * Creates a booking draft on the backend and returns the server-assigned UUID.
 */
export async function createBookingDraft(
    getToken: () => Promise<string | null>,
    patientId: string,
    request: CreateBookingDraftRequest,
): Promise<string> {
    return api.post<string>(getToken, `/patients/${patientId}/booking-drafts`, request);
}

/**
 * Submits a ready booking draft to the Clinic Dashboard API via the PatientApp backend.
 * Returns the clinic-assigned booking reference (or null if the Dashboard is not yet ready).
 */
export async function submitBookingDraft(
    getToken: () => Promise<string | null>,
    patientId: string,
    draftId: string,
): Promise<string | null> {
    return api.post<string | null>(
        getToken,
        `/patients/${patientId}/booking-drafts/${draftId}/submit`,
    );
}
