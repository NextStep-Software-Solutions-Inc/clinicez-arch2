import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children }: any) => React.createElement('div', { 'data-component': name }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Image: createMockComponent('Image'),
  Dimensions: {
    get: () => ({ width: 1024, height: 768 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1024, height: 768 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
      interpolate() { return this; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: 'Polyline',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

let capturedMedCertOnSuccess: ((cert: any) => void) | undefined;
let capturedReferralOnSuccess: ((letter: any) => void) | undefined;

mock.module('../components/patient/IssueMedicalCertificateModal', () => ({
  default: (props: any) => {
    capturedMedCertOnSuccess = props.onSuccess;
    return React.createElement('div', { 'data-mock': 'IssueMedicalCertificateModal', 'data-queue-id': props.queueItemId ?? '' });
  },
}));

mock.module('../components/patient/IssueReferralLetterModal', () => ({
  default: (props: any) => {
    capturedReferralOnSuccess = props.onSuccess;
    return React.createElement('div', { 'data-mock': 'IssueReferralLetterModal', 'data-queue-id': props.queueItemId ?? '' });
  },
}));

const {
  normalizeActiveQueueItemId,
  matchVisitDocument,
  belongsToActiveUnsignedVisit,
  getDocumentIssuanceOutcome,
} = await import('../utils/visitDocumentDrafts');

const { default: AdministrativeDocumentsTab } = await import('../components/chart/AdministrativeDocumentsTab');

describe('Issue 223: Administrative Certificate Vault unsigned draft handling', () => {
  describe('1. Pure visitDocumentDrafts helpers', () => {
    test('1.1 normalizeActiveQueueItemId rejects ephemeral placeholder IDs and empty values', () => {
      expect(normalizeActiveQueueItemId(null)).toBeNull();
      expect(normalizeActiveQueueItemId(undefined)).toBeNull();
      expect(normalizeActiveQueueItemId('')).toBeNull();
      expect(normalizeActiveQueueItemId('ephemeral-patient-123')).toBeNull();
      expect(normalizeActiveQueueItemId('ephemeral-patient-123-1700000000')).toBeNull();
      expect(normalizeActiveQueueItemId('queue-guid-1111')).toBe('queue-guid-1111');
    });

    test('1.2 matchVisitDocument matches unsigned drafts by queueItemId even when consultationId is absent', () => {
      const drafts = [
        { id: 'mc-other', consultationId: null, queueItemId: 'queue-other' },
        { id: 'mc-active', consultationId: null, queueItemId: 'queue-active' },
      ];

      expect(
        matchVisitDocument(drafts, {
          consultationId: null,
          queueItemId: 'queue-active',
        })?.id,
      ).toBe('mc-active');

      expect(
        matchVisitDocument(drafts, {
          consultationId: 'local-draft-1234',
          queueItemId: 'queue-active',
        })?.id,
      ).toBe('mc-active');

      expect(
        matchVisitDocument(drafts, {
          consultationId: null,
          queueItemId: 'ephemeral-patient-1',
        }),
      ).toBeUndefined();
    });

    test('1.3 belongsToActiveUnsignedVisit distinguishes active visit drafts from standalone direct visits', () => {
      expect(
        belongsToActiveUnsignedVisit(
          { isSigned: false, consultationId: null, queueItemId: 'queue-active' },
          { isEncounterSigned: false, consultationId: null, queueItemId: 'queue-active' },
        ),
      ).toBe(true);

      expect(
        belongsToActiveUnsignedVisit(
          { isSigned: true, consultationId: null, queueItemId: 'direct-visit-999' },
          { isEncounterSigned: false, consultationId: null, queueItemId: 'ephemeral-patient-1' },
        ),
      ).toBe(false);
    });

    test('1.4 getDocumentIssuanceOutcome skips PDF opening and reports draft toast when isSigned === false', () => {
      const draftMedCertOutcome = getDocumentIssuanceOutcome(
        'medical-certificate',
        { isSigned: false },
        'MC-20261120-0002',
      );
      expect(draftMedCertOutcome).toEqual({
        isDraft: true,
        toastKind: 'info',
        message: 'Medical certificate saved as draft (MC-20261120-0002). Pending encounter sign-off.',
        shouldOpenPdf: false,
      });

      const signedMedCertOutcome = getDocumentIssuanceOutcome(
        'medical-certificate',
        { isSigned: true },
        'MC-20261120-0003',
      );
      expect(signedMedCertOutcome).toEqual({
        isDraft: false,
        toastKind: 'success',
        message: 'Medical certificate issued successfully (MC-20261120-0003)',
        shouldOpenPdf: true,
      });

      const draftReferralOutcome = getDocumentIssuanceOutcome(
        'referral-letter',
        { isSigned: false },
        'REF-20261120-0002',
      );
      expect(draftReferralOutcome).toEqual({
        isDraft: true,
        toastKind: 'info',
        message: 'Referral letter saved as draft (REF-20261120-0002). Pending encounter sign-off.',
        shouldOpenPdf: false,
      });
    });
  });

  describe('2. AdministrativeDocumentsTab draft badges and callback propagation', () => {
    const mockPatient: any = {
      id: 'pat-223',
      fullName: 'Maria Clara',
    };

    test('2.1 Renders Draft + Pending encounter sign-off badges and disables PDF reprint for unsigned documents', () => {
      const markup = renderToStaticMarkup(
        React.createElement(AdministrativeDocumentsTab, {
          patient: mockPatient,
          queueItemId: 'queue-223',
          medicalCertificates: [
            {
              id: 'mc-draft-1',
              certificateNumber: 'MC-20261120-0002',
              patientId: mockPatient.id,
              patientName: mockPatient.fullName,
              doctorName: 'Dr. Elena Cruz',
              prcLicenseNumber: '0123456',
              issueDate: '2026-11-20',
              diagnosis: 'Acute Bronchitis',
              fitnessStatus: 'UnfitToWork',
              isSigned: false,
              queueItemId: 'queue-223',
              createdAt: '2026-11-20T09:00:00Z',
            } as any,
          ],
          referralLetters: [
            {
              id: 'ref-draft-1',
              referralNumber: 'REF-20261120-0002',
              patientId: mockPatient.id,
              patientName: mockPatient.fullName,
              referringDoctorName: 'Dr. Elena Cruz',
              referralDate: '2026-11-20',
              referredToFacility: 'PGH',
              referredDepartment: 'Pulmonology',
              provisionalDiagnosis: 'Acute Bronchitis',
              reasonForReferral: 'Specialist consult',
              urgency: 'Routine',
              isSigned: false,
              queueItemId: 'queue-223',
              createdAt: '2026-11-20T09:05:00Z',
            } as any,
          ],
        }),
      );

      expect(markup).toContain('MC-20261120-0002');
      expect(markup).toContain('REF-20261120-0002');
      expect(markup).toContain('Draft');
      expect(markup).toContain('Pending encounter sign-off');
      expect(markup).toContain('Drafted on');
      expect(markup).toContain('Sign encounter to print');
    });

    test('2.2 Propagates issued certificate and referral records to parent callbacks in both empty and populated states', () => {
      const emittedCerts: any[] = [];
      const emittedReferrals: any[] = [];
      let refreshCount = 0;

      // Empty state mount
      capturedMedCertOnSuccess = undefined;
      capturedReferralOnSuccess = undefined;
      renderToStaticMarkup(
        React.createElement(AdministrativeDocumentsTab, {
          patient: mockPatient,
          queueItemId: 'queue-223',
          medicalCertificates: [],
          referralLetters: [],
          onRefreshChart: () => {
            refreshCount += 1;
          },
          onMedicalCertificateIssued: (cert) => emittedCerts.push(cert),
          onReferralLetterIssued: (letter) => emittedReferrals.push(letter),
        }),
      );

      const draftCert = { id: 'mc-1', certificateNumber: 'MC-20261120-0001', isSigned: false };
      const draftRef = { id: 'ref-1', referralNumber: 'REF-20261120-0001', isSigned: false };
      capturedMedCertOnSuccess?.(draftCert);
      capturedReferralOnSuccess?.(draftRef);

      expect(emittedCerts).toEqual([draftCert]);
      expect(emittedReferrals).toEqual([draftRef]);
      expect(refreshCount).toBe(2);

      // Populated state mount
      capturedMedCertOnSuccess = undefined;
      capturedReferralOnSuccess = undefined;
      renderToStaticMarkup(
        React.createElement(AdministrativeDocumentsTab, {
          patient: mockPatient,
          queueItemId: 'queue-223',
          medicalCertificates: [draftCert as any],
          referralLetters: [],
          onRefreshChart: () => {
            refreshCount += 1;
          },
          onMedicalCertificateIssued: (cert) => emittedCerts.push(cert),
          onReferralLetterIssued: (letter) => emittedReferrals.push(letter),
        }),
      );

      const updatedCert = { ...draftCert, diagnosis: 'Updated diagnosis' };
      const secondRef = { id: 'ref-2', referralNumber: 'REF-20261120-0002', isSigned: false };
      capturedMedCertOnSuccess?.(updatedCert);
      capturedReferralOnSuccess?.(secondRef);

      expect(emittedCerts).toEqual([draftCert, updatedCert]);
      expect(emittedReferrals).toEqual([draftRef, secondRef]);
      expect(refreshCount).toBe(4);
    });
  });

  describe('3. Modal and Consultations.screen.tsx integration invariants', () => {
    const medCertModalSource = fs.readFileSync(
      path.resolve(__dirname, '../components/patient/IssueMedicalCertificateModal.tsx'),
      'utf8',
    );
    const referralModalSource = fs.readFileSync(
      path.resolve(__dirname, '../components/patient/IssueReferralLetterModal.tsx'),
      'utf8',
    );
    const consultationsSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx'),
      'utf8',
    );

    test('3.1 Both issuance modals use getDocumentIssuanceOutcome and normalize queueItemId', () => {
      expect(medCertModalSource).toContain("getDocumentIssuanceOutcome('medical-certificate'");
      expect(medCertModalSource).toContain('normalizeActiveQueueItemId(queueItemId)');
      expect(medCertModalSource).toContain('if (outcome.shouldOpenPdf)');

      expect(referralModalSource).toContain("getDocumentIssuanceOutcome('referral-letter'");
      expect(referralModalSource).toContain('normalizeActiveQueueItemId(queueItemId)');
      expect(referralModalSource).toContain('queueItemId: effectiveQueueItemId || undefined');
      expect(referralModalSource).toContain('if (outcome.shouldOpenPdf)');
    });

    test('3.2 Consultations.screen.tsx hydrates unsigned visit documents even without a saved ConsultationEncounter and wires vault callbacks', () => {
      expect(consultationsSource).toContain('async function fetchVisitDocumentDrafts');
      expect(consultationsSource).toContain('if (!matchedEncounter)');
      expect(consultationsSource).toContain('onMedicalCertificateIssued=');
      expect(consultationsSource).toContain('onReferralLetterIssued=');
      expect(consultationsSource).toContain('queueItemId={normalizeActiveQueueItemId(selectedPatient?.id)}');
    });
  });
});
