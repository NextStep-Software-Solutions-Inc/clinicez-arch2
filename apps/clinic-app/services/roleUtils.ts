import { StaffRole } from './clinicService';

export interface RoleOption {
  id: string;
  name: string;
  displayName: string;
  isSystem: boolean;
  staffRole: StaffRole;
  description?: string;
}

export const SYSTEM_ROLE_ORDER: StaffRole[] = ['Doctor', 'Nurse', 'Receptionist', 'Cashier', 'Admin'];

export function inferStaffRole(role: { name: string; isSystem?: boolean; permissions?: string[] }): StaffRole {
  const name = role.name.toLowerCase();
  const perms = role.permissions || [];

  if (name.includes('doctor') || name.includes('physician') || perms.includes('consultations:sign')) {
    return 'Doctor';
  }
  if (name.includes('nurse') || perms.includes('triage:write') || perms.includes('procedures:write')) {
    return 'Nurse';
  }
  if (name.includes('cashier') || name.includes('billing') || (perms.includes('billing:write') && !perms.includes('consultations:read'))) {
    return 'Cashier';
  }
  if (name.includes('admin') || name.includes('director') || perms.includes('roles:manage') || perms.includes('settings:manage')) {
    return 'Admin';
  }
  return 'Receptionist';
}

export const FALLBACK_SYSTEM_ROLES: RoleOption[] = [
  {
    id: 'sys-doctor',
    name: 'Attending Physician / Doctor',
    displayName: 'Attending Physician / Doctor',
    isSystem: true,
    staffRole: 'Doctor',
    description: 'Medical encounters, diagnoses, prescriptions, and lab orders',
  },
  {
    id: 'sys-nurse',
    name: 'Triage Nurse',
    displayName: 'Triage Nurse',
    isSystem: true,
    staffRole: 'Nurse',
    description: 'Vital signs, queue prioritization, and clinical procedures',
  },
  {
    id: 'sys-receptionist',
    name: 'Front Desk Receptionist',
    displayName: 'Front Desk Receptionist',
    isSystem: true,
    staffRole: 'Receptionist',
    description: 'Patient check-in, appointments, queue coordination, and ticketing',
  },
  {
    id: 'sys-cashier',
    name: 'Clinic Cashier / Billing Officer',
    displayName: 'Clinic Cashier / Billing Officer',
    isSystem: true,
    staffRole: 'Cashier',
    description: 'Invoice settlement, payments, receipts, and cashier collections',
  },
  {
    id: 'sys-admin',
    name: 'Clinic Administrator',
    displayName: 'Clinic Administrator',
    isSystem: true,
    staffRole: 'Admin',
    description: 'Facility configuration, user permissions, and clinic operations',
  },
];

export interface StaffIdentityRef {
  id?: string | null;
  email?: string | null;
}

/**
 * Determines whether a target staff member record represents the currently authenticated staff member.
 */
export function isSelfStaffMember(
  target: StaffIdentityRef | null | undefined,
  currentActor: StaffIdentityRef | null | undefined,
): boolean {
  if (!target || !currentActor) return false;

  if (target.id && currentActor.id && target.id === currentActor.id) {
    return true;
  }

  const targetEmail = target.email?.trim().toLowerCase();
  const actorEmail = currentActor.email?.trim().toLowerCase();
  if (targetEmail && actorEmail && targetEmail === actorEmail) {
    return true;
  }

  return false;
}

/**
 * Clinic staff must never be able to change or downgrade their own clinic role.
 */
export function canModifyStaffRole(
  target: StaffIdentityRef | null | undefined,
  currentActor: StaffIdentityRef | null | undefined,
): boolean {
  if (!target) return false;
  return !isSelfStaffMember(target, currentActor);
}

