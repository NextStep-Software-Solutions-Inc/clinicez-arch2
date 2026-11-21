// token-guard:ignore-file
import { describe, test, expect, mock, beforeEach } from 'bun:test';
import React from 'react';

const createMockComponent = (name: string) => {
  const Comp = ({ children, ...props }: any) =>
    React.createElement('div', { 'data-component': name, ...props }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Text: createMockComponent('Text'),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
}));

const { clinicService } = await import('../services/clinicService');
const { clinicApiClient } = await import('../services/apiClient');

describe('clinicService.resolveWorkspace', () => {
  beforeEach(() => {
    mock.restore();
  });

  test('resolves directly when input is an active facility slug', async () => {
    const mockLicense = {
      status: 'Active' as const,
      clinicId: '45f95f27-6231-4183-ac0b-1b5a76e22901',
      clinicName: 'Nextstep OPD',
      facilitySlug: 'nextstep',
      tenantSlug: 'nexstep',
      planTier: 'pro',
      limits: { maxStaff: 25 },
      activeStaffCount: 4,
      enabledFeatures: ['ElectronicPrescriptions'],
      expiresAtUtc: null,
      isTampered: false,
      errorMessage: null,
      primaryLogoUrl: null,
      primaryColorHex: null,
    };

    clinicApiClient.get = mock(async (url: string, config?: any) => {
      if (url === '/clinic/license' && config?.headers?.['X-Facility-Slug'] === 'nextstep') {
        return [mockLicense, null];
      }
      return [null, null];
    }) as any;

    const [res, err] = await clinicService.resolveWorkspace('nextstep');
    expect(err).toBeNull();
    expect(res).not.toBeNull();
    expect(res?.facilitySlug).toBe('nextstep');
    expect(res?.status).toBe('Active');
  });

  test('resolves facility when input is a tenant slug with typo via candidate derivation', async () => {
    // When queried with tenant 'nexstep', server returns clinicName 'Nextstep OPD' but facilitySlug null
    const mockTenantLicense = {
      status: 'ActivationRequired' as const,
      clinicId: '00000000-0000-0000-0000-00000000dead',
      clinicName: 'Nextstep OPD',
      facilitySlug: null,
      tenantSlug: null,
      planTier: 'Community',
      limits: { maxStaff: 5 },
      activeStaffCount: 0,
      enabledFeatures: ['ElectronicPrescriptions'],
      expiresAtUtc: null,
      isTampered: false,
      errorMessage: null,
      primaryLogoUrl: null,
      primaryColorHex: null,
    };

    const mockVerifiedFacilityLicense = {
      status: 'Active' as const,
      clinicId: '45f95f27-6231-4183-ac0b-1b5a76e22901',
      clinicName: 'Nextstep OPD',
      facilitySlug: 'nextstep',
      tenantSlug: 'nexstep',
      planTier: 'pro',
      limits: { maxStaff: 25 },
      activeStaffCount: 4,
      enabledFeatures: ['ElectronicPrescriptions'],
      expiresAtUtc: null,
      isTampered: false,
      errorMessage: null,
      primaryLogoUrl: null,
      primaryColorHex: null,
    };

    clinicApiClient.get = mock(async (url: string, config?: any) => {
      if (config?.headers?.['X-Facility-Slug'] === 'nexstep') {
        return [null, { message: 'Facility not found', status: 404 }];
      }
      if (config?.headers?.['X-Tenant-Id'] === 'nexstep') {
        return [mockTenantLicense, null];
      }
      if (config?.headers?.['X-Facility-Slug'] === 'nextstep') {
        return [mockVerifiedFacilityLicense, null];
      }
      return [null, null];
    }) as any;

    const [res, err] = await clinicService.resolveWorkspace('nexstep');
    expect(err).toBeNull();
    expect(res).not.toBeNull();
    expect(res?.facilitySlug).toBe('nextstep');
    expect(res?.status).toBe('Active');
  });

  test('returns 404 error when workspace does not exist anywhere', async () => {
    clinicApiClient.get = mock(async () => [null, { message: 'Not found', status: 404 }]) as any;

    const [res, err] = await clinicService.resolveWorkspace('non-existent-workspace');
    expect(res).toBeNull();
    expect(err).not.toBeNull();
    expect(err?.status).toBe(404);
  });
});
