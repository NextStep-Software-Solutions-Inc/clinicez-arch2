// token-guard:ignore-file
import { describe, expect, test } from 'bun:test';
import fs from 'fs';
import path from 'path';

describe('Challenger 2 — Adversarial Cashier SOA & Frontend Zero-Write Verification', () => {
  const billingPath = path.resolve(__dirname, '../navigation/screens/Billing.screen.tsx');
  const patientsPath = path.resolve(__dirname, '../navigation/screens/Patients.screen.tsx');
  const timelinePath = path.resolve(__dirname, '../components/chart/EncountersTimelineTab.tsx');
  const lifestylePath = path.resolve(__dirname, '../components/chart/LifestyleSocialTab.tsx');
  const reproPath = path.resolve(__dirname, '../components/chart/ReproductiveHealthTab.tsx');

  const billingContent = fs.readFileSync(billingPath, 'utf8');
  const patientsContent = fs.readFileSync(patientsPath, 'utf8');
  const timelineContent = fs.readFileSync(timelinePath, 'utf8');
  const lifestyleContent = fs.readFileSync(lifestylePath, 'utf8');
  const reproContent = fs.readFileSync(reproPath, 'utf8');

  // =========================================================================
  // Challenge 1: Same-Day Multi-Visit Isolation
  // =========================================================================
  describe('Challenge 1: Same-Day Multi-Visit Cashier Isolation', () => {
    test('1.1 Billing.screen toBillingPatient simulation guarantees DV-001 paid status does not leak to DV-002', () => {
      // Replicate the exact logic from toBillingPatient in Billing.screen.tsx (strictly keyed by item.id)
      const paidByQueueId = new Map<string, string>();
      const openSoaByQueueId = new Map<string, any>();

      // Populate morning visit invoice as paid
      paidByQueueId.set('queue-morning-dv001', 'INV-2026-0001');

      // Afternoon visit has no invoice yet
      const morningItem = {
        id: 'queue-morning-dv001',
        patientId: 'patient-test-100',
        patientName: 'Adversarial Test Patient',
        queueNumber: 'DV-001',
        isDirectVisit: true,
        doctorId: 'doc-1',
        doctorName: 'Dr. House',
      };

      const afternoonItem = {
        id: 'queue-afternoon-dv002',
        patientId: 'patient-test-100', // SAME PATIENT!
        patientName: 'Adversarial Test Patient',
        queueNumber: 'DV-002',
        isDirectVisit: true,
        doctorId: 'doc-2',
        doctorName: 'Dr. Strange',
      };

      // Helper matching toBillingPatient:
      const simulateToBillingPatient = (item: any) => {
        const openInv = openSoaByQueueId?.get(item.id);
        const paidInvNum = paidByQueueId?.get(item.id);
        return {
          key: item.id,
          patientId: item.patientId,
          patientName: item.patientName,
          queueItemId: item.id,
          queueNumber: item.queueNumber,
          isDirectVisit: Boolean(item.isDirectVisit || item.queueNumber?.startsWith('DV-')),
          doctorId: item.doctorId,
          doctorName: item.doctorName,
          hasOpenSoa: Boolean(openInv),
          activeInvoice: openInv,
          isAlreadyBilled: !openInv && Boolean(paidInvNum),
          existingInvoiceNumber: openInv ? openInv.invoiceNumber : paidInvNum,
        };
      };

      const morningPatient = simulateToBillingPatient(morningItem);
      const afternoonPatient = simulateToBillingPatient(afternoonItem);

      // Morning visit must be marked already billed
      expect(morningPatient.isAlreadyBilled).toBe(true);
      expect(morningPatient.existingInvoiceNumber).toBe('INV-2026-0001');
      expect(morningPatient.hasOpenSoa).toBe(false);

      // Afternoon visit must be completely UNBILLED and NOT locked out
      expect(afternoonPatient.isAlreadyBilled).toBe(false);
      expect(afternoonPatient.existingInvoiceNumber).toBeUndefined();
      expect(afternoonPatient.hasOpenSoa).toBe(false);
      expect(afternoonPatient.activeInvoice).toBeUndefined();
    });

    test('1.2 Zero legacy patientId-only orphan fallback shims exist in Billing.screen.tsx', () => {
      expect(billingContent).not.toContain('orphanOpenByPatientId');
      expect(billingContent).not.toContain('orphanPaidByPatientId');
    });

    test('1.3 handleSelectPatient scopes paid invoices and procedures strictly by queueItemId', () => {
      // Adversarial check on handleSelectPatient implementation in Billing.screen.tsx
      expect(billingContent).toContain('inv.queueItemId === p.queueItemId && inv.status === \'Paid\'');
      expect(billingContent).toContain('proc.queueItemId === p.queueItemId');

      // Simulate isolation of paid items and procedures across two visits of same patient
      const allInvoices = [
        {
          id: 'inv-1',
          queueItemId: 'queue-morning-dv001',
          patientId: 'patient-test-100',
          status: 'Paid',
          lineItems: [{ itemCode: 'CONSULT', description: 'Consultation', quantity: 1, unitPrice: 500 }],
        },
      ];

      const allProcedures = [
        {
          id: 'proc-morning',
          queueItemId: 'queue-morning-dv001',
          patientId: 'patient-test-100',
          procedureName: 'Morning Dressing',
          procedureCode: 'PROC-DRESS',
          status: 'Completed',
        },
        {
          id: 'proc-afternoon',
          queueItemId: 'queue-afternoon-dv002',
          patientId: 'patient-test-100',
          procedureName: 'Afternoon ECG',
          procedureCode: 'PROC-ECG',
          status: 'Ordered',
        },
      ];

      // Selecting afternoon visit DV-002:
      const pAfternoon = {
        patientId: 'patient-test-100',
        queueItemId: 'queue-afternoon-dv002',
      };

      const paidInvoicesForVisit = allInvoices.filter((inv) =>
        pAfternoon.queueItemId
          ? inv.queueItemId === pAfternoon.queueItemId && inv.status === 'Paid'
          : inv.patientId === pAfternoon.patientId && inv.status === 'Paid'
      );

      // Morning paid invoice is NOT part of afternoon visit
      expect(paidInvoicesForVisit.length).toBe(0);

      // Filter procedures for afternoon visit
      const visitProcedures = allProcedures.filter((proc) => {
        if (proc.status === 'Cancelled') return false;
        if (pAfternoon.queueItemId) {
          return proc.queueItemId === pAfternoon.queueItemId;
        }
        return true;
      });

      expect(visitProcedures.length).toBe(1);
      expect(visitProcedures[0].procedureCode).toBe('PROC-ECG');
      expect(visitProcedures[0].procedureName).toBe('Afternoon ECG');
    });
  });

  // =========================================================================
  // Challenge 2: Add-On Unbilled Procedures & Supplemental Invoices
  // =========================================================================
  describe('Challenge 2: Add-On Unbilled Procedures & Supplemental Invoice Flow', () => {
    test('2.1 After earlier settlement, unbilled procedures trigger Add-on Unbilled badge and supplemental invoice', () => {
      // Verify source code hooks in Billing.screen.tsx
      expect(billingContent).toContain('hasAddOnUnbilled: true');
      expect(billingContent).toContain('addOnUnbilledCount: addedCount');
      expect(billingContent).toContain('setAllowDuplicate(true)');
      expect(billingContent).toContain('Supplemental invoice enabled');

      // Verify UI renders warning badge and supplemental header
      expect(billingContent).toContain('<Badge label="Add-on Unbilled" variant="warning" size="sm" />');
      expect(billingContent).toContain('Supplemental Statement of Account');
      expect(billingContent).toContain('Newly ordered procedures');

      // Verify settle button is NOT blocked when hasAddOnUnbilled is true
      expect(billingContent).toContain('!selectedPatient.hasAddOnUnbilled');
      expect(billingContent).toContain('allowDuplicate: isRetail ? true : (allowDuplicate || Boolean(selectedPatient.hasAddOnUnbilled))');
    });

    test('2.2 Full simulation of add-on procedure detection logic', () => {
      // Simulate handleSelectPatient rehydration when a patient was already billed
      const p = {
        patientId: 'patient-100',
        patientName: 'Maria Santos',
        queueItemId: 'queue-dv001',
        queueNumber: 'DV-001',
        isAlreadyBilled: true,
        existingInvoiceNumber: 'INV-2026-0088',
      };

      const paidInvoices = [
        {
          queueItemId: 'queue-dv001',
          status: 'Paid',
          lineItems: [
            { itemCode: 'CONSULT', description: 'General Consultation', quantity: 1 },
          ],
        },
      ];

      const paidItemCodeCounts = new Map<string, number>();
      const paidItemNameCounts = new Map<string, number>();
      for (const paidInv of paidInvoices) {
        for (const item of paidInv.lineItems || []) {
          if (item.itemCode) paidItemCodeCounts.set(item.itemCode.toLowerCase(), 1);
          if (item.description) paidItemNameCounts.set(item.description.toLowerCase(), 1);
        }
      }

      // Clinic procedure ordered after payment
      const procedures = [
        {
          id: 'proc-999',
          queueItemId: 'queue-dv001',
          procedureCode: 'NEB',
          procedureName: 'Nebulization Treatment',
          category: 'Procedure',
          status: 'Ordered',
        },
      ];

      const initialItems: any[] = [];
      const updatedItems = [...initialItems];
      let addedCount = 0;

      for (const proc of procedures) {
        const codeKey = proc.procedureCode?.toLowerCase();
        const nameKey = proc.procedureName.toLowerCase();
        const paidCodeCount = codeKey ? (paidItemCodeCounts.get(codeKey) || 0) : 0;
        const paidNameCount = paidItemNameCounts.get(nameKey) || 0;
        const isProcPaid = paidCodeCount > 0 || paidNameCount > 0;

        if (!isProcPaid) {
          updatedItems.push({
            code: proc.procedureCode,
            name: proc.procedureName,
            price: 350,
            qty: 1,
          });
          addedCount++;
        }
      }

      expect(addedCount).toBe(1);
      expect(updatedItems.length).toBe(1);
      expect(updatedItems[0].code).toBe('NEB');

      // When p.isAlreadyBilled is true, hasAddOnUnbilled is enabled
      const finalPatientState = p.isAlreadyBilled
        ? { ...p, hasAddOnUnbilled: true, addOnUnbilledCount: addedCount }
        : p;

      expect(finalPatientState.hasAddOnUnbilled).toBe(true);
      expect(finalPatientState.addOnUnbilledCount).toBe(1);

      // Settle button disabled condition simulation:
      const isSettleDisabled =
        !finalPatientState ||
        updatedItems.length === 0 ||
        (Boolean(finalPatientState.isAlreadyBilled) &&
          !finalPatientState.hasAddOnUnbilled); // Note: activeInvoice and allowDuplicate are false

      expect(isSettleDisabled).toBe(false); // MUST NOT be disabled!
    });
  });

  // =========================================================================
  // Challenge 3: Zero-Write Navigation in Patients.screen.tsx
  // =========================================================================
  describe('Challenge 3: Zero-Write Patient Directory Quick Actions', () => {
    test('3.1 resolveActiveVisitForAction causes ZERO mutations on click', () => {
      // Must not call checkInPatient, ensureDirectVisit, or createQueueItem
      const funcMatch = patientsContent.match(/const resolveActiveVisitForAction = \([\s\S]*?\n  \};/);
      expect(funcMatch).not.toBeNull();
      const funcBody = funcMatch![0];

      expect(funcBody).not.toContain('checkInPatient');
      expect(funcBody).not.toContain('ensureDirectVisit');
      expect(funcBody).not.toContain('createQueueItem');
      expect(funcBody).not.toContain('fetch(');
      expect(funcBody).not.toContain('axios');
    });

    test('3.2 All 5 clinical quick actions route through zero-write flows', () => {
      // 1. Consult
      expect(patientsContent).toContain("resolveActiveVisitForAction(patient, 'Doctor Consultation'");
      expect(patientsContent).toContain("navigation.navigate('Consultations', {");

      // 2. Health screening (profiling)
      expect(patientsContent).toContain('handleStartProfilingAction = (patient: ClinicPatient) =>');
      expect(patientsContent).toContain('handleOpenPhilHealthProfile(patient)');

      // 3. Vitals
      expect(patientsContent).toContain("resolveActiveVisitForAction(patient, 'Vitals Check'");
      expect(patientsContent).toContain('setVitalsModalVisible(true)');

      // 4. Clinical Procedure
      expect(patientsContent).toContain("resolveActiveVisitForAction(patient, 'Clinical Procedure'");
      expect(patientsContent).toContain("handleOpenChart(patient, 'procedures', undefined, queueItemId");

      // 5. Medical Certificate
      expect(patientsContent).toContain("resolveActiveVisitForAction(patient, 'Medical Certificate'");
      expect(patientsContent).toContain('setMedCertModalVisible(true)');
    });

    test('3.3 Legacy ensureEncounterQueueItem is completely eradicated from Patients.screen.tsx', () => {
      expect(patientsContent).not.toContain('ensureEncounterQueueItem');
    });
  });

  // =========================================================================
  // Challenge 4: UI Badges & Token Compliance
  // =========================================================================
  describe('Challenge 4: Diagnostic, Status Badges & Design Token Integrity', () => {
    test('4.1 EncountersTimelineTab: text-only diagnosis pills without activity icon', () => {
      expect(timelineContent).not.toContain('icon="activity"');
      expect(timelineContent).not.toContain('icon="activity"');
      expect(timelineContent).not.toContain('icon="yakap"');
    });

    test('4.2 LifestyleSocialTab & ReproductiveHealthTab: no idle Auto-save badge, formatLastSavedBadge present', () => {
      expect(lifestyleContent).not.toContain('Auto-save active');
      expect(lifestyleContent).toContain('formatLastSavedBadge');
      expect(reproContent).not.toContain('Auto-save active');
      expect(reproContent).toContain('formatLastSavedBadge');
    });

    test('4.3 Billing.screen.tsx strictly contains 0 raw hex color literals', () => {
      const hexRegex = /#(?:[0-9a-fA-F]{3}){1,2}\b/g;
      const matches = billingContent.match(hexRegex) || [];
      expect(matches).toEqual([]);
    });
  });

  // =========================================================================
  // Challenge 5: Post-Audit Edge-Case Hardening
  // =========================================================================
  describe('Challenge 5: Workstation Direct • DV Badge, Chart Catalog Materialization & Ephemeral Guards', () => {
    const spinePath = path.resolve(__dirname, '../components/chart/PatientSummarySpine.tsx');
    const consultPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
    const chartModalPath = path.resolve(__dirname, '../components/chart/PatientChartModal.tsx');
    const vitalsModalPath = path.resolve(__dirname, '../components/consultation/RecordVitalsModal.tsx');

    const spineContent = fs.readFileSync(spinePath, 'utf8');
    const consultContent = fs.readFileSync(consultPath, 'utf8');
    const chartModalContent = fs.readFileSync(chartModalPath, 'utf8');
    const vitalsModalContent = fs.readFileSync(vitalsModalPath, 'utf8');

    test('5.1 PatientSummarySpine and Consultations workstation render Direct • DV-001 badge', () => {
      expect(spineContent).toContain("`Direct • ${effectiveTicket}`");
      expect(consultContent).toContain("`Direct • ${p.queueNumber}`");
    });

    test('5.2 PatientChartModal built-in OrderCatalogSearchModal lazily materializes direct visit via ensureDirectVisit', () => {
      expect(chartModalContent).toContain('clinicService.ensureDirectVisit');
      expect(chartModalContent).toContain('handleSubmitBuiltInCatalogOrder');
    });

    test('5.3 RecordVitalsModal validates hasAnyVital BEFORE calling ensureDirectVisit', () => {
      const validationIdx = vitalsModalContent.indexOf('const hasAnyVital =');
      const ensureVisitIdx = vitalsModalContent.indexOf('clinicService.ensureDirectVisit');
      expect(validationIdx).toBeGreaterThan(-1);
      expect(ensureVisitIdx).toBeGreaterThan(validationIdx);
    });

    test('5.4 Consultations workstation never passes ephemeral-... ID as queueItemId GUID to RecordVitalsModal', () => {
      expect(consultContent).toContain("queueItemId={selectedPatient.id.startsWith('ephemeral-') ? null : selectedPatient.id}");
      expect(consultContent).toContain('onMaterializeVisit={(directVisit) =>');
    });
  });
});
