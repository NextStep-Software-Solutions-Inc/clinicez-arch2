// token-guard:ignore-file
import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';

describe('Chart Badge & Icon Cleanups Suite', () => {
  const encountersTimelinePath = path.resolve(__dirname, '../components/chart/EncountersTimelineTab.tsx');
  const lifestyleSocialPath = path.resolve(__dirname, '../components/chart/LifestyleSocialTab.tsx');
  const reproductiveHealthPath = path.resolve(__dirname, '../components/chart/ReproductiveHealthTab.tsx');

  const encountersContent = fs.readFileSync(encountersTimelinePath, 'utf8');
  const lifestyleContent = fs.readFileSync(lifestyleSocialPath, 'utf8');
  const reproductiveContent = fs.readFileSync(reproductiveHealthPath, 'utf8');

  describe('Suite 1: EncountersTimelineTab Diagnosis Pills and YAKAP Badge Cleanups', () => {
    test('1.1 Does NOT render activity icon inside header diagnosis pills', () => {
      // In headerDiagPill, there should only be ThemedText with description, no Icon name="activity"
      const headerPillSection = encountersContent.slice(
        encountersContent.indexOf('styles.headerDiagPill'),
        encountersContent.indexOf('styles.cardHeaderRight')
      );
      expect(headerPillSection).not.toContain('<Icon');
      expect(headerPillSection).not.toContain('name="activity"');
      expect(headerPillSection).toContain('{diag.description}');
    });

    test('1.2 Does NOT render activity icon inside expanded SOAP assessment diagnosis pills', () => {
      // In diagPill, there should only be ThemedText with description, no Icon name="activity"
      const soapDiagSection = encountersContent.slice(
        encountersContent.indexOf('styles.diagPill'),
        encountersContent.indexOf('{/* P: Plan */}')
      );
      expect(soapDiagSection).not.toContain('<Icon');
      expect(soapDiagSection).not.toContain('name="activity"');
      expect(soapDiagSection).toContain('{d.description}');
    });

    test('1.3 Purple YAKAP badge does NOT render icon="yakap"', () => {
      expect(encountersContent).toContain('<Badge label="YAKAP" variant="purple" size="sm" />');
      expect(encountersContent).not.toContain('<Badge label="YAKAP" variant="purple" size="sm" icon="yakap"');
    });
  });

  describe('Suite 2: LifestyleSocialTab Auto-Save Badge Cleanups', () => {
    test('2.1 Does NOT render idle "Auto-save active" badge', () => {
      expect(lifestyleContent).not.toContain('Auto-save active');
    });

    test('2.2 Retains formatLastSavedBadge generating "Last saved <formatted timestamp>"', () => {
      expect(lifestyleContent).toContain('const formatLastSavedBadge = useCallback');
      expect(lifestyleContent).toContain('return formatted ? `Last saved ${formatted}` : null');
      expect(lifestyleContent).toContain('const lastSavedBadgeLabel = formatLastSavedBadge(lastSavedAt)');
    });
  });

  describe('Suite 3: ReproductiveHealthTab Auto-Save Badge Cleanups', () => {
    test('3.1 Does NOT render idle "Auto-save active" badge', () => {
      expect(reproductiveContent).not.toContain('Auto-save active');
    });

    test('3.2 Retains formatLastSavedBadge generating "Last saved <formatted timestamp>"', () => {
      expect(reproductiveContent).toContain('const formatLastSavedBadge = useCallback');
      expect(reproductiveContent).toContain('return formatted ? `Last saved ${formatted}` : null');
      expect(reproductiveContent).toContain('const lastSavedBadgeLabel = formatLastSavedBadge(lastSavedAt)');
    });
  });
});
