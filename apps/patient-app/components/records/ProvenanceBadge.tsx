import React from 'react';
import Badge, { type BadgeTone } from '../ui/Badge';
import type { IconName } from '../ui/iconNames';

export type RecordProvenanceType = 'clinicez_verified' | 'external_lab' | 'patient_uploaded';

export interface ProvenanceBadgeProps {
  provenance?: RecordProvenanceType | string | null;
  facilityName?: string | null;
  clinicId?: string | null;
  compact?: boolean;
}

export interface ProvenanceMeta {
  label: string;
  tone: BadgeTone;
  icon: IconName;
}

/**
 * Pure metadata resolver for record provenance.
 */
export function getProvenanceMeta(
  provenance?: string | null,
  clinicId?: string | null,
  facilityName?: string | null
): ProvenanceMeta {
  const isVerified =
    provenance === 'clinicez_verified' ||
    Boolean(clinicId && provenance !== 'patient_uploaded');

  if (isVerified) {
    return {
      label: facilityName ? `Verified · ${facilityName}` : 'ClinicEZ Verified',
      tone: 'primary',
      icon: 'checkCircle',
    };
  }

  if (provenance === 'external_lab') {
    return {
      label: facilityName ? `External Lab · ${facilityName}` : 'External Lab',
      tone: 'info',
      icon: 'hospital',
    };
  }

  return {
    label: facilityName ? `Outside · ${facilityName}` : 'Uploaded by You',
    tone: 'neutral',
    icon: 'upload',
  };
}

export const ProvenanceBadge: React.FC<ProvenanceBadgeProps> = ({
  provenance,
  facilityName,
  clinicId,
  compact = false,
}) => {
  const meta = getProvenanceMeta(provenance, clinicId, compact ? null : facilityName);

  return (
    <Badge
      label={compact && meta.label.length > 20 ? meta.label.slice(0, 18) + '…' : meta.label}
      tone={meta.tone}
      icon={meta.icon}
      size="sm"
    />
  );
};

export default ProvenanceBadge;
