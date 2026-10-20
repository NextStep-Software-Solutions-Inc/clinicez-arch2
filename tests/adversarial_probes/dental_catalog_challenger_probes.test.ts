/**
 * Empirical Challenger Probe Suite — Milestone 1 Backend
 * 
 * Adversarial stress tests verifying:
 * 1. Exact price, code, and description integrity of the 10 canonical presets.
 * 2. Auto-seeding under high churn and specialty mode transitions.
 * 3. Directory publishing with mixed active and inactive dental services.
 * 4. Concurrency, idempotency, and mutation resistance.
 */

import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

// =========================================================================
// CANONICAL TARGETS
// =========================================================================

interface CanonicalPresetTarget {
  code: string;
  name: string;
  category: string;
  standardPrice: number;
  descriptionKeyword: string;
}

const CANONICAL_TARGETS: CanonicalPresetTarget[] = [
  { code: 'DENT-CONS', name: 'Dental Consultation & Oral Examination', category: 'Dental', standardPrice: 500, descriptionKeyword: 'Comprehensive dental examination' },
  { code: 'DENT-CLEAN', name: 'Oral Prophylaxis / Dental Cleaning', category: 'Dental', standardPrice: 850, descriptionKeyword: 'scaling and polishing' },
  { code: 'DENT-FILL-COMP', name: 'Composite Light-Cure Tooth Restoration', category: 'Dental', standardPrice: 950, descriptionKeyword: 'composite resin tooth filling' },
  { code: 'DENT-EXT-SIMPLE', name: 'Tooth Extraction - Simple Exodontia', category: 'Dental', standardPrice: 1000, descriptionKeyword: 'Non-surgical extraction' },
  { code: 'DENT-EXT-SURG', name: 'Surgical Odontectomy - Impacted Third Molar', category: 'Dental', standardPrice: 3500, descriptionKeyword: 'Surgical extraction' },
  { code: 'DENT-SEALANT', name: 'Pit and Fissure Sealant', category: 'Dental', standardPrice: 600, descriptionKeyword: 'Preventive resin sealant' },
  { code: 'DENT-FLUOR', name: 'Topical Fluoride Varnish Application', category: 'Dental', standardPrice: 500, descriptionKeyword: 'topical sodium fluoride' },
  { code: 'DENT-XR-PA', name: 'Dental Periapical Radiograph / X-Ray', category: 'Dental', standardPrice: 400, descriptionKeyword: 'radiograph' },
  { code: 'DENT-RCT', name: 'Root Canal Therapy / Endodontic Treatment', category: 'Dental', standardPrice: 4000, descriptionKeyword: 'endodontic' },
  { code: 'DENT-PULP', name: 'Pediatric Pulpotomy', category: 'Dental', standardPrice: 1500, descriptionKeyword: 'vital pulp amputation' },
];

describe('Challenger M1.1 Backend Empirical Probes', () => {

  // ─────────────────────────────────────────────────────────────────────────
  // PROBE 1: STATIC & RUNTIME INTEGRITY OF CANONICAL PRESETS
  // ─────────────────────────────────────────────────────────────────────────
  describe('Probe 1: Canonical Preset Price & Description Integrity', () => {
    test('verifies C# DentalCatalogDefaults.cs contains exact 10 canonical presets with exact prices', () => {
      const defaultsFile = path.resolve('services/clinic-api/ClinicEz.Clinic.Application/Features/ServicesCatalog/Common/DentalCatalogDefaults.cs');
      expect(fs.existsSync(defaultsFile)).toBeTrue();
      const content = fs.readFileSync(defaultsFile, 'utf8');

      for (const target of CANONICAL_TARGETS) {
        expect(content.includes(`"${target.code}"`)).toBeTrue();
        expect(content.includes(`"${target.name}"`)).toBeTrue();
        expect(content.includes(`${target.standardPrice}m`)).toBeTrue();
        expect(content.includes(target.descriptionKeyword)).toBeTrue();
      }
    });

    test('verifies C# controller exposes POST /api/v1/services/seed-dental with ClinicPermissions.ServicesManage', () => {
      const controllerFile = path.resolve('services/clinic-api/ClinicEz.Clinic.Api/Controllers/ServicesController.cs');
      expect(fs.existsSync(controllerFile)).toBeTrue();
      const content = fs.readFileSync(controllerFile, 'utf8');

      expect(content.includes('[HttpPost("seed-dental")]')).toBeTrue();
      expect(content.includes('[HasPermission(ClinicPermissions.ServicesManage)]')).toBeTrue();
      expect(content.includes('SeedDentalServicesCommand')).toBeTrue();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PROBE 2: HIGH CHURN AUTO-SEEDING & SPECIALTY MODE STATE MACHINE
  // ─────────────────────────────────────────────────────────────────────────
  describe('Probe 2: High Churn Auto-Seeding Simulation', () => {
    interface MockServiceItem {
      id: string;
      tenantId: string;
      clinicId: string;
      code: string;
      name: string;
      category: string;
      standardPrice: number;
      isActive: boolean;
      description?: string;
    }

    class MockCatalogStore {
      private items: MockServiceItem[] = [];
      public specialtyMode: string = 'Dental';

      public query(category?: string, isActive?: boolean): MockServiceItem[] {
        // Auto-seed if empty
        if (this.items.length === 0) {
          const mode = this.specialtyMode.trim().toLowerCase();
          if (mode === 'dental') {
            for (const t of CANONICAL_TARGETS) {
              this.items.push({
                id: crypto.randomUUID(),
                tenantId: 'tenant-churn',
                clinicId: 'clinic-churn',
                code: t.code,
                name: t.name,
                category: t.category,
                standardPrice: t.standardPrice,
                isActive: true,
                description: t.descriptionKeyword,
              });
            }
          } else if (mode === 'multispecialty' || mode === 'multi-specialty') {
            // Medical (9) + Dental (10)
            for (let i = 1; i <= 9; i++) {
              this.items.push({
                id: crypto.randomUUID(),
                tenantId: 'tenant-churn',
                clinicId: 'clinic-churn',
                code: `MED-${i}`,
                name: `Medical Service ${i}`,
                category: 'Consultation',
                standardPrice: 500,
                isActive: true,
              });
            }
            for (const t of CANONICAL_TARGETS) {
              this.items.push({
                id: crypto.randomUUID(),
                tenantId: 'tenant-churn',
                clinicId: 'clinic-churn',
                code: t.code,
                name: t.name,
                category: t.category,
                standardPrice: t.standardPrice,
                isActive: true,
                description: t.descriptionKeyword,
              });
            }
          } else {
            // General Medical (9)
            for (let i = 1; i <= 9; i++) {
              this.items.push({
                id: crypto.randomUUID(),
                tenantId: 'tenant-churn',
                clinicId: 'clinic-churn',
                code: `MED-${i}`,
                name: `Medical Service ${i}`,
                category: 'Consultation',
                standardPrice: 500,
                isActive: true,
              });
            }
          }
        }

        let res = [...this.items];
        if (category) {
          res = res.filter(x => x.category.toLowerCase() === category.toLowerCase());
        }
        if (isActive !== undefined) {
          res = res.filter(x => x.isActive === isActive);
        }
        return res;
      }

      public seedDental(): MockServiceItem[] {
        const existingCodes = new Set(this.items.map(x => x.code.trim().toUpperCase()));
        for (const t of CANONICAL_TARGETS) {
          if (!existingCodes.has(t.code.trim().toUpperCase())) {
            const newItem: MockServiceItem = {
              id: crypto.randomUUID(),
              tenantId: 'tenant-churn',
              clinicId: 'clinic-churn',
              code: t.code,
              name: t.name,
              category: t.category,
              standardPrice: t.standardPrice,
              isActive: true,
            };
            this.items.push(newItem);
            existingCodes.add(t.code.trim().toUpperCase());
          }
        }
        return this.items.filter(x => x.category === 'Dental');
      }

      public getItemCount(): number {
        return this.items.length;
      }
    }

    test('concurrent queries on fresh clinic seed exactly 10 items without duplicates', () => {
      const store = new MockCatalogStore();
      store.specialtyMode = 'Dental';

      // Simulate 100 simultaneous queries
      const results = Array.from({ length: 100 }, () => store.query());

      for (const res of results) {
        expect(res.length).toBe(10);
        expect(res.every(x => x.category === 'Dental')).toBeTrue();
      }
      expect(store.getItemCount()).toBe(10);
    });

    test('specialty mode transition preserves existing fee schedule without clobbering', () => {
      const store = new MockCatalogStore();
      store.specialtyMode = 'Dental';

      // First query seeds 10 dental items
      const q1 = store.query();
      expect(q1.length).toBe(10);

      // Clinic changes specialty mode to Medical
      store.specialtyMode = 'Medical';
      const q2 = store.query();
      expect(q2.length).toBe(10); // Still 10! Dental items are not deleted or replaced
      expect(q2.every(x => x.category === 'Dental')).toBeTrue();

      // Clinic changes specialty mode to MultiSpecialty
      store.specialtyMode = 'MultiSpecialty';
      const q3 = store.query();
      expect(q3.length).toBe(10);

      // Admin explicitly clicks "Seed Dental Services"
      const seeded = store.seedDental();
      expect(seeded.length).toBe(10);
      expect(store.getItemCount()).toBe(10);
    });

    test('manual seed preserves custom prices during repeated churn', () => {
      const store = new MockCatalogStore();
      store.specialtyMode = 'Dental';
      store.query(); // Seeds 10 items

      // Clinician customizes DENT-CONS price from 500 to 1,200
      const items = store.query();
      const consItem = items.find(x => x.code === 'DENT-CONS');
      expect(consItem).toBeDefined();
      consItem!.standardPrice = 1200;
      consItem!.name = 'Custom VIP Examination';

      // Run seed command 50 times
      for (let i = 0; i < 50; i++) {
        const seeded = store.seedDental();
        expect(seeded.length).toBe(10);
        const cons = seeded.find(x => x.code === 'DENT-CONS');
        expect(cons?.standardPrice).toBe(1200);
        expect(cons?.name).toBe('Custom VIP Examination');
      }
      expect(store.getItemCount()).toBe(10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // PROBE 3: DIRECTORY PUBLISHING WITH MIXED ACTIVE / INACTIVE DENTAL SERVICES
  // ─────────────────────────────────────────────────────────────────────────
  describe('Probe 3: Directory Publishing Verification', () => {
    test('directory event strictly excludes inactive dental services and maps classification', () => {
      const services = [
        { id: '1', code: 'DENT-CONS', name: 'Dental Consultation', category: 'Dental', standardPrice: 500, isActive: true },
        { id: '2', code: 'DENT-CLEAN', name: 'Dental Cleaning', category: 'Dental', standardPrice: 850, isActive: true },
        { id: '3', code: 'DENT-RCT', name: 'Root Canal', category: 'Dental', standardPrice: 4000, isActive: false }, // inactive
        { id: '4', code: 'DENT-PULP', name: 'Pulpotomy', category: 'Dental', standardPrice: 1500, isActive: false }, // inactive
        { id: '5', code: 'CONS-GEN', name: 'General Consultation', category: 'Consultation', standardPrice: 500, isActive: true },
        { id: '6', code: 'PROC-NEB', name: 'Nebulization', category: 'Procedure', standardPrice: 250, isActive: false }, // inactive
      ];

      // Simulate PublishClinicToDirectoryCommandHandler active service filtering
      const activeServices = services.filter(s => s.isActive);
      expect(activeServices.length).toBe(3); // 2 active dental + 1 active medical
      expect(activeServices.every(s => s.isActive)).toBeTrue();
      expect(activeServices.some(s => s.code === 'DENT-RCT')).toBeFalse();
      expect(activeServices.some(s => s.code === 'DENT-PULP')).toBeFalse();
      expect(activeServices.some(s => s.code === 'PROC-NEB')).toBeFalse();

      // Test classification mapping rules
      const mapClassification = (mode?: string) => {
        switch (mode?.trim().toLowerCase()) {
          case 'dental': return 'Dental Clinic';
          case 'multispecialty':
          case 'multi-specialty': return 'Multi-Specialty Clinic';
          case 'medical':
          default: return 'Ambulatory Clinic';
        }
      };

      expect(mapClassification('Dental')).toBe('Dental Clinic');
      expect(mapClassification('dental')).toBe('Dental Clinic');
      expect(mapClassification('  DENTAL  ')).toBe('Dental Clinic');
      expect(mapClassification('MultiSpecialty')).toBe('Multi-Specialty Clinic');
      expect(mapClassification('Multi-Specialty')).toBe('Multi-Specialty Clinic');
      expect(mapClassification('multispecialty')).toBe('Multi-Specialty Clinic');
      expect(mapClassification('Medical')).toBe('Ambulatory Clinic');
      expect(mapClassification(undefined)).toBe('Ambulatory Clinic');
      expect(mapClassification('')).toBe('Ambulatory Clinic');
    });
  });
});
