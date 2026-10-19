import axios from "axios";
import { stripApiPrefix } from "@shared/safe";

// Public endpoints do not require Clerk authentication
const API_BASE = typeof window !== "undefined" ? "" : stripApiPrefix(process.env.NEXT_PUBLIC_CLINIC_API_URL || "http://localhost:5245");

export interface PublicRxItem {
  itemId: string;
  genericName: string;
  brandName?: string;
  dosage: string;
  form: string;
  sig: string;
  quantity: number;
  durationDays?: number;
  refills: number;
  isDangerousDrug: boolean;
  remarks?: string;
}

export interface PublicRxUploadInfo {
  prescriptionNumber: string;
  issuedAt: string;
  clinicName: string;
  clinicAddress: string;
  clinicContact: string;
  doctorName: string;
  doctorPrcLicense: string;
  doctorPtr?: string;
  doctorS2License?: string;
  patientName: string;
  patientInitials: string;
  patientAge: number;
  patientGender: string;
  patientAllergies?: string;
  clinicalDiagnosis?: string;
  items: PublicRxItem[];
  dispenseStatus: string;
  isValid: boolean;
  isAlreadyDispensed: boolean;
  dispensedPharmacyName?: string;
  dispensedReceiptNumber?: string;
  dispensedAt?: string;
  dispenseNotes?: string;
  expiresAt?: string;
  isExpired: boolean;
}

export interface SubmitRxDispensePayload {
  externalPharmacyName: string;
  externalBranchLocation?: string;
  pharmacistName?: string;
  pharmacistPrcLicense?: string;
  officialReceiptNumber?: string;
  notes?: string;
  file?: File;
  fileBase64?: string;
}

export const dropzoneService = {
  // e-Prescription Dropzone
  getRxUploadInfo: async (token: string): Promise<PublicRxUploadInfo> => {
    const res = await axios.get<{ data: PublicRxUploadInfo }>(
      `${API_BASE}/api/v1/public/rx-upload/${token}/info`
    );
    return res.data.data;
  },

  submitRxDispense: async (
    token: string,
    payload: SubmitRxDispensePayload,
    onProgress?: (progress: number) => void
  ) => {
    if (payload.file) {
      const formData = new FormData();
      formData.append("externalPharmacyName", payload.externalPharmacyName);
      if (payload.externalBranchLocation) formData.append("externalBranchLocation", payload.externalBranchLocation);
      if (payload.pharmacistName) formData.append("pharmacistName", payload.pharmacistName);
      if (payload.pharmacistPrcLicense) formData.append("pharmacistPrcLicense", payload.pharmacistPrcLicense);
      if (payload.officialReceiptNumber) formData.append("officialReceiptNumber", payload.officialReceiptNumber);
      if (payload.notes) formData.append("notes", payload.notes);
      formData.append("file", payload.file);

      const res = await axios.post(
        `${API_BASE}/api/v1/public/rx-upload/${token}/multipart`,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total && onProgress) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              onProgress(percent);
            }
          },
        }
      );
      return res.data;
    } else {
      const res = await axios.post(
        `${API_BASE}/api/v1/public/rx-upload/${token}`,
        {
          externalPharmacyName: payload.externalPharmacyName,
          externalBranchLocation: payload.externalBranchLocation,
          pharmacistName: payload.pharmacistName,
          pharmacistPrcLicense: payload.pharmacistPrcLicense,
          officialReceiptNumber: payload.officialReceiptNumber,
          receiptDocumentUrl: payload.fileBase64,
          notes: payload.notes,
        }
      );
      return res.data;
    }
  },
};
