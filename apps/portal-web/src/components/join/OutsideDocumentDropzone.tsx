"use client";

import React, { useState } from "react";
import { UploadCloud, FileText, Trash2, ShieldAlert, AlertCircle } from "lucide-react";
import { validateFileUpload } from "@/lib/join";
import { type PatientJoinAttachmentItem } from "./types";

interface OutsideDocumentDropzoneProps {
  attachments: PatientJoinAttachmentItem[];
  onChange: (attachments: PatientJoinAttachmentItem[]) => void;
}

const DOCUMENT_TYPES = [
  { value: "OutsideChestXRay", label: "Outside Chest X-Ray Film / Report" },
  { value: "LabResult", label: "Laboratory / Diagnostic Result" },
  { value: "ImagingReport", label: "Ultrasound / CT / MRI Report" },
  { value: "MedicalCertificate", label: "Medical Certificate / Clearance" },
  { value: "ImmunizationRecord", label: "Vaccination / Immunization Card" },
  { value: "ExternalReferral", label: "External Referral Note" },
  { value: "DiagnosticReport", label: "Other Diagnostic Report" },
];

export function OutsideDocumentDropzone({ attachments, onChange }: OutsideDocumentDropzoneProps) {
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (attachments.length + files.length > 5) {
      setError("Maximum of 5 outside attachments allowed per submission.");
      return;
    }

    const newAttachments: PatientJoinAttachmentItem[] = [...attachments];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validation = validateFileUpload({
        name: file.name,
        sizeBytes: file.size,
        mimeType: file.type,
      });

      if (!validation.isValid) {
        setError(validation.errorMessage || `"${file.name}" could not be uploaded.`);
        return;
      }

      newAttachments.push({
        id: crypto.randomUUID(),
        title: file.name.replace(/\.[^/.]+$/, ""),
        fileName: file.name,
        contentType: file.type,
        fileType: file.type,
        fileSizeBytes: file.size,
        category: "OutsideDiagnostic",
        recordType: "OutsideChestXRay",
        documentDate: new Date().toISOString().split("T")[0],
        notes: "Uploaded by patient via public join registration (PendingVerification)",
      });
    }

    onChange(newAttachments);
    e.target.value = "";
  };

  const handleRemove = (index: number) => {
    const updated = attachments.filter((_, i) => i !== index);
    onChange(updated);
  };

  const handleTypeChange = (index: number, newType: string) => {
    const updated = [...attachments];
    updated[index].recordType = newType;
    onChange(updated);
  };

  return (
    <div className="space-y-4">
      {/* Clinical Quarantine Disclosure Notice Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-warning/10 border border-warning/20 text-foreground text-xs">
        <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">Document Quarantine Notice:</span> Uploaded medical files are placed in secure clinical quarantine (
          <code className="font-mono font-bold text-warning">PendingVerification</code>) until reviewed and approved by clinic healthcare staff.
        </div>
      </div>

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl flex items-center gap-2 text-destructive text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Dropzone Area */}
      <label className="border-2 border-dashed border-border hover:border-primary/50 bg-card hover:bg-muted/30 rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors text-center group">
        <UploadCloud className="w-10 h-10 text-muted-foreground group-hover:text-primary transition-colors mb-2" />
        <span className="text-xs font-bold text-foreground">
          Click or drag files here to upload
        </span>
        <span className="text-[11px] text-muted-foreground mt-0.5">
          PDF, PNG, JPEG up to 10MB each (Maximum 5 outside documents)
        </span>
        <input
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          className="hidden"
          onChange={handleFileChange}
        />
      </label>

      {/* Uploaded Files List */}
      {attachments.length > 0 && (
        <div className="space-y-2.5">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
            Staged Documents ({attachments.length}/5)
          </span>
          {attachments.map((file, idx) => (
            <div
              key={file.id || idx}
              className="bg-card border border-border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <span className="font-semibold text-foreground truncate block">{file.fileName}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {(file.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB &bull; Quarantined as PendingVerification
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <select
                  value={file.recordType || "OutsideChestXRay"}
                  onChange={(e) => handleTypeChange(idx, e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-input text-xs bg-background text-foreground"
                >
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg transition-colors cursor-pointer"
                  title="Remove document"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
