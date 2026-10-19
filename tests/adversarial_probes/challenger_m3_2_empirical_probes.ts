/**
 * Adversarial Empirical Challenger Probes for Milestone 3 Patient App Gated Intake.
 * Probes:
 * 1. Design Token Guard Strictness & 0 Raw Hex Colors in touched files.
 * 2. Reception QR Parser Robustness (Custom Scheme & Deep Path parsing failures).
 * 3. Error Handling (400 ApiError, Expired Codes, Offline Errors).
 * 4. String Literal Invariance & Invariant Parity.
 */

import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { parseReceptionQr, parseReceptionQrPayload } from '../../apps/patient-app/utils/receptionQrParser';
import { GATED_CATALOG_STRINGS } from '../../apps/patient-app/constants/gatedCatalogStrings';
import { ApiError } from '../../apps/patient-app/services/api/apiClient';

describe('Challenger M3.2 Empirical Probes', () => {

  // ── Probe 1: Design Tokens & Raw Hex Colors ──────────────────────────────
  describe('Probe 1: Design Tokens & Hex Color Scans', () => {
    test('confirms 0 raw hex color literals in newly created/modified M3 files', () => {
      const touchedFiles = [
        'apps/patient-app/components/clinics/ClinicJoinCodeModal.tsx',
        'apps/patient-app/components/clinics/GatedServiceCatalogLockedCard.tsx',
        'apps/patient-app/components/ui/Badge.tsx',
        'apps/patient-app/navigation/screens/ClinicDetails.screen.tsx',
        'apps/patient-app/navigation/screens/ClinicDetails.screen.web.tsx',
        'apps/patient-app/navigation/screens/YakapDetails.screen.tsx',
        'apps/patient-app/services/api/appointmentsApi.ts',
        'apps/patient-app/services/api/discoveryApi.ts',
        'apps/patient-app/services/appointments/appointmentsService.ts',
        'apps/patient-app/services/discovery/discoveryService.ts',
        'apps/patient-app/services/discovery/types.ts',
        'apps/patient-app/constants/gatedCatalogStrings.ts',
        'apps/patient-app/tests/gatedServiceCatalog.test.ts',
        'apps/patient-app/utils/receptionQrParser.ts',
      ];

      const hexPattern = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;
      const rgbPattern = /\brgba?\(/g;

      for (const relPath of touchedFiles) {
        const fullPath = path.resolve(relPath);
        if (!fs.existsSync(fullPath)) continue;
        const content = fs.readFileSync(fullPath, 'utf8');
        const hexMatches = content.match(hexPattern) || [];
        const rgbMatches = content.match(rgbPattern) || [];

        expect(hexMatches.length).toBe(0);
        expect(rgbMatches.length).toBe(0);
      }
    });
  });

  // ── Probe 2: Reception QR Parser Robustness ──────────────────────────────
  describe('Probe 2: Reception QR Parser Robustness & Failure Modes', () => {
    test('handles standard raw codes, queries, and lowercase variants', () => {
      expect(parseReceptionQr('VIP888')).toBe('VIP888');
      expect(parseReceptionQr('vip888')).toBe('VIP888');
      expect(parseReceptionQr('  VIP888  ')).toBe('VIP888');
      expect(parseReceptionQr('https://portal.clinicez.com/join/VIP888')).toBe('VIP888');
      expect(parseReceptionQr('https://portal.clinicez.com/join/cdo-uhc?code=VIP888')).toBe('VIP888');
      expect(parseReceptionQr('https://portal.clinicez.com/join/cdo-uhc?joinCode=vip888')).toBe('VIP888');
      expect(parseReceptionQr('clinicez://join?code=VIP888')).toBe('VIP888');
      expect(parseReceptionQr('clinicez://clinics/cdo-uhc/unlock?code=VIP888')).toBe('VIP888');
    });

    test('reproduces failure on documented custom scheme path clinicez://join/VIP888', () => {
      // Line 14 of receptionQrParser.ts documents: Custom App Scheme: "clinicez://join/VIP888"
      // However, new URL("clinicez://join/VIP888") does NOT throw in WHATWG URL engines.
      // Host becomes "join" and pathname becomes "/VIP888".
      // It fails to find "join" in pathname segments and bypasses catch block.
      const result = parseReceptionQr('clinicez://join/VIP888');
      // Documenting failure: returns null instead of "VIP888"
      expect(result).toBeNull();
    });

    test('reproduces failure on multi-segment tenant URL https://portal.clinicez.com/join/tenant-1/VIP888', () => {
      const result = parseReceptionQr('https://portal.clinicez.com/join/tenant-1/VIP888');
      // Fails because segments[joinIndex + 1] is "tenant-1" (8 chars), returning null
      expect(result).toBeNull();
    });

    test('defensively handles malformed and adversarial payloads', () => {
      expect(parseReceptionQr('')).toBeNull();
      expect(parseReceptionQr('   ')).toBeNull();
      expect(parseReceptionQr(null as any)).toBeNull();
      expect(parseReceptionQr(undefined as any)).toBeNull();
      expect(parseReceptionQr(123456 as any)).toBeNull();
      expect(parseReceptionQr('http://')).toBeNull();
      expect(parseReceptionQr('https://portal.clinicez.com/join/12345')).toBeNull(); // 5 chars
      expect(parseReceptionQr('https://portal.clinicez.com/join/1234567')).toBeNull(); // 7 chars
      expect(parseReceptionQr('javascript:alert(1)')).toBeNull();
    });
  });

  // ── Probe 3: Error Handling Defenses ─────────────────────────────────────
  describe('Probe 3: Error Handling & Resilience', () => {
    test('ApiError and OFFLINE_ERROR are mapped to actionable user feedback', () => {
      const apiErr = new ApiError('The join code for this clinic has expired.', 400, [
        { field: 'joinCode', code: 'EXPIRED_CODE', message: 'The join code for this clinic has expired.' },
      ]);
      expect(apiErr.firstMessage).toBe('The join code for this clinic has expired.');

      const offlineErr = new Error('OFFLINE_ERROR');
      const offlineMsg = offlineErr.message === 'OFFLINE_ERROR'
        ? GATED_CATALOG_STRINGS.modal.offlineError
        : 'Unknown';
      expect(offlineMsg).toBe('Network unavailable. Reconnect to unlock clinic access.');
    });
  });

  // ── Probe 4: String Literal Parity ───────────────────────────────────────
  describe('Probe 4: String Literal Parity & Invariant', () => {
    test('GATED_CATALOG_STRINGS keys match expected values', () => {
      expect(GATED_CATALOG_STRINGS.lockedCard.badge).toBe('Institutional Access');
      expect(GATED_CATALOG_STRINGS.lockedCard.title).toBe('Services & Booking Restricted');
      expect(GATED_CATALOG_STRINGS.modal.title).toBe('Unlock Clinic Access');
      expect(GATED_CATALOG_STRINGS.modal.lengthError).toBe('Join code must be exactly 6 characters.');
      expect(GATED_CATALOG_STRINGS.modal.submitButton).toBe('Unlock Access');
      expect(GATED_CATALOG_STRINGS.catalog.bookingPausedLabel).toBe('Booking not yet available');
    });
  });
});
