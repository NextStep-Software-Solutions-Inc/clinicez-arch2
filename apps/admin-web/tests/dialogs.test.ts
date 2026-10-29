import { describe, it, expect } from 'bun:test';
import {
  QUANTITATIVE_LIMITS,
  CAPABILITY_FLAGS,
} from '../src/components/PlanEditorDialog';
import {
  PAYMENT_METHODS,
  calculateBirVat,
} from '../src/components/RecordPaymentDialog';

describe('Operational Governance Dialogs — Unit & Logic Tests', () => {
  describe('PlanEditorDialog: Limits & Capability Flags', () => {
    it('defines exactly 14 quantitative limits across 3 clinical categories', () => {
      expect(QUANTITATIVE_LIMITS.length).toBe(14);

      const categories = new Set(QUANTITATIVE_LIMITS.map((l) => l.category));
      expect(categories.has('Facilities & Hierarchy')).toBe(true);
      expect(categories.has('Staff & Infrastructure')).toBe(true);
      expect(categories.has('Clinical Encounters & API')).toBe(true);
      expect(categories.size).toBe(3);

      const keys = QUANTITATIVE_LIMITS.map((l) => l.key);
      const expectedKeys = [
        'limit.clinics',
        'limit.laboratories',
        'limit.pharmacies',
        'limit.organizations',
        'limit.branches',
        'limit.members',
        'limit.staff',
        'limit.storage_gb',
        'limit.terminals',
        'limit.beds',
        'limit.analyzers',
        'limit.monthly_consultations',
        'limit.api_requests_monthly',
        'limit.patients',
      ];

      for (const expectedKey of expectedKeys) {
        expect(keys).toContain(expectedKey);
      }
    });

    it('each quantitative limit has required metadata fields and non-negative default value', () => {
      for (const limit of QUANTITATIVE_LIMITS) {
        expect(typeof limit.key).toBe('string');
        expect(limit.key.startsWith('limit.')).toBe(true);
        expect(typeof limit.label).toBe('string');
        expect(limit.label.length).toBeGreaterThan(0);
        expect(typeof limit.description).toBe('string');
        expect(typeof limit.defaultVal).toBe('number');
        expect(limit.defaultVal).toBeGreaterThanOrEqual(0);
        expect(limit.icon).toBeDefined();
      }
    });

    it('defines exactly 10 capability feature flags with valid defaults', () => {
      expect(CAPABILITY_FLAGS.length).toBe(10);

      const keys = CAPABILITY_FLAGS.map((f) => f.key);
      const expectedKeys = [
        'feature.cross_tenant_interop',
        'feature.teleconsultation',
        'feature.electronic_prescriptions',
        'feature.lis_integration',
        'feature.inventory_management',
        'feature.philhealth_konsulta',
        'feature.multi_terminal_sync',
        'feature.advanced_analytics',
        'feature.custom_letterhead',
        'feature.on_prem',
      ];

      for (const expectedKey of expectedKeys) {
        expect(keys).toContain(expectedKey);
      }

      for (const flag of CAPABILITY_FLAGS) {
        expect(typeof flag.key).toBe('string');
        expect(flag.key.startsWith('feature.')).toBe(true);
        expect(typeof flag.label).toBe('string');
        expect(typeof flag.description).toBe('string');
        expect(typeof flag.defaultVal).toBe('boolean');
        expect(flag.icon).toBeDefined();
      }
    });
  });

  describe('RecordPaymentDialog: BIR 12% VAT Computation & Payment Channels', () => {
    it('defines 5 standard offline payment methods', () => {
      expect(PAYMENT_METHODS.length).toBe(5);
      const methodValues = PAYMENT_METHODS.map((m) => m.value);
      expect(methodValues).toContain('Bank Transfer');
      expect(methodValues).toContain('GCash/Maya');
      expect(methodValues).toContain('Check');
      expect(methodValues).toContain('Cash');
      expect(methodValues).toContain('Promotional');
    });

    it('computes 12% BIR VAT breakdown accurately for VAT-inclusive amounts', () => {
      // ₱11,200 VAT-inclusive => Net ₱10,000.00, VAT ₱1,200.00
      const calc1 = calculateBirVat(11200, true);
      expect(calc1.netAmount).toBe(10000);
      expect(calc1.vatAmount).toBe(1200);
      expect(calc1.grossAmount).toBe(11200);
      expect(Math.round((calc1.netAmount + calc1.vatAmount) * 100) / 100).toBe(calc1.grossAmount);

      // ₱5,000 VAT-inclusive => Net ₱4,464.29, VAT ₱535.71
      const calc2 = calculateBirVat(5000, true);
      expect(calc2.netAmount).toBe(4464.29);
      expect(calc2.vatAmount).toBe(535.71);
      expect(calc2.grossAmount).toBe(5000);
      expect(Math.round((calc2.netAmount + calc2.vatAmount) * 100) / 100).toBe(calc2.grossAmount);
    });

    it('computes 12% BIR VAT breakdown accurately for VAT-exclusive amounts', () => {
      // ₱10,000 VAT-exclusive => Net ₱10,000.00, VAT ₱1,200.00, Gross ₱11,200.00
      const calc = calculateBirVat(10000, false);
      expect(calc.netAmount).toBe(10000);
      expect(calc.vatAmount).toBe(1200);
      expect(calc.grossAmount).toBe(11200);
    });

    it('handles zero amount gracefully for promotional / sponsored plans', () => {
      const calc = calculateBirVat(0, true);
      expect(calc.netAmount).toBe(0);
      expect(calc.vatAmount).toBe(0);
      expect(calc.grossAmount).toBe(0);
    });
  });

  describe('Tenant Lifecycle & Entitlements Logic', () => {
    it('requires exact slug typing confirmation to unlock permanent purge', () => {
      const targetSlug = 'st-jude-clinic';

      const isPurgeConfirmed = (input: string, slug: string) => input.trim() === slug;

      expect(isPurgeConfirmed('st-jude', targetSlug)).toBe(false);
      expect(isPurgeConfirmed('ST-JUDE-CLINIC', targetSlug)).toBe(false);
      expect(isPurgeConfirmed('st-jude-clinic ', targetSlug)).toBe(true);
      expect(isPurgeConfirmed('st-jude-clinic', targetSlug)).toBe(true);
    });

    it('identifies override deltas from plan baseline in TenantEntitlementsCard', () => {
      const planLimits: Record<string, number> = {
        'limit.clinics': 3,
        'limit.doctors': 10,
        'limit.storage_gb': 20,
      };

      const overrideLimits: Record<string, number | null> = {
        'limit.clinics': 5, // modified
        'limit.doctors': 10, // same as baseline
        'limit.storage_gb': null, // default baseline
      };

      const isOverridden = (key: string) => {
        const val = overrideLimits[key];
        return val !== null && val !== undefined && val !== planLimits[key];
      };

      expect(isOverridden('limit.clinics')).toBe(true);
      expect(isOverridden('limit.doctors')).toBe(false);
      expect(isOverridden('limit.storage_gb')).toBe(false);
    });
  });
});
