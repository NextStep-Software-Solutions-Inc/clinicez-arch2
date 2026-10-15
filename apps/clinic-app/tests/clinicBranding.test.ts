// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

let mockStorage = new Map<string, string>();
mock.module('../utils/deviceStorage', () => ({
  getDeviceItem: (key: string) => mockStorage.get(key) ?? null,
  setDeviceItem: (key: string, value: string | null) => {
    if (value === null) mockStorage.delete(key);
    else mockStorage.set(key, value);
  },
}));

let mockUpdateSettingsPayload: any = null;
let mockSettingsResponse: any = {
  clinicName: 'St. Jude General Hospital',
  primaryLogoUrl: 'data:image/png;base64,initialLogoData',
  primaryColorHex: '#0D6963',
};

mock.module('../services/clinicService', () => ({
  clinicService: {
    getSettings: () => Promise.resolve([mockSettingsResponse, null]),
    getRooms: () => Promise.resolve([[], null]),
    updateSettings: (payload: any) => {
      mockUpdateSettingsPayload = payload;
      return Promise.resolve([{ ...mockSettingsResponse, ...payload }, null]);
    },
  },
}));

mock.module('../components/FacilityActivationGate', () => ({
  useFacilityLicense: () => ({
    license: { clinicId: 'clinic-1', clinicName: 'St. Jude General Hospital', planTier: 'enterprise' },
  }),
}));

const { ClinicProvider, useClinic, CLINIC_LOGO_STORAGE_KEY } = await import('../context/ClinicContext');

function TestClinicConsumer({ onRender }: { onRender: (ctx: ReturnType<typeof useClinic>) => void }) {
  const ctx = useClinic();
  onRender(ctx);
  return React.createElement('div', { 'data-logo': ctx.clinicLogo ?? '' }, ctx.facilityName);
}

describe('Clinic Branding & Database Logo Persistence', () => {
  beforeEach(() => {
    mockStorage.clear();
    mockUpdateSettingsPayload = null;
    mockSettingsResponse = {
      clinicName: 'St. Jude General Hospital',
      primaryLogoUrl: 'data:image/png;base64,initialLogoData',
      primaryColorHex: '#0D6963',
    };
  });

  test('loads logo from database settings or deviceStorage cache', () => {
    mockStorage.set(CLINIC_LOGO_STORAGE_KEY, 'data:image/png;base64,cachedLogo');

    let captured: any = null;
    renderToStaticMarkup(
      React.createElement(
        ClinicProvider,
        null,
        React.createElement(TestClinicConsumer, {
          onRender: (ctx) => {
            captured = ctx;
          },
        })
      )
    );

    expect(captured).not.toBeNull();
    expect(captured.clinicLogo).toBe('data:image/png;base64,cachedLogo');
    expect(captured.facilityName).toBe('St. Jude General Hospital');
  });

  test('setClinicLogo writes to deviceStorage and commits to backend database', async () => {
    let captured: any = null;
    renderToStaticMarkup(
      React.createElement(
        ClinicProvider,
        null,
        React.createElement(TestClinicConsumer, {
          onRender: (ctx) => {
            captured = ctx;
          },
        })
      )
    );

    const newLogoUri = 'data:image/png;base64,updatedClinicLogoData';
    const success = await captured.setClinicLogo(newLogoUri);

    expect(success).toBe(true);
    // Verified local persistence
    expect(mockStorage.get(CLINIC_LOGO_STORAGE_KEY)).toBe(newLogoUri);
    // Verified database update payload sent to backend API
    expect(mockUpdateSettingsPayload).toEqual({ primaryLogoUrl: newLogoUri });
  });

  test('setClinicLogo with null removes logo from cache and sends empty string to database', async () => {
    mockStorage.set(CLINIC_LOGO_STORAGE_KEY, 'data:image/png;base64,existingLogo');

    let captured: any = null;
    renderToStaticMarkup(
      React.createElement(
        ClinicProvider,
        null,
        React.createElement(TestClinicConsumer, {
          onRender: (ctx) => {
            captured = ctx;
          },
        })
      )
    );

    const success = await captured.setClinicLogo(null);

    expect(success).toBe(true);
    // Verified local cache cleared
    expect(mockStorage.get(CLINIC_LOGO_STORAGE_KEY)).toBeUndefined();
    // Verified database update payload cleared
    expect(mockUpdateSettingsPayload).toEqual({ primaryLogoUrl: '' });
  });
});
