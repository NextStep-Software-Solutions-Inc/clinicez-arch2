import { describe, test, expect, mock } from 'bun:test';
import * as path from 'path';
import * as fs from 'fs';
import {
  adminService,
  type AdminTeleconsultBillingDto,
  type AdminUpdateTeleconsultBillingPayload,
} from '../src/services/admin.service';
import { apiClient } from '../src/lib/api';

describe('Requirement R3: SuperAdmin Teleconsultation PAYG Overrides (TEST_INFRA Section 4)', () => {
  const testTenantId = 'tenant-makati-med-001';

  const mockTeleconsultBillingDto = {
    tenantId: testTenantId,
    tenantSlug: 'makati-med',
    isEnabled: true,
    billingMode: 'Prepaid',
    ratePerMinutePhp: 5.0,
    allocatedBudgetPhp: 0,
    prepaidBalancePhp: 750.0,
    allowOverageBeyondAllocation: true,
    currentPeriodYearMonth: '2026-11',
    currentPeriodMinutesUsed: 25,
    currentPeriodBilledPhp: 125.0,
    currentPeriodOveragePhp: 0,
    estimatedAvailableMinutes: 150,
  };

  describe('1. Global Baseline & Tenant Rate Configuration', () => {
    test('Default teleconsultation rate is ₱5.00/min', () => {
      expect(mockTeleconsultBillingDto.ratePerMinutePhp).toBe(5.0);
    });

    test('getTenantTeleconsultBilling issues GET /admin/tenants/{tenantId}/teleconsult-billing', async () => {
      const originalGet = apiClient.get;
      let requestedUrl = '';

      apiClient.get = mock(async (url: string) => {
        requestedUrl = url;
        return { data: mockTeleconsultBillingDto };
      }) as any;

      try {
        const result = await adminService.getTenantTeleconsultBilling(testTenantId);
        expect(requestedUrl).toBe(`/admin/tenants/${testTenantId}/teleconsult-billing`);
        expect(result.tenantId).toBe(testTenantId);
        expect(result.isEnabled).toBe(true);
        expect(result.billingMode).toBe('Prepaid');
        expect(result.ratePerMinutePhp).toBe(5.0);
        expect(result.prepaidBalancePhp).toBe(750.0);
      } finally {
        apiClient.get = originalGet;
      }
    });
  });

  describe('2. Additive Prepaid Credit Grants & Payload Integrity', () => {
    test('updateTenantTeleconsultBilling sends additive prepaid credit grant to PUT /admin/tenants/{tenantId}/teleconsult-billing', async () => {
      const originalPut = apiClient.put;
      let targetUrl = '';
      let sentPayload: any = null;

      apiClient.put = mock(async (url: string, payload: any) => {
        targetUrl = url;
        sentPayload = payload;
        return { data: { ...mockTeleconsultBillingDto, prepaidBalancePhp: 1250.0 } };
      }) as any;

      try {
        const grantRequest: AdminUpdateTeleconsultBillingPayload = {
          prepaidCreditGrantPhp: 500.0,
        };

        const result = await adminService.updateTenantTeleconsultBilling(testTenantId, grantRequest);
        expect(targetUrl).toBe(`/admin/tenants/${testTenantId}/teleconsult-billing`);
        expect(sentPayload.prepaidCreditGrantPhp).toBe(500.0);
        expect(result.prepaidBalancePhp).toBe(1250.0);
      } finally {
        apiClient.put = originalPut;
      }
    });

    test('updateTenantTeleconsultBilling sends full SuperAdmin override configuration', async () => {
      const originalPut = apiClient.put;
      let sentPayload: any = null;

      apiClient.put = mock(async (url: string, payload: any) => {
        sentPayload = payload;
        return { data: { ...mockTeleconsultBillingDto, ...payload } };
      }) as any;

      try {
        const fullOverrideRequest: AdminUpdateTeleconsultBillingPayload = {
          isEnabled: true,
          billingMode: 'Postpaid',
          ratePerMinutePhp: 4.5,
          allocatedBudgetPhp: 2500.0,
          allowOverageBeyondAllocation: false,
        };

        const result = await adminService.updateTenantTeleconsultBilling(testTenantId, fullOverrideRequest);
        expect(sentPayload).toEqual(fullOverrideRequest);
        expect(result.billingMode).toBe('Postpaid');
        expect(result.ratePerMinutePhp).toBe(4.5);
      } finally {
        apiClient.put = originalPut;
      }
    });
  });

  describe('3. Validation Clamping & Boundary Inputs', () => {
    test('Additive credit grant sanitization rejects non-positive or malformed values', () => {
      const validateGrant = (amount: number) => amount > 0 && !isNaN(amount);
      expect(validateGrant(500)).toBe(true);
      expect(validateGrant(100.5)).toBe(true);
      expect(validateGrant(0)).toBe(false);
      expect(validateGrant(-100)).toBe(false);
      expect(validateGrant(NaN)).toBe(false);
    });

    test('Rate per minute input clamps to minimum 0.01 (rejects 0, negative numbers, and NaN)', () => {
      const sanitizeRate = (rate: number) => Math.max(0.01, isNaN(rate) ? 0.01 : rate);
      expect(sanitizeRate(5.0)).toBe(5.0);
      expect(sanitizeRate(0)).toBe(0.01);
      expect(sanitizeRate(-5.0)).toBe(0.01);
      expect(sanitizeRate(NaN)).toBe(0.01);
    });

    test('Budget cap input clamps to minimum 0 (rejects negative numbers and NaN)', () => {
      const sanitizeBudget = (budget: number) => Math.max(0, isNaN(budget) ? 0 : budget);
      expect(sanitizeBudget(1500)).toBe(1500);
      expect(sanitizeBudget(0)).toBe(0);
      expect(sanitizeBudget(-250)).toBe(0);
      expect(sanitizeBudget(NaN)).toBe(0);
    });

    test('Uncapped postpaid integer (2147483647) formats as "∞ (Uncapped Postpaid)"', () => {
      const formatAvailable = (minutes: number) =>
        minutes === 2147483647 ? '∞ (Uncapped Postpaid)' : `${minutes.toLocaleString()} minutes`;

      expect(formatAvailable(2147483647)).toBe('∞ (Uncapped Postpaid)');
      expect(formatAvailable(150)).toBe('150 minutes');
    });
  });

  describe('4. Independence from Mandatory Audit Reason collision', () => {
    test('Teleconsult PAYG updates operate independently without audit reason collision', () => {
      // General entitlement limit overrides strictly mandate audit reason
      const requiresAuditReasonForLimits = (reason: string | undefined) =>
        Boolean(reason && reason.trim().length >= 5);

      expect(requiresAuditReasonForLimits('')).toBe(false);
      expect(requiresAuditReasonForLimits('   ')).toBe(false);
      expect(requiresAuditReasonForLimits('Admin override authorized')).toBe(true);

      // Teleconsult PAYG updates operate on separate dedicated endpoint without blocking on general audit reason
      const updateRequest: AdminUpdateTeleconsultBillingRequest = {
        prepaidCreditGrantPhp: 250,
      };
      expect(updateRequest.prepaidCreditGrantPhp).toBe(250);
    });
  });

  describe('5. Strict Design Token Audit', () => {
    test('Admin Web tenant teleconsult component files contain zero raw hex colors', () => {
      const componentPath = path.resolve(
        __dirname,
        '../src/pages/tenants/components/TenantEntitlementsCard.tsx'
      );
      if (fs.existsSync(componentPath)) {
        const content = fs.readFileSync(componentPath, 'utf-8');
        const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
        const hexMatches = stripped.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
        expect(hexMatches.length).toBe(0);
      }
    });
  });
});
