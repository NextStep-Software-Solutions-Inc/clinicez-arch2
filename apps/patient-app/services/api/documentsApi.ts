import { api } from './apiClient';
import { appendFilePart, type UploadFile } from './multipart';
import {
    externalDispenseAckSchema,
    labResultUploadAckSchema,
    syncChangesPageSchema,
    type ExternalDispenseAck,
    type LabResultUploadAck,
    type SyncChangesPage,
} from './documentsSchemas';

export * from './documentsSchemas';

export interface ExternalDispenseInput {
    pharmacyName: string;
    branchLocation?: string;
    pharmacistName?: string;
    receiptNumber?: string;
    notes?: string;
    receipt?: UploadFile;
}

export const SYNC_CHANGES_PAGE_SIZE = 200;

// ── Documents API ─────────────────────────────────────────────────────────────

export async function fetchSyncChanges(
    getToken: () => Promise<string | null>,
    patientId: string,
    since: string | null,
): Promise<SyncChangesPage> {
    const params = new URLSearchParams({ take: String(SYNC_CHANGES_PAGE_SIZE) });
    if (since) params.set('since', since);
    const data = await api.get<unknown>(getToken, `/patients/${patientId}/sync/changes?${params}`);
    return syncChangesPageSchema.parse(data);
}

export async function uploadLabResult(
    getToken: () => Promise<string | null>,
    patientId: string,
    requisitionId: string,
    file: UploadFile,
    notes?: string,
): Promise<LabResultUploadAck> {
    const form = new FormData();
    await appendFilePart(form, 'file', file);
    if (notes) form.append('notes', notes);
    const data = await api.postForm<unknown>(
        getToken,
        `/patients/${patientId}/lab-requests/${requisitionId}/results`,
        form,
    );
    return labResultUploadAckSchema.parse(data);
}

export async function submitExternalDispense(
    getToken: () => Promise<string | null>,
    patientId: string,
    prescriptionId: string,
    input: ExternalDispenseInput,
): Promise<ExternalDispenseAck> {
    const form = new FormData();
    form.append('pharmacyName', input.pharmacyName);
    if (input.branchLocation) form.append('branchLocation', input.branchLocation);
    if (input.pharmacistName) form.append('pharmacistName', input.pharmacistName);
    if (input.receiptNumber) form.append('receiptNumber', input.receiptNumber);
    if (input.notes) form.append('notes', input.notes);
    if (input.receipt) await appendFilePart(form, 'receipt', input.receipt);
    const data = await api.postForm<unknown>(
        getToken,
        `/patients/${patientId}/prescriptions/${prescriptionId}/external-dispense`,
        form,
    );
    return externalDispenseAckSchema.parse(data);
}
