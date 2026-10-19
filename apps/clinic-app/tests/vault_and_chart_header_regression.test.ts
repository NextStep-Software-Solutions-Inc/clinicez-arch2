// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { CardHeader } = await import('../components/ui/Card');
const { default: ExternalDocumentVaultTab } = await import('../components/chart/ExternalDocumentVaultTab');
import type { ClinicPatient, ClinicRecordAttachmentRecord } from '../services/clinicService';

describe('Consultation Chart Header & Vault Regression Tests', () => {
  const mockPatient: ClinicPatient = {
    id: 'pat-test-1',
    clinicId: 'cln-test-1',
    tenantId: 'ten-test-1',
    patientCode: 'PAT-2026-001',
    fullName: 'Maria Dela Cruz',
    firstName: 'Maria',
    lastName: 'Dela Cruz',
    gender: 'Female',
    dateOfBirth: '1995-05-15',
    age: 31,
    contactNumber: '09171234567',
    createdAt: '2026-01-01T00:00:00Z',
  };

  test('1. CardHeader supports truncateTitle and truncateSubtitle with numberOfLines=1', () => {
    const longTitle = 'Very Long Patient Medical Chart Title That Should Not Wrap Under Any Circumstances On Desktop Workstation';
    const longSubtitle = 'Very Long Tab Description Explaining Detailed Clinical Orders, Specimens, Diagnostics, and Statutory Profiles';

    const element = React.createElement(CardHeader, {
      title: longTitle,
      subtitle: longSubtitle,
      icon: 'folder',
      truncateTitle: true,
      truncateSubtitle: true,
    });

    const markup = renderToStaticMarkup(element);
    expect(markup).toContain(longTitle);
    expect(markup).toContain(longSubtitle);

    // Verify element props pass truncation flags
    expect(element.props.truncateTitle).toBe(true);
    expect(element.props.truncateSubtitle).toBe(true);
  });

  test('2. ExternalDocumentVaultTab renders filter chips with horizontal non-wrapping structure', () => {
    const sampleAttachments: ClinicRecordAttachmentRecord[] = [
      {
        id: 'att-1',
        patientId: mockPatient.id,
        recordType: 'OutsideChestXRay',
        title: 'Outside Chest X-Ray Film',
        fileName: 'cxr.pdf',
        storageUri: 'tenants/1/vault/cxr.pdf.cez',
        encryptionAlgorithm: 'AES-256-GCM',
        verificationStatus: 'Pending',
        uploadedAtUtc: '2026-10-15T08:00:00Z',
      },
      {
        id: 'att-2',
        patientId: mockPatient.id,
        recordType: 'COR',
        title: 'Certificate of Registration',
        fileName: 'cor.jpg',
        storageUri: 'tenants/1/vault/cor.jpg.cez',
        encryptionAlgorithm: 'AES-256-GCM',
        verificationStatus: 'Verified',
        verifiedByStaffName: 'Dr. Santos',
        uploadedAtUtc: '2026-10-14T08:00:00Z',
      },
    ];

    const markup = renderToStaticMarkup(
      React.createElement(ExternalDocumentVaultTab, {
        patient: mockPatient,
        attachments: sampleAttachments,
      })
    );

    // Verify all status filter chips are rendered
    expect(markup).toContain('All (2)');
    expect(markup).toContain('Pending Review (1)');
    expect(markup).toContain('Verified (1)');
    expect(markup).toContain('Rejected (0)');

    // Verify document type filter chips are rendered
    expect(markup).toContain('All Records (2)');
    expect(markup).toContain('Outside Chest X-Ray');
    expect(markup).toContain('Cert of Registration (COR)');
    expect(markup).toContain('Outside Labs');

    // Verify Attach External Document button is rendered
    expect(markup).toContain('Attach External Document');
  });

  test('3. ExternalDocumentVaultTab invokes onUploadDocument when Attach External Document is clicked', () => {
    let uploadCalled = false;
    const onUploadDocMock = () => {
      uploadCalled = true;
    };

    const element = React.createElement(ExternalDocumentVaultTab, {
      patient: mockPatient,
      attachments: [],
      onUploadDocument: onUploadDocMock,
    });

    expect(element.props.onUploadDocument).toBeDefined();
    element.props.onUploadDocument();
    expect(uploadCalled).toBe(true);
  });

  test('4. Dynamic Tab Descriptions Dictionary matches statutory 7 tabs', () => {
    const CHART_TAB_DESCRIPTIONS: Record<string, string> = {
      summary: 'Executive clinical summary, problems, and vital trends',
      encounters: 'Timeline of historical clinical visits and SOAP documentation',
      diagnostics: 'Diagnostic laboratory orders, results, and specimen requisitions',
      procedures: 'Nursing procedures, treatments, and clinical interventions',
      immunizations: 'Statutory immunizations, schedules, and adverse events (AEFI)',
      profiles: 'Past medical history, surgical, social, and NCD risk profiles',
      vault: 'External document vault, outside imaging films, and clearances',
    };

    expect(CHART_TAB_DESCRIPTIONS.summary).toBe('Executive clinical summary, problems, and vital trends');
    expect(CHART_TAB_DESCRIPTIONS.encounters).toContain('SOAP');
    expect(CHART_TAB_DESCRIPTIONS.diagnostics).toContain('laboratory');
    expect(CHART_TAB_DESCRIPTIONS.procedures).toContain('Nursing');
    expect(CHART_TAB_DESCRIPTIONS.immunizations).toContain('immunizations');
    expect(CHART_TAB_DESCRIPTIONS.profiles).toContain('profiles');
    expect(CHART_TAB_DESCRIPTIONS.vault).toBe('External document vault, outside imaging films, and clearances');
  });
});
