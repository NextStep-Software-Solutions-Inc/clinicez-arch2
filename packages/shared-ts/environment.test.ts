import { describe, expect, it } from 'bun:test';
import { isDevelopmentEnvironment } from './environment';

describe('isDevelopmentEnvironment', () => {
  it('returns false in production cloud deployments', () => {
    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        hostname: 'ustp-cdo.clinic.clinicez.net',
        apiBaseUrl: 'https://clinic.api.clinicez.net',
      }),
    ).toBe(false);
  });

  it('does not false-positive when a production clinic facility slug contains "dev"', () => {
    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        hostname: 'dev-medical.clinic.clinicez.net',
        serviceSubdomain: 'clinic',
        apiBaseUrl: 'https://clinic.api.clinicez.net',
      }),
    ).toBe(false);
  });

  it('returns true in deployed cloud dev environments via hostname, API URL, or baseDomain', () => {
    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        hostname: 'ustp-cdo.clinic.dev.clinicez.net',
      }),
    ).toBe(true);

    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        apiBaseUrl: 'https://clinic.api.dev.clinicez.net',
      }),
    ).toBe(true);

    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        apiBaseUrl: 'https://clinic-api.dev.clinicez.net',
      }),
    ).toBe(true);

    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        baseDomain: 'dev.clinicez.net',
      }),
    ).toBe(true);
  });

  it('handles Vercel preview vs Vercel production alias pointed at production API', () => {
    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        hostname: 'clinicez-clinic-git-development-xyz.vercel.app',
      }),
    ).toBe(true);

    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        hostname: 'clinicez-clinic.vercel.app',
        apiBaseUrl: 'https://clinic.api.clinicez.net',
      }),
    ).toBe(false);
  });

  it('returns true for local Metro dev bundle and NODE_ENV=development', () => {
    expect(isDevelopmentEnvironment({ isDevBundle: true })).toBe(true);
    expect(isDevelopmentEnvironment({ nodeEnv: 'development' })).toBe(true);
  });

  it('honors explicit appEnv and vercelEnv overrides', () => {
    expect(isDevelopmentEnvironment({ appEnv: 'production', isDevBundle: true })).toBe(false);
    expect(isDevelopmentEnvironment({ appEnv: 'staging', isDevBundle: true })).toBe(false);
    expect(isDevelopmentEnvironment({ appEnv: 'development', isDevBundle: false })).toBe(true);
    expect(isDevelopmentEnvironment({ vercelEnv: 'production', isDevBundle: true })).toBe(false);
    expect(isDevelopmentEnvironment({ vercelEnv: 'preview', isDevBundle: false })).toBe(true);
  });

  it('returns false for on-premise Edge Docker deployments (LAN IPs, .local, and same-origin "/" proxy)', () => {
    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        hostname: '192.168.1.20',
        apiBaseUrl: 'http://192.168.1.20:8080',
        configuredApiUrl: '/',
      }),
    ).toBe(false);

    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        hostname: 'clinic.local',
        apiBaseUrl: 'http://clinic.local',
        configuredApiUrl: '/',
      }),
    ).toBe(false);

    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        hostname: 'localhost',
        apiBaseUrl: 'http://localhost:8080',
        configuredApiUrl: '/',
      }),
    ).toBe(false);
  });

  it('returns true for local loopback dev hosts without same-origin proxy or explicit prod API', () => {
    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        hostname: 'localhost',
        apiBaseUrl: 'http://localhost:5245',
      }),
    ).toBe(true);

    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        hostname: 'ustp-cdo.lvh.me',
      }),
    ).toBe(true);

    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        hostname: '127.0.0.1',
      }),
    ).toBe(true);
  });

  it('returns false when local prod bundle points at a production API', () => {
    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        nodeEnv: 'production',
        hostname: 'localhost',
        apiBaseUrl: 'https://clinic.api.clinicez.net',
      }),
    ).toBe(false);
  });

  it('handles native mobile builds cleanly', () => {
    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        hostname: null,
        apiBaseUrl: 'https://clinic.api.clinicez.net',
      }),
    ).toBe(false);

    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        hostname: null,
        apiBaseUrl: 'http://192.168.1.20:8080',
      }),
    ).toBe(false);

    expect(
      isDevelopmentEnvironment({
        isDevBundle: false,
        hostname: null,
        apiBaseUrl: 'https://clinic.api.dev.clinicez.net',
      }),
    ).toBe(true);
  });

  it('fails closed (returns false) when no signals are provided', () => {
    expect(isDevelopmentEnvironment()).toBe(false);
    expect(isDevelopmentEnvironment({})).toBe(false);
  });
});
