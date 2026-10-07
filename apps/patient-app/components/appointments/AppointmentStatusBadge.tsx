import React from 'react';
import Badge, { type BadgeTone } from '../ui/Badge';
import type { AppointmentStatus } from '../../services/appointments/types';

interface AppointmentStatusBadgeProps {
  status: AppointmentStatus;
  size?: 'sm' | 'md';
}

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: 'Confirmed',
  pending: 'Pending',
  canceled: 'Canceled',
  action_required: 'Action Required',
  completed: 'Completed',
  no_show: 'No Show',
};

const STATUS_TONES: Record<AppointmentStatus, BadgeTone> = {
  confirmed: 'success',
  pending: 'neutral',
  canceled: 'danger',
  action_required: 'urgent',
  completed: 'primary',
  no_show: 'neutral',
};

export default function AppointmentStatusBadge({ status, size = 'md' }: AppointmentStatusBadgeProps) {
  return (
    <Badge
      label={STATUS_LABELS[status] ?? status}
      tone={STATUS_TONES[status] ?? 'neutral'}
      size={size}
    />
  );
}
