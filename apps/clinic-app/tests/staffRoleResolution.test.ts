import { describe, expect, test } from 'bun:test';
import { inferStaffRole, isSelfStaffMember, canModifyStaffRole } from '../services/roleUtils';

describe('inferStaffRole', () => {
  test('correctly identifies system standard roles', () => {
    expect(inferStaffRole({ name: 'Attending Physician / Doctor', isSystem: true })).toBe('Doctor');
    expect(
      inferStaffRole({
        name: 'Attending Physician / Doctor',
        isSystem: true,
        permissions: ['triage:read', 'triage:write', 'patients:write', 'procedures:write', 'consultations:write', 'consultations:sign'],
      }),
    ).toBe('Doctor');
    expect(inferStaffRole({ name: 'Triage Nurse', isSystem: true })).toBe('Nurse');
    expect(inferStaffRole({ name: 'Front Desk Receptionist', isSystem: true })).toBe('Receptionist');
    expect(inferStaffRole({ name: 'Clinic Cashier / Billing Officer', isSystem: true })).toBe('Cashier');
    expect(inferStaffRole({ name: 'Clinic Administrator', isSystem: true })).toBe('Admin');
    expect(inferStaffRole({ name: 'Data Protection Officer / Compliance Officer', isSystem: true })).toBe('Admin');
  });

  test('correctly infers doctor custom roles by name or signing permission even with triage:write and patients:write', () => {
    expect(inferStaffRole({ name: 'Pediatric Specialist', isSystem: false, permissions: ['consultations:sign'] })).toBe('Doctor');
    expect(
      inferStaffRole({
        name: 'Pediatric Specialist',
        isSystem: false,
        permissions: ['consultations:write', 'consultations:sign', 'patients:write', 'triage:write'],
      }),
    ).toBe('Doctor');
    expect(inferStaffRole({ name: 'Visiting Physician', isSystem: false })).toBe('Doctor');
    expect(inferStaffRole({ name: 'Resident Medical Officer', isSystem: false, permissions: ['consultations:write', 'consultations:sign'] })).toBe('Doctor');
  });

  test('correctly infers nurse custom roles by name or triage/procedure permissions', () => {
    expect(inferStaffRole({ name: 'Head Nurse', isSystem: false })).toBe('Nurse');
    expect(inferStaffRole({ name: 'IV Therapy Nurse', isSystem: false })).toBe('Nurse');
    expect(inferStaffRole({ name: 'Clinical Assistant', isSystem: false, permissions: ['triage:write', 'procedures:write'] })).toBe('Nurse');
  });

  test('correctly infers cashier custom roles by name or billing permissions', () => {
    expect(inferStaffRole({ name: 'Cashier Lead', isSystem: false })).toBe('Cashier');
    expect(inferStaffRole({ name: 'Billing Clerk', isSystem: false, permissions: ['billing:write'] })).toBe('Cashier');
  });

  test('correctly infers administrator custom roles by name or manage permissions', () => {
    expect(inferStaffRole({ name: 'Clinic Operations Director', isSystem: false })).toBe('Admin');
    expect(inferStaffRole({ name: 'Facility Admin', isSystem: false, permissions: ['roles:manage'] })).toBe('Admin');
    expect(inferStaffRole({ name: 'Compliance Supervisor', isSystem: false, permissions: ['audit:read'] })).toBe('Admin');
  });

  test('defaults unmatched roles to Receptionist', () => {
    expect(inferStaffRole({ name: 'General Clerk', isSystem: false, permissions: ['appointments:read'] })).toBe('Receptionist');
  });
});

describe('self-role modification guards (isSelfStaffMember & canModifyStaffRole)', () => {
  test('identifies self by matching staff ID and blocks role modification', () => {
    const self = { id: 'staff-111', email: 'admin@clinic.com' };
    expect(isSelfStaffMember(self, { id: 'staff-111' })).toBe(true);
    expect(canModifyStaffRole(self, { id: 'staff-111' })).toBe(false);
  });

  test('identifies self by case-insensitive email match when IDs differ or are absent', () => {
    const target = { id: 'staff-111', email: 'Dr.Santos@Clinic.com' };
    const actor = { id: 'session-user-1', email: '  dr.santos@clinic.com ' };
    expect(isSelfStaffMember(target, actor)).toBe(true);
    expect(canModifyStaffRole(target, actor)).toBe(false);
  });

  test('allows modifying clinic role of a different staff member', () => {
    const target = { id: 'staff-222', email: 'nurse@clinic.com' };
    const actor = { id: 'staff-111', email: 'admin@clinic.com' };
    expect(isSelfStaffMember(target, actor)).toBe(false);
    expect(canModifyStaffRole(target, actor)).toBe(true);
  });

  test('handles null/undefined inputs safely', () => {
    expect(isSelfStaffMember(null, { id: 'staff-111' })).toBe(false);
    expect(isSelfStaffMember({ id: 'staff-111' }, null)).toBe(false);
    expect(canModifyStaffRole(null, { id: 'staff-111' })).toBe(false);
  });
});
