import axios from "axios";
import { joinApiUrl } from "@shared/safe";
import { getPortalApiUrl } from "@/utils/domain";

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
  clinicAddress?: string | null;
  clinicContact?: string | null;
  doctorName?: string | null;
  doctorPrcLicense?: string | null;
  doctorPtr?: string | null;
  doctorS2License?: string | null;
  patientName?: string | null;
  patientInitials?: string | null;
  patientAge?: number | null;
  patientGender?: string | null;
  patientAllergies?: string | null;
  clinicalDiagnosis?: string | null;
  items?: PublicRxItem[];
  dispenseStatus: string;
  isValid: boolean;
  isAlreadyDispensed: boolean;
  dispensedPharmacyName?: string | null;
  dispensedReceiptNumber?: string | null;
  dispensedAt?: string | null;
  dispenseNotes?: string | null;
  expiresAt?: string | null;
  isExpired: boolean;
  hasDangerousDrug?: boolean;
  itemCount?: number;
  syncStatus?: string;
  isOfflinePending?: boolean;
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
    const portalApiUrl = getPortalApiUrl();
    const targetUrl = joinApiUrl(
      portalApiUrl,
      `/public/rx-upload/${encodeURIComponent(token)}/info`
    );

    const res = await axios.get<{ succeeded?: boolean; success?: boolean; data?: PublicRxUploadInfo } & PublicRxUploadInfo>(
      targetUrl
    );
    const body = res.data;
    return (body.data || body) as PublicRxUploadInfo;
  },

  submitRxDispense: async (
    token: string,
    payload: SubmitRxDispensePayload,
    onProgress?: (progress: number) => void
  ) => {
    const portalApiUrl = getPortalApiUrl();

    if (payload.file) {
      const formData = new FormData();
      formData.append("externalPharmacyName", payload.externalPharmacyName);
      if (payload.externalBranchLocation) formData.append("externalBranchLocation", payload.externalBranchLocation);
      if (payload.pharmacistName) formData.append("pharmacistName", payload.pharmacistName);
      if (payload.pharmacistPrcLicense) formData.append("pharmacistPrcLicense", payload.pharmacistPrcLicense);
      if (payload.officialReceiptNumber) formData.append("officialReceiptNumber", payload.officialReceiptNumber);
      if (payload.notes) formData.append("notes", payload.notes);
      formData.append("file", payload.file);

      const targetUrl = joinApiUrl(
        portalApiUrl,
        `/public/rx-upload/${encodeURIComponent(token)}/multipart`
      );

      const res = await axios.post(
        targetUrl,
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
      const targetUrl = joinApiUrl(
        portalApiUrl,
        `/public/rx-upload/${encodeURIComponent(token)}`
      );

      const res = await axios.post(
        targetUrl,
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
