import { describe, expect, it } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  canAccessPatientIdentityDirectory,
  formatIdentityActor,
  getPatientIdentityBadgeMeta,
  isValidClerkUserId,
} from '@/components/PatientIdentityDirectoryPanel';
import { SelectField } from '@/components/ui/SelectField';
import { ADMIN_PERMISSIONS } from '@/constants/permissions';
import { SIDEBAR_GROUPS } from '@/routes/_auth';

describe('Phase 1E Patient Identity Directory governance helpers & SelectField', () => {
  it('validates strict live Clerk user_* identifiers and rejects legacy Auth0 or whitespace', () => {
    expect(isValidClerkUserId('user_2abcXYZ123')).toBe(true);
    expect(isValidClerkUserId('auth0|65f123456789')).toBe(false);
    expect(isValidClerkUserId('user_')).toBe(false);
    expect(isValidClerkUserId('user_has space')).toBe(false);
    expect(isValidClerkUserId('')).toBe(false);
    expect(isValidClerkUserId(null)).toBe(false);
  });

  it('grants access to SuperAdmins, manage:migrations, and manage:admins only', () => {
    expect(canAccessPatientIdentityDirectory({ isSuperAdmin: true, permissions: [] })).toBe(true);
    expect(
      canAccessPatientIdentityDirectory({
        isSuperAdmin: false,
        permissions: [ADMIN_PERMISSIONS.MANAGE_MIGRATIONS],
      })
    ).toBe(true);
    expect(
      canAccessPatientIdentityDirectory({
        isSuperAdmin: false,
        permissions: [ADMIN_PERMISSIONS.MANAGE_ADMINS],
      })
    ).toBe(true);
    expect(
      canAccessPatientIdentityDirectory({
        isSuperAdmin: false,
        permissions: [ADMIN_PERMISSIONS.VIEW_ANALYTICS, ADMIN_PERMISSIONS.VIEW_TENANTS],
      })
    ).toBe(false);
    expect(canAccessPatientIdentityDirectory(null)).toBe(false);
  });

  it('maps all four identity statuses to clear, plain-English labels', () => {
    expect(getPatientIdentityBadgeMeta('ClerkLinked').label).toBe('Signed In');
    expect(getPatientIdentityBadgeMeta('Reclaimed').label).toBe('Auto-Linked');
    expect(getPatientIdentityBadgeMeta('Unlinked').label).toBe('Awaiting Sign-Up');
    expect(getPatientIdentityBadgeMeta('AmbiguousEmail').label).toBe('Duplicate Email');
  });

  it('formats internal actor markers into human-readable labels', () => {
    expect(formatIdentityActor('System:ClerkEmailReclaim')).toBe('Auto-linked by email');
    expect(formatIdentityActor('System:V1Sync')).toBe('Classic (v1) sync');
    expect(formatIdentityActor('AdminReconcile:ops@clinicez.com')).toBe('Admin · ops@clinicez.com');
    expect(formatIdentityActor(null)).toBe('—');
    expect(formatIdentityActor('')).toBe('—');
  });

  it('renders custom SelectField as accessible combobox with zero raw <select> elements', () => {
    const html = renderToStaticMarkup(
      React.createElement(SelectField, {
        ariaLabel: 'Target Tenant',
        value: 'ustp-cdo',
        onValueChange: () => {},
        options: [
          { value: 'ustp-cdo', label: 'USTP Medical Clinic', badge: 'Active' },
          { value: 'ustp-cdo', label: 'Duplicate Tenant' },
          { value: 'cebu-doc', label: 'Cebu Doctors Clinic' },
        ],
      })
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('data-slot="select-trigger"');
    expect(html).toContain('USTP Medical Clinic');
    expect(html).toContain('Active');
    expect(html).not.toContain('Duplicate Tenant');
    expect(html).not.toContain('<select');
  });

  it('registers Patient Identities in the Administration & Security sidebar group', () => {
    const adminGroup = SIDEBAR_GROUPS.find((g) => g.name === 'Administration & Security');
    expect(adminGroup).toBeDefined();
    expect(adminGroup?.items.some((item) => item.to === '/patient-identities')).toBe(true);
  });
});
