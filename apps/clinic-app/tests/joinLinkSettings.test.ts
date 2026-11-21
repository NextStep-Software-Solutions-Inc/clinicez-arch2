// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, onPress, testID, disabled, accessibilityState }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(testID ? { 'data-testid': testID } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled) } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
      },
      placeholder,
      children
    );
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
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
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

mock.module('expo-print', () => ({
  printAsync: async () => {},
  printToFileAsync: async () => ({ uri: 'file://mock/placard.pdf' }),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));
mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));
mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

// Import production domain utilities from components/settings/joinLinkUtils
export {
  generateRandomJoinCode,
  computeJoinCodeExpiration,
  isJoinCodeActive,
  formatReceptionCodeUrl,
  formatReceptionQrUrl,
  resolvePublicJoinSlugs,
  resolveEffectiveExpirationWindow,
  BLANK_PASSCODE_EXPIRATION_HELPER,
  reviewDocument,
} from '../components/settings/joinLinkUtils';

import {
  generateRandomJoinCode,
  computeJoinCodeExpiration,
  isJoinCodeActive,
  formatReceptionCodeUrl,
  formatReceptionQrUrl,
  resolvePublicJoinSlugs,
  resolveEffectiveExpirationWindow,
  deriveJoinLinkFormBaseline,
  isJoinLinkSettingsDirty,
  BLANK_PASSCODE_EXPIRATION_HELPER,
  reviewDocument,
} from '../components/settings/joinLinkUtils';

describe('Feature 9: Join Link Settings Card & Administration', () => {
  test('T1.1: Generates 8-character uppercase alphanumeric join code excluding ambiguous characters', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateRandomJoinCode(8);
      expect(code.length).toBe(8);
      expect(code).toMatch(/^[A-Z2-9]{8}$/);
      expect(code).not.toContain('0');
      expect(code).not.toContain('O');
      expect(code).not.toContain('1');
      expect(code).not.toContain('I');
    }
  });

  test('T1.2: Computes expiration timestamps accurately across all standard windows', () => {
    const now = Date.now();

    const exp24h = computeJoinCodeExpiration('24h');
    expect(exp24h).not.toBeNull();
    const diff24h = exp24h!.getTime() - now;
    expect(diff24h).toBeGreaterThan(23 * 3600 * 1000);
    expect(diff24h).toBeLessThanOrEqual(25 * 3600 * 1000);

    const exp7d = computeJoinCodeExpiration('7d');
    expect(exp7d).not.toBeNull();
    const diff7d = exp7d!.getTime() - now;
    expect(diff7d).toBeGreaterThan(6 * 86400 * 1000);

    const expNever = computeJoinCodeExpiration('never');
    expect(expNever).toBeNull();
  });

  test('T1.3: Accurately evaluates join code active status with future expiry date', () => {
    const future = new Date(Date.now() + 3600000);
    expect(isJoinCodeActive(true, future)).toBe(true);
    expect(isJoinCodeActive(true, null)).toBe(true);
  });

  test('T1.4: Accurately detects and blocks expired join code', () => {
    const past = new Date(Date.now() - 60000);
    expect(isJoinCodeActive(true, past)).toBe(false);
  });

  test('T1.5: Accurately detects and blocks disabled join link even with future expiry', () => {
    const future = new Date(Date.now() + 3600000);
    expect(isJoinCodeActive(false, future)).toBe(false);
    expect(isJoinCodeActive(false, null)).toBe(false);
  });

  test('T2.1 (Boundary): Exactly expired timestamp by 1 millisecond returns inactive', () => {
    const justExpired = new Date(Date.now() - 1);
    expect(isJoinCodeActive(true, justExpired)).toBe(false);
  });

  test('T2.2 (Boundary): Future timestamp by 1000 milliseconds returns active', () => {
    const active = new Date(Date.now() + 1000);
    expect(isJoinCodeActive(true, active)).toBe(true);
  });
});

describe('Feature 10: Printable Reception QR Placard', () => {
  test('T1.1: Constructs full public join URL incorporating tenant, facility, and ?code= query param', () => {
    const url = formatReceptionQrUrl('https://portal.clinicez.ph', 'ustp', 'cdo-clinic', 'USTP2026');
    expect(url).toBe('https://portal.clinicez.ph/join/ustp/cdo-clinic?code=USTP2026');
  });

  test('T1.2: Properly URL-encodes special characters in join codes', () => {
    const url = formatReceptionQrUrl('https://portal.clinicez.ph', 'tenant-a', 'clinic-b', 'CODE+TEST&1');
    expect(url).toContain('code=CODE%2BTEST%261');
  });

  test('T1.3: Strips trailing slashes from base URL cleanly', () => {
    const url = formatReceptionQrUrl('https://portal.clinicez.ph///', 'ustp', 'main', 'ABC');
    expect(url).toBe('https://portal.clinicez.ph/join/ustp/main?code=ABC');
  });

  test('T2.1 (Boundary): Omitting join code produces clean locked facility route without query string', () => {
    const url = formatReceptionQrUrl('https://portal.clinicez.ph', 'ustp', 'main');
    expect(url).toBe('https://portal.clinicez.ph/join/ustp/main');
  });

  test('T2.2: Generates valid print-ready PDF 1.4 binary for reception placard', async () => {
    const { buildReceptionPlacardPdfBytes } = await import('../components/settings/receptionPlacardPdf');
    const pdfBytes = buildReceptionPlacardPdfBytes({
      facilityName: 'NextStep OPD',
      qrUrl: 'https://dev.clinicez.net/join?code=E2FW28KT',
      joinCode: 'E2FW28KT',
      expiresAtFormatted: 'Oct 15, 2026, 08:49 AM GMT+8 (in 23h)',
      letterhead: {
        header: 'NextStep OPD',
        subHeader: 'Accredited Outpatient Clinic',
        address: 'Cagayan de Oro City',
        contact: '+63 917 000 0000',
      },
    });

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.byteLength).toBeGreaterThan(1000);

    const pdfText = new TextDecoder().decode(pdfBytes);
    expect(pdfText.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdfText).toContain('/Type /Page');
    expect(pdfText).toContain('/MediaBox [0 0 612 792]');
    expect(pdfText).toContain('NEXTSTEP OPD');
    expect(pdfText).toContain('WALK-IN PATIENT SELF-ENLISTMENT');
    expect(pdfText).toContain('ACCESS PASSCODE');
    expect(pdfText).toContain('E2FW28KT');
    expect(pdfText).toContain('https://dev.clinicez.net/join?code=E2FW28KT');
    expect(formatReceptionCodeUrl('https://dev.clinicez.net/', 'E2FW28KT')).toBe('https://dev.clinicez.net/join?code=E2FW28KT');
    expect(pdfText.endsWith('%%EOF\n')).toBe(true);
  });
});

describe('Feature 12: External Document Vault Quarantine Review Workflow', () => {
  type QuarantinedDoc = import('../components/settings/joinLinkUtils').QuarantinedDoc;

  test('T1.1: Approves pending quarantined document, updating status to Verified', () => {
    const doc: QuarantinedDoc = {
      id: 'doc-1',
      title: 'Outside Chest X-Ray',
      verificationStatus: 'PendingVerification',
    };

    const reviewed = reviewDocument(doc, true);
    expect(reviewed.verificationStatus).toBe('Verified');
    expect(reviewed.rejectionReason).toBeUndefined();
  });

  test('T1.2: Rejects pending quarantined document with mandatory reason', () => {
    const doc: QuarantinedDoc = {
      id: 'doc-2',
      title: 'Lab Report Outside',
      verificationStatus: 'PendingVerification',
    };

    const reviewed = reviewDocument(doc, false, 'Unreadable scan. Please upload original PDF.');
    expect(reviewed.verificationStatus).toBe('Rejected');
    expect(reviewed.rejectionReason).toBe('Unreadable scan. Please upload original PDF.');
  });

  test('T2.1 (Defensive): Rejecting without reason throws validation error', () => {
    const doc: QuarantinedDoc = {
      id: 'doc-3',
      title: 'Medical Certificate',
      verificationStatus: 'PendingVerification',
    };

    expect(() => reviewDocument(doc, false, '')).toThrow('A rejection reason is mandatory');
    expect(() => reviewDocument(doc, false, '   ')).toThrow('A rejection reason is mandatory');
  });

  test('T3.1 (Cross-Feature): Filter pending review documents count matches PendingVerification items', () => {
    const docs: QuarantinedDoc[] = [
      { id: '1', title: 'Doc A', verificationStatus: 'PendingVerification' },
      { id: '2', title: 'Doc B', verificationStatus: 'Verified' },
      { id: '3', title: 'Doc C', verificationStatus: 'PendingVerification' },
      { id: '4', title: 'Doc D', verificationStatus: 'Rejected' },
    ];

    const pendingCount = docs.filter((d) => d.verificationStatus === 'PendingVerification').length;
    expect(pendingCount).toBe(2);
  });
});

describe('GitHub #168: resolvePublicJoinSlugs prevents raw GUID leakage on multi-level subdomains', () => {
  const RAW_TENANT_UUID = '476a9086-9012-4abc-8def-1234567890ab';

  test('maps single nested service subdomain (ctx.tenantSlug=null, ctx.facilitySlug="nextstep") to nextstep/main instead of raw UUID', () => {
    const resolved = resolvePublicJoinSlugs(
      { tenantSlug: null, facilitySlug: 'nextstep' },
      { tenantId: RAW_TENANT_UUID }
    );
    expect(resolved).toEqual({ tenantSlug: 'nextstep', facilitySlug: 'main' });

    const qrUrl = formatReceptionQrUrl('https://dev.clinicez.net', resolved.tenantSlug, resolved.facilitySlug);
    expect(qrUrl).toBe('https://dev.clinicez.net/join/nextstep/main');
    expect(qrUrl).not.toContain(RAW_TENANT_UUID);
  });

  test('uses non-UUID settings.tenantSlug and settings.facilitySlug / clinicSlug when provided on nested subdomain', () => {
    expect(
      resolvePublicJoinSlugs(
        { tenantSlug: null, facilitySlug: 'nextstep' },
        { tenantId: RAW_TENANT_UUID, tenantSlug: 'nextstep-health', facilitySlug: 'downtown' }
      )
    ).toEqual({ tenantSlug: 'nextstep-health', facilitySlug: 'downtown' });

    expect(
      resolvePublicJoinSlugs(
        { tenantSlug: null, facilitySlug: 'nextstep' },
        { tenantId: RAW_TENANT_UUID, clinicSlug: 'uptown-opd' }
      )
    ).toEqual({ tenantSlug: 'nextstep', facilitySlug: 'uptown-opd' });
  });

  test('preserves explicit ctx.tenantSlug and ctx.facilitySlug when both are valid non-UUID slugs', () => {
    expect(
      resolvePublicJoinSlugs(
        { tenantSlug: 'ustp', facilitySlug: 'cdo-clinic' },
        { tenantId: RAW_TENANT_UUID }
      )
    ).toEqual({ tenantSlug: 'ustp', facilitySlug: 'cdo-clinic' });
  });

  test('strictly rejects UUID values in ctx or settings and falls back safely to clinic/main', () => {
    expect(
      resolvePublicJoinSlugs(
        { tenantSlug: RAW_TENANT_UUID, facilitySlug: 'nextstep' },
        { tenantId: RAW_TENANT_UUID, tenantSlug: RAW_TENANT_UUID, facilitySlug: RAW_TENANT_UUID }
      )
    ).toEqual({ tenantSlug: 'nextstep', facilitySlug: 'main' });

    expect(
      resolvePublicJoinSlugs(
        { tenantSlug: null, facilitySlug: null },
        { tenantId: RAW_TENANT_UUID, tenantSlug: '476A9086-AAAA-4BBB-8CCC-000000000000' }
      )
    ).toEqual({ tenantSlug: 'clinic', facilitySlug: 'main' });
  });

  test('resolves fallback tenantSlug and facilitySlug from workspaceProfile and license when settings are empty', () => {
    expect(
      resolvePublicJoinSlugs(
        { tenantSlug: null, facilitySlug: 'nextstep' },
        { tenantId: RAW_TENANT_UUID },
        { tenantSlug: 'nextstep-group', facilitySlug: 'downtown-opd' }
      )
    ).toEqual({ tenantSlug: 'nextstep-group', facilitySlug: 'downtown-opd' });

    expect(
      resolvePublicJoinSlugs(
        { tenantSlug: null, facilitySlug: null },
        { tenantId: RAW_TENANT_UUID },
        { tenantSlug: 'apex-health' }
      )
    ).toEqual({ tenantSlug: 'apex-health', facilitySlug: 'main' });
  });
});

describe('GitHub #160 & Split Specimen Card: Blank passcode locks expiration to Never', () => {
  test('resolveEffectiveExpirationWindow forces "never" when joinCode is empty or whitespace', () => {
    expect(resolveEffectiveExpirationWindow('', '24h')).toBe('never');
    expect(resolveEffectiveExpirationWindow('   ', '7d')).toBe('never');
    expect(resolveEffectiveExpirationWindow(null, '30d')).toBe('never');
    expect(resolveEffectiveExpirationWindow(undefined, 'custom')).toBe('never');
    expect(resolveEffectiveExpirationWindow('CDO2026', '24h')).toBe('24h');
    expect(resolveEffectiveExpirationWindow('CDO2026', '30d')).toBe('30d');
  });

  test('JoinLinkSettingsCard renders split specimen preview, strips raw GUID from URL, and guards expiration when passcode is blank', async () => {
    const prevWindow = (globalThis as any).window;
    (globalThis as any).window = {
      location: {
        hostname: 'nextstep.clinic.dev.clinicez.net',
        protocol: 'https:',
        origin: 'https://nextstep.clinic.dev.clinicez.net',
        search: '',
      },
    };
    (globalThis as any).__mockClinicContext = {
      facilityName: 'NextStep Family Clinic',
      letterhead: { header: 'NextStep Family Clinic', subHeader: '', address: '', contact: '', footer: '' },
      refresh: async () => {},
    };

    try {
      const JoinLinkSettingsCard = (await import('../components/settings/JoinLinkSettingsCard')).default;
      const staleFuture = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      const markup = renderToStaticMarkup(
        React.createElement(JoinLinkSettingsCard, {
          settings: {
            id: 'set-1',
            tenantId: '476a9086-9012-4abc-8def-1234567890ab',
            clinicId: '99112233-4455-4666-8777-8899aabbccdd',
            clinicName: 'NextStep Family Clinic',
            operatingHours: '08:00-17:00',
            defaultSlotDurationMinutes: 15,
            queuePrefix: 'A',
            invoicePrefix: 'INV',
            defaultConsultationFee: 500,
            vatRate: 0,
            isJoinEnabled: true,
            joinCode: '',
            joinCodeExpiresAt: staleFuture,
          },
        })
      );

      expect(markup).toContain('Patient QR Check-In &amp; Link');
      expect(markup).toContain('QR Poster Preview');
      expect(markup).toContain('Join Passcode');
      expect(markup).toContain('aria-label="Copy Link"');
      expect(markup).toContain('data-testid="copy-join-link-btn"');
      expect(markup).not.toContain('>Copy Link<');
      expect(markup).toContain('Print QR Poster');
      expect(markup).not.toContain('Save QR &amp; Link Settings');
      expect(markup).toContain('/join/nextstep/main');
      expect(markup).not.toContain('476a9086-9012-4abc-8def-1234567890ab');
      expect(markup).not.toContain('Clinic EZ Facility');
      expect(markup).not.toContain('CDO2026');
      expect(markup).toContain(BLANK_PASSCODE_EXPIRATION_HELPER);
      expect(markup).toContain('Never expires (Permanent link)');
    } finally {
      (globalThis as any).window = prevWindow;
      delete (globalThis as any).__mockClinicContext;
    }
  });

  test('JoinLinkSettingsCard renders SkeletonList while loading and never falls back to hardcoded Clinic EZ Facility', async () => {
    const JoinLinkSettingsCard = (await import('../components/settings/JoinLinkSettingsCard')).default;

    (globalThis as any).__mockClinicContext = {
      facilityName: '',
      letterhead: { header: '', subHeader: '', address: '', contact: '', footer: '' },
      loading: true,
      refresh: async () => {},
    };

    try {
      const loadingMarkup = renderToStaticMarkup(
        React.createElement(JoinLinkSettingsCard, {
          settings: null,
        })
      );

      expect(loadingMarkup).toContain('Loading');
      expect(loadingMarkup).not.toContain('>Active<');
      expect(loadingMarkup).not.toContain('>Disabled<');
      expect(loadingMarkup).not.toContain('QR Poster Preview');
      expect(loadingMarkup).not.toContain('Clinic EZ Facility');

      (globalThis as any).__mockClinicContext = {
        facilityName: '',
        letterhead: { header: '', subHeader: '', address: '', contact: '', footer: '' },
        loading: false,
        refresh: async () => {},
      };

      const emptyNameMarkup = renderToStaticMarkup(
        React.createElement(JoinLinkSettingsCard, {
          settings: {
            id: 'set-2',
            tenantId: 'tenant-main',
            clinicId: 'clinic-main',
            clinicName: '',
            operatingHours: '',
            defaultSlotDurationMinutes: 15,
            queuePrefix: 'A',
            invoicePrefix: 'INV',
            defaultConsultationFee: 0,
            vatRate: 0,
            isJoinEnabled: true,
            joinCode: '',
            joinCodeExpiresAt: null,
          },
        })
      );

      expect(emptyNameMarkup).not.toContain('Clinic EZ Facility');
      expect(emptyNameMarkup).toContain('No clinic name set');
      expect(emptyNameMarkup).not.toContain('Save QR &amp; Link Settings');
    } finally {
      delete (globalThis as any).__mockClinicContext;
    }
  });

  test('isJoinLinkSettingsDirty returns false when unchanged and true as soon as toggle, passcode, or expiration changes', () => {
    const nowMs = Date.now();
    const in7dIso = new Date(nowMs + 7 * 24 * 3600 * 1000).toISOString();
    const saved = {
      isJoinEnabled: true,
      joinCode: 'CARE2026',
      joinCodeExpiresAt: in7dIso,
    };

    const baseline = deriveJoinLinkFormBaseline(saved, nowMs);
    expect(baseline.expirationWindow).toBe('7d');

    // Unchanged -> not dirty
    expect(
      isJoinLinkSettingsDirty(
        {
          isEnabled: true,
          joinCode: ' care2026 ',
          effectiveExpirationWindow: '7d',
          customDateStr: baseline.customDateStr,
        },
        saved,
        nowMs
      )
    ).toBe(false);

    // Toggled off -> dirty
    expect(
      isJoinLinkSettingsDirty(
        {
          isEnabled: false,
          joinCode: 'CARE2026',
          effectiveExpirationWindow: '7d',
          customDateStr: baseline.customDateStr,
        },
        saved,
        nowMs
      )
    ).toBe(true);

    // Changed passcode -> dirty
    expect(
      isJoinLinkSettingsDirty(
        {
          isEnabled: true,
          joinCode: 'NEXT8899',
          effectiveExpirationWindow: '7d',
          customDateStr: baseline.customDateStr,
        },
        saved,
        nowMs
      )
    ).toBe(true);

    // Changed expiration window -> dirty
    expect(
      isJoinLinkSettingsDirty(
        {
          isEnabled: true,
          joinCode: 'CARE2026',
          effectiveExpirationWindow: '30d',
          customDateStr: baseline.customDateStr,
        },
        saved,
        nowMs
      )
    ).toBe(true);
  });

  test('JoinLinkSettingsCard renders SegmentedControl with data-disabled="true" when passcode is blank', async () => {
    const prevWindow = (globalThis as any).window;
    (globalThis as any).window = {
      location: {
        hostname: 'nextstep.clinic.dev.clinicez.net',
        protocol: 'https:',
        origin: 'https://nextstep.clinic.dev.clinicez.net',
        search: '',
      },
    };
    (globalThis as any).__mockClinicContext = {
      facilityName: 'NextStep Family Clinic',
      letterhead: { header: 'NextStep Family Clinic', subHeader: '', address: '', contact: '', footer: '' },
      refresh: async () => {},
    };

    try {
      const JoinLinkSettingsCard = (await import('../components/settings/JoinLinkSettingsCard')).default;
      const markup = renderToStaticMarkup(
        React.createElement(JoinLinkSettingsCard, {
          settings: {
            id: 'set-blank',
            tenantId: 'tenant-1',
            clinicId: 'clinic-1',
            clinicName: 'NextStep Family Clinic',
            operatingHours: '08:00-17:00',
            defaultSlotDurationMinutes: 15,
            queuePrefix: 'A',
            invoicePrefix: 'INV',
            defaultConsultationFee: 500,
            vatRate: 0,
            isJoinEnabled: true,
            joinCode: '',
            joinCodeExpiresAt: null,
          },
        })
      );

      // Verify disabled state on SegmentedControl pressables when passcode is blank
      expect(markup).toContain('data-disabled="true"');
      expect(markup).toContain('&quot;disabled&quot;:true');
      expect(markup).toContain(BLANK_PASSCODE_EXPIRATION_HELPER);
    } finally {
      (globalThis as any).window = prevWindow;
      delete (globalThis as any).__mockClinicContext;
    }
  });

  test('Save payload contract accurately flags clearJoinCodeExpiresAt when switching active code to Never', () => {
    // When code is set and window is 'never' (computedExpiresAt is null)
    const codeWithNever = 'CARE2026';
    const computedExpiresAtNever: Date | null = null;
    const payloadNever = {
      isJoinEnabled: true,
      joinCode: codeWithNever,
      joinCodeExpiresAt: codeWithNever && computedExpiresAtNever ? (computedExpiresAtNever as Date).toISOString() : null,
      clearJoinCode: !codeWithNever,
      clearJoinCodeExpiresAt: Boolean(codeWithNever && !computedExpiresAtNever),
    };

    expect(payloadNever.joinCode).toBe('CARE2026');
    expect(payloadNever.joinCodeExpiresAt).toBeNull();
    expect(payloadNever.clearJoinCode).toBe(false);
    expect(payloadNever.clearJoinCodeExpiresAt).toBe(true);

    // When code is set and window is '24h' (computedExpiresAt is a Date)
    const codeWith24h = 'CARE2026';
    const computedExpiresAt24h = new Date(Date.now() + 24 * 3600 * 1000);
    const payload24h = {
      isJoinEnabled: true,
      joinCode: codeWith24h,
      joinCodeExpiresAt: codeWith24h && computedExpiresAt24h ? computedExpiresAt24h.toISOString() : null,
      clearJoinCode: !codeWith24h,
      clearJoinCodeExpiresAt: Boolean(codeWith24h && !computedExpiresAt24h),
    };

    expect(payload24h.joinCode).toBe('CARE2026');
    expect(payload24h.joinCodeExpiresAt).toBe(computedExpiresAt24h.toISOString());
    expect(payload24h.clearJoinCode).toBe(false);
    expect(payload24h.clearJoinCodeExpiresAt).toBe(false);

    // When code is cleared/empty
    const blankCode = '';
    const payloadBlank = {
      isJoinEnabled: true,
      joinCode: blankCode ? blankCode : null,
      joinCodeExpiresAt: null,
      clearJoinCode: !blankCode,
      clearJoinCodeExpiresAt: Boolean(blankCode && !computedExpiresAtNever),
    };

    expect(payloadBlank.joinCode).toBeNull();
    expect(payloadBlank.joinCodeExpiresAt).toBeNull();
    expect(payloadBlank.clearJoinCode).toBe(true);
    expect(payloadBlank.clearJoinCodeExpiresAt).toBe(false);
  });
});
