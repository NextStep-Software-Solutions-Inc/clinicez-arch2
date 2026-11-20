import { describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateBmiAndBsa,
  calculateObEddAndAog,
  calculatePediatricDose,
  calculateRenalFunction,
  ftInToCm,
  lbToKg,
  umolLToMgDl,
} from '../utils/clinicalCalculators';
import {
  CLINIC_TOOLS_CATALOG,
  canAccessTool,
  filterToolsCatalog,
  getAccessibleTools,
  getDefaultToolForTab,
  getVisibleToolTabs,
  resolveToolsRouteIntent,
} from '../components/tools/toolsCatalog';
import { PERMISSIONS } from '../constants/permissions';
import { ROUTE_MAP as NATIVE_ROUTE_MAP } from '../utils/workstationShortcuts';
import { ROUTE_MAP as WEB_ROUTE_MAP } from '../utils/workstationShortcuts.web';

describe('Clinic Utility Tools Directory', () => {
  // =========================================================================
  // 1. Pure Clinical Calculators
  // =========================================================================
  describe('1. Clinical Calculators Engine', () => {
    test('1.1 BMI & BSA: accurately distinguishes WHO Global vs WHO Asia-Pacific cutoffs', () => {
      // 65 kg, 165 cm -> BMI = 23.875 -> 23.9 (Normal in WHO Global, Overweight/At Risk in Asia-Pacific)
      const res = calculateBmiAndBsa({ weightKg: 65, heightCm: 165, sex: 'male' });
      expect(res).not.toBeNull();
      expect(res!.bmi).toBe(23.9);
      expect(res!.whoGlobal.label).toBe('Normal weight');
      expect(res!.asiaPacific.label).toBe('Overweight (At Risk)');
      expect(res!.bsaMosteller).toBeCloseTo(1.73, 2);
      expect(res!.bsaDuBois).toBeCloseTo(1.72, 2);
      // 165 cm = 64.96 in -> 4.96 in over 5ft -> Male Devine = 50 + 2.3 * 4.96 = 61.4 kg
      expect(res!.idealBodyWeightKg).toBeCloseTo(61.4, 1);
    });

    test('1.2 BMI & BSA: imperial unit conversions and Devine height boundary (<152.4 cm)', () => {
      const kg = lbToKg(154.3236);
      const cm = ftInToCm(4, 11); // 149.86 cm (< 152.4 cm)
      expect(kg).toBeCloseTo(70, 1);
      expect(cm).toBeCloseTo(149.86, 1);

      const res = calculateBmiAndBsa({ weightKg: kg, heightCm: cm, sex: 'female' });
      expect(res).not.toBeNull();
      expect(res!.idealBodyWeightKg).toBeNull();
      expect(calculateBmiAndBsa({ weightKg: 0, heightCm: 170 })).toBeNull();
      expect(calculateBmiAndBsa({ weightKg: 60, heightCm: -10 })).toBeNull();
    });

    test('1.3 OB EDD & AOG: Naegele rule with 28-day and 35-day cycle adjustments', () => {
      // Standard 28-day cycle: LMP 2026-01-01 + 280 days = 2026-10-08
      const std = calculateObEddAndAog({
        lmpDateStr: '2026-01-01',
        cycleLengthDays: 28,
        referenceDateStr: '2026-05-21', // 140 days = exactly 20w 0d
      });
      expect(std).not.toBeNull();
      expect(std!.eddDateStr).toBe('2026-10-08');
      expect(std!.aogWeeks).toBe(20);
      expect(std!.aogDays).toBe(0);
      expect(std!.aogFormatted).toBe('20w 0d');
      expect(std!.trimesterLabel).toBe('2nd Trimester');
      expect(std!.progressPercent).toBe(50);
      expect(std!.milestones.find((m) => m.weeks === 20)?.reached).toBe(true);
      expect(std!.milestones.find((m) => m.weeks === 28)?.reached).toBe(false);

      // 35-day cycle (+7 days adjustment): EDD shifts to 2026-10-15
      const longCycle = calculateObEddAndAog({
        lmpDateStr: '2026-01-01',
        cycleLengthDays: 35,
        referenceDateStr: '2026-05-21',
      });
      expect(longCycle).not.toBeNull();
      expect(longCycle!.eddDateStr).toBe('2026-10-15');

      // Invalid dates and out-of-range cycles return null safely
      expect(calculateObEddAndAog({ lmpDateStr: '2026-02-30' })).toBeNull();
      expect(calculateObEddAndAog({ lmpDateStr: '2026-01-01', cycleLengthDays: 10 })).toBeNull();
    });

    test('1.4 Pediatric Weight-Based Dosing: computes mg, mL suspension, and max daily cap safety alert', () => {
      // Amoxicillin 45 mg/kg/day divided BID for 15 kg child with 250mg/5mL suspension
      const amox = calculatePediatricDose({
        weightKg: 15,
        doseMgPerKg: 45,
        mode: 'perDay',
        dosesPerDay: 2,
        concentrationMg: 250,
        concentrationMl: 5,
        maxDailyDoseMg: 3000,
      });
      expect(amox).not.toBeNull();
      expect(amox!.dailyTotalMg).toBe(675);
      expect(amox!.singleDoseMg).toBe(337.5);
      expect(amox!.singleDoseMl).toBe(6.8); // 337.5 / 50 = 6.75 -> 6.8
      expect(amox!.intervalHours).toBe(12);
      expect(amox!.exceedsMaxDaily).toBe(false);

      // Exceeding max daily dose cap: 80 kg adolescent @ 15 mg/kg/dose QID = 4800 mg/day > 4000 mg cap
      const capped = calculatePediatricDose({
        weightKg: 80,
        doseMgPerKg: 15,
        mode: 'perDose',
        dosesPerDay: 4,
        concentrationMg: 250,
        concentrationMl: 5,
        maxDailyDoseMg: 4000,
      });
      expect(capped).not.toBeNull();
      expect(capped!.dailyTotalMg).toBe(4800);
      expect(capped!.exceedsMaxDaily).toBe(true);
      expect(capped!.cappedDailyTotalMg).toBe(4000);
      expect(capped!.cappedSingleDoseMg).toBe(1000);
      expect(capped!.cappedSingleDoseMl).toBe(20);
    });

    test('1.5 Renal Function: CKD-EPI 2021 eGFR, µmol/L conversion parity, KDIGO staging, and Cockcroft-Gault', () => {
      // Male, 55yo, SCr 1.2 mg/dL, 70 kg
      const mgDl = calculateRenalFunction({
        creatinineValue: 1.2,
        creatinineUnit: 'mg/dL',
        ageYears: 55,
        sex: 'male',
        weightKg: 70,
      });
      expect(mgDl).not.toBeNull();
      // Expected CKD-EPI 2021 ≈ 71.9 mL/min/1.73m² -> G2
      expect(mgDl!.egfrCkdEpi2021).toBeGreaterThan(68);
      expect(mgDl!.egfrCkdEpi2021).toBeLessThan(76);
      expect(mgDl!.kdigoStage).toBe('G2');
      // Expected Cockcroft-Gault = ((140-55)*70)/(72*1.2) = 68.9
      expect(mgDl!.cockcroftGaultCrCl).toBeCloseTo(68.9, 1);

      // Equivalent value in µmol/L (1.2 * 88.4 = 106.08 µmol/L) produces identical eGFR
      const umol = calculateRenalFunction({
        creatinineValue: 1.2 * 88.4,
        creatinineUnit: 'umol/L',
        ageYears: 55,
        sex: 'male',
        weightKg: 70,
      });
      expect(umol).not.toBeNull();
      expect(umolLToMgDl(88.4)).toBeCloseTo(1.0, 4);
      expect(umol!.egfrCkdEpi2021).toBe(mgDl!.egfrCkdEpi2021);

      // Severe kidney failure (G5) and pediatric age rejection (< 18)
      const g5 = calculateRenalFunction({
        creatinineValue: 6.5,
        creatinineUnit: 'mg/dL',
        ageYears: 65,
        sex: 'female',
      });
      expect(g5).not.toBeNull();
      expect(g5!.kdigoStage).toBe('G5');
      expect(g5!.kdigoTone).toBe('emergency');

      expect(
        calculateRenalFunction({
          creatinineValue: 0.8,
          creatinineUnit: 'mg/dL',
          ageYears: 12,
          sex: 'male',
        }),
      ).toBeNull();
    });
  });

  // =========================================================================
  // 2. Tools Catalog RBAC, Search Filtering & Legacy Deep Links
  // =========================================================================
  describe('2. Tools Catalog RBAC, Filtering & Deep-Link Compatibility', () => {
    test('2.1 Admin has access to all 5 horizontal tabs and all 14 utility tools', () => {
      const adminAuth = {
        user: { role: 'Admin' },
        permissions: Object.values(PERMISSIONS),
        can: () => true,
      };
      const tabs = getVisibleToolTabs(adminAuth);
      const tools = getAccessibleTools(adminAuth);

      expect(tabs.map((t) => t.key)).toEqual([
        'directory',
        'yakap',
        'calculators',
        'lookups',
        'operations',
      ]);
      expect(tools.length).toBe(CLINIC_TOOLS_CATALOG.length);
      expect(tools.length).toBe(14);
    });

    test('2.2 Cashier sees Tools directory with open utilities & Services lookup, but NOT PhilHealth Yakap or clinical-only tools', () => {
      const cashierPerms = [PERMISSIONS.billingRead, PERMISSIONS.servicesRead];
      const cashierAuth = {
        user: { role: 'Cashier' },
        permissions: cashierPerms,
        can: (p: string) => cashierPerms.includes(p as any),
      };

      const tabKeys = getVisibleToolTabs(cashierAuth).map((t) => t.key);
      expect(tabKeys).toContain('directory');
      expect(tabKeys).toContain('calculators');
      expect(tabKeys).toContain('lookups');
      expect(tabKeys).toContain('operations');
      expect(tabKeys).not.toContain('yakap');

      const toolIds = getAccessibleTools(cashierAuth).map((t) => t.id);
      expect(toolIds).toContain('services');
      expect(toolIds).toContain('psgc');
      expect(toolIds).toContain('waiting-tv');
      expect(toolIds).toContain('reception-placard');
      expect(toolIds).toContain('bmi-bsa');
      expect(toolIds).not.toContain('pin-checker');
      expect(toolIds).not.toContain('gamot');
      expect(toolIds).not.toContain('masterlist');
      expect(toolIds).not.toContain('icd10');
      expect(toolIds).not.toContain('share-import');
      expect(toolIds).not.toContain('pediatric-zscore');
    });

    test('2.3 Strict RBAC: explicit permission set without yakap:read hides PhilHealth Yakap even for Doctor role', () => {
      const restrictedPerms = [
        PERMISSIONS.patientsRead,
        PERMISSIONS.consultationsRead,
        PERMISSIONS.servicesRead,
      ];
      const restrictedDoctor = {
        user: { role: 'Doctor' },
        permissions: restrictedPerms,
        can: (p: string) => restrictedPerms.includes(p as any),
      };

      expect(
        canAccessTool({ permission: PERMISSIONS.yakapRead, roles: ['Doctor', 'Admin'] }, restrictedDoctor),
      ).toBe(false);
      expect(getVisibleToolTabs(restrictedDoctor).map((t) => t.key)).not.toContain('yakap');
    });

    test('2.4 Directory search & category filter finds tools across titles, descriptions, and keywords', () => {
      const byKeyword = filterToolsCatalog(CLINIC_TOOLS_CATALOG, { query: 'naegele' });
      expect(byKeyword.map((t) => t.id)).toEqual(['ob-edd']);

      const byUpsc = filterToolsCatalog(CLINIC_TOOLS_CATALOG, { query: 'upsc' });
      expect(byUpsc.map((t) => t.id)).toEqual(['gamot']);

      const lookupsOnly = filterToolsCatalog(CLINIC_TOOLS_CATALOG, { category: 'lookups' });
      expect(lookupsOnly.map((t) => t.id)).toEqual(['icd10', 'services', 'psgc']);

      const defaultLookupForCashier = getDefaultToolForTab(
        'lookups',
        getAccessibleTools({
          user: { role: 'Cashier' },
          permissions: [PERMISSIONS.servicesRead],
          can: (p) => p === PERMISSIONS.servicesRead,
        }),
      );
      expect(defaultLookupForCashier).toBe('services');
    });

    test('2.5 Legacy /yakap URLs and sub-tab deep links resolve cleanly to unified Tools screen', () => {
      expect(resolveToolsRouteIntent({ tab: 'gamot' })).toEqual({
        tab: 'yakap',
        tool: 'gamot',
      });
      expect(resolveToolsRouteIntent({ tab: 'pin-checker' })).toEqual({
        tab: 'yakap',
        tool: 'pin-checker',
      });
      expect(resolveToolsRouteIntent({ tab: 'masterlist' })).toEqual({
        tab: 'yakap',
        tool: 'masterlist',
      });
      expect(resolveToolsRouteIntent({ pathname: '/yakap' })).toEqual({
        tab: 'yakap',
        tool: 'pin-checker',
      });
      expect(resolveToolsRouteIntent({ tool: 'philpen' })).toEqual({
        tab: 'calculators',
        tool: 'philpen',
      });
      expect(resolveToolsRouteIntent({ tab: 'lookups' })).toEqual({
        tab: 'lookups',
      });
      expect(resolveToolsRouteIntent({ pathname: '/tools' })).toEqual({});
    });
  });

  // =========================================================================
  // 3. Navigation, Shortcuts & Backwards Compatibility Verification
  // =========================================================================
  describe('3. Navigation & Workstation Shortcuts Integration', () => {
    test('3.1 Alt+6 shortcut maps to Tools in both native and web route maps', () => {
      expect(NATIVE_ROUTE_MAP['6']).toBe('Tools');
      expect(WEB_ROUTE_MAP['6']).toBe('Tools');
    });

    test('3.2 Navigation.tsx registers Tools route with /tools path, /yakap alias, and tab/tool parsers', () => {
      const navSrc = fs.readFileSync(path.resolve(__dirname, '../navigation/Navigation.tsx'), 'utf8');
      expect(navSrc).toContain("import ToolsScreen from './screens/Tools.screen';");
      expect(navSrc).toContain("path: 'tools'");
      expect(navSrc).toContain("alias: ['yakap']");
      expect(navSrc).toContain('tool: String');
      expect(navSrc).toContain("tabBarIcon: tabIcon('tools')");
    });

    test('3.3 WorkstationSidebar exposes Tools to all staff roles without top-level yakap:read restriction', () => {
      const sidebarSrc = fs.readFileSync(
        path.resolve(__dirname, '../components/layout/WorkstationSidebar.tsx'),
        'utf8',
      );
      expect(sidebarSrc).toContain("{ key: 'Tools', label: 'Tools', icon: 'tools' }");
      expect(sidebarSrc).not.toContain("label: 'PhilHealth Yakap'");
    });
  });
});
