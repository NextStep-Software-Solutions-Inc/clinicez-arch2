import React from 'react';
import Badge, { type BadgeTone } from '../ui/Badge';
import type { IconName } from '../ui/iconNames';

export type ClinicalUrgencyType = 'routine' | 'urgent' | 'stat' | 'critical';

export interface ClinicalUrgencyBadgeProps {
  urgency?: ClinicalUrgencyType | string | null;
  isCritical?: boolean | null;
  showRoutine?: boolean;
  size?: 'sm' | 'md';
}

export interface UrgencyMeta {
  label: string;
  tone: BadgeTone;
  icon: IconName;
  shouldDisplay: boolean;
}

/**
 * Pure metadata resolver for clinical urgency visual encoding.
 */
export function getUrgencyMeta(
  urgency?: string | null,
  isCritical?: boolean | null,
  showRoutine = false
): UrgencyMeta {
  const norm = (urgency ?? '').toLowerCase();

  if (isCritical || norm === 'stat' || norm === 'critical') {
    return {
      label: norm === 'stat' ? 'Critical (STAT)' : 'Critical',
      tone: 'danger',
      icon: 'alert',
      shouldDisplay: true,
    };
  }

  if (norm === 'urgent') {
    return {
      label: 'Urgent',
      tone: 'urgent',
      icon: 'warning',
      shouldDisplay: true,
    };
  }

  return {
    label: 'Routine',
    tone: 'routine',
    icon: 'info',
    shouldDisplay: showRoutine,
  };
}

export const ClinicalUrgencyBadge: React.FC<ClinicalUrgencyBadgeProps> = ({
  urgency,
  isCritical,
  showRoutine = false,
  size = 'sm',
}) => {
  const meta = getUrgencyMeta(urgency, isCritical, showRoutine);

  if (!meta.shouldDisplay) {
    return null;
  }

  return (
    <Badge
      label={meta.label}
      tone={meta.tone}
      icon={meta.icon}
      size={size}
    />
  );
};

export default ClinicalUrgencyBadge;
