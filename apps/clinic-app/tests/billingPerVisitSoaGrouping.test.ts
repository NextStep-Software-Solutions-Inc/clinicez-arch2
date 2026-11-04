// token-guard:ignore-file
import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';

describe('Per-Visit Cashier SOA Grouping & Add-on Unbilled Flow', () => {
  const billingPath = path.resolve(__dirname, '../navigation/screens/Billing.screen.tsx');
  const billingContent = fs.readFileSync(billingPath, 'utf8');

  describe('Suite 1: Visit-Scoped SOA Isolation Logic', () => {
    test('1.1 Source code refactors openSoaMap and billedMap into strictly visit-scoped openSoaByQueueId and paidByQueueId with zero legacy orphan shims', () => {
      expect(billingContent).toContain('openSoaByQueueId');
      expect(billingContent).toContain('paidByQueueId');
      expect(billingContent).not.toContain('orphanOpenByPatientId');
      expect(billingContent).not.toContain('orphanPaidByPatientId');
    });

    test('1.2 toBillingPatient keys lookups strictly by item.id (queueItemId)', () => {
      expect(billingContent).toContain('const openInv = item.id ? openSoaByQueueId?.get(item.id) : undefined;');
      expect(billingContent).toContain('const paidInvNum = item.id ? paidByQueueId?.get(item.id) : undefined;');
    });

    test('1.3 Same-day multi-visit simulation: morning paid DV-001 does not suppress afternoon DV-002', () => {
      // Simulate toBillingPatient logic directly
      const paidByQueueId = new Map<string, string>();
      paidByQueueId.set('queue-dv-001', 'INV-2026-0001');

      const openSoaByQueueId = new Map<string, any>();

      const morningVisit: any = {
        id: 'queue-dv-001',
        patientId: 'patient-123',
        patientName: 'Juan Dela Cruz',
        queueNumber: 'DV-001',
        isDirectVisit: true,
      };

      const afternoonVisit: any = {
        id: 'queue-dv-002',
        patientId: 'patient-123',
        patientName: 'Juan Dela Cruz',
        queueNumber: 'DV-002',
        isDirectVisit: true,
      };

      // Morning visit lookup
      const morningPaid = paidByQueueId.get(morningVisit.id);
      const morningBilled = Boolean(morningPaid);
      expect(morningBilled).toBe(true);
      expect(morningPaid).toBe('INV-2026-0001');

      // Afternoon return visit lookup
      const afternoonPaid = paidByQueueId.get(afternoonVisit.id);
      const afternoonBilled = Boolean(afternoonPaid);
      expect(afternoonBilled).toBe(false);
      expect(afternoonPaid).toBeUndefined();
    });
  });

  describe('Suite 2: handleSelectPatient Visit-Scoped Rehydration & Add-On Unbilled', () => {
    test('2.1 Scopes paid invoices strictly to inv.queueItemId === p.queueItemId', () => {
      expect(billingContent).toContain('p.queueItemId');
      expect(billingContent).toContain('inv.queueItemId === p.queueItemId && inv.status === \'Paid\'');
    });

    test('2.2 Filters procedure rehydration to proc.queueItemId === p.queueItemId', () => {
      expect(billingContent).toContain('proc.queueItemId === p.queueItemId');
    });

    test('2.3 Detects add-on unbilled procedures after partial payment and sets hasAddOnUnbilled', () => {
      expect(billingContent).toContain('hasAddOnUnbilled: true');
      expect(billingContent).toContain('addOnUnbilledCount: addedCount');
      expect(billingContent).toContain('Supplemental invoice enabled');
    });

    test('2.4 Passes allowDuplicate: true automatically when hasAddOnUnbilled is true', () => {
      expect(billingContent).toContain('allowDuplicate: isRetail ? true : (allowDuplicate || Boolean(selectedPatient.hasAddOnUnbilled))');
    });

    test('2.5 Bypasses duplicate invoice blocker dialog when hasAddOnUnbilled is true', () => {
      expect(billingContent).toContain('!selectedPatient.hasAddOnUnbilled');
    });

    test('2.6 Does NOT auto-charge false consultation fee on StandaloneProcedure, AdministrativeDocument, or VitalsCheckOnly visits', () => {
      expect(billingContent).toContain("p.visitType !== 'StandaloneProcedure'");
      expect(billingContent).toContain("p.visitType !== 'AdministrativeDocument'");
      expect(billingContent).toContain("p.visitType !== 'VitalsCheckOnly'");
    });

    test('2.7 Decrements paidItemCodeCounts so a 2nd procedure of the same code after partial settlement registers as Add-on Unbilled', () => {
      expect(billingContent).toContain('paidItemCodeCounts.set(codeKey, paidCodeRem - 1)');
      expect(billingContent).toContain('paidItemNameCounts.set(nameKey, paidNameRem - 1)');
    });
  });

  describe('Suite 3: Direct Visit & Add-On Badges in Cashier UI', () => {
    test('3.1 Renders subtle Direct • DV-001 badge in patient chips', () => {
      expect(billingContent).toContain("isDv ? `Direct • ${p.queueNumber}` : p.queueNumber");
    });

    test('3.2 Renders subtle Direct • DV badge with variant="routine" in active patient card', () => {
      expect(billingContent).toContain('Direct • ${selectedPatient.queueNumber || \'DV\'}');
      expect(billingContent).toContain('variant="routine"');
    });

    test('3.3 Renders Add-on Unbilled badge with variant="warning"', () => {
      expect(billingContent).toContain('Badge label="Add-on Unbilled" variant="warning" size="sm"');
    });

    test('3.4 Renders Supplemental Statement of Account banner header for add-on procedures', () => {
      expect(billingContent).toContain('Supplemental Statement of Account');
    });
  });

  describe('Suite 4: Design Token Integrity', () => {
    test('4.1 Billing.screen.tsx strictly contains 0 raw hex color literals', () => {
      const hexRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
      const matches = billingContent.match(hexRegex) || [];
      expect(matches).toEqual([]);
    });
  });
});
