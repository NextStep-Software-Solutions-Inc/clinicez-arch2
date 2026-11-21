// token-guard:ignore-file
import { describe, expect, test, beforeEach, afterEach, afterAll, mock } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function makeNode(tag: string, nodeType = 1): any {
  const children: any[] = [];
  const listeners = new Map<string, Set<Function>>();
  const attrs: Record<string, any> = {};
  const node: any = {
    nodeType,
    tagName: tag.toUpperCase(),
    nodeName: tag.toUpperCase(),
    style: {},
    dataset: {},
    childNodes: children,
    children,
    parentNode: null,
    ownerDocument: null as any,
    textContent: '',
    nodeValue: '',
    appendChild(child: any) {
      child.parentNode = node;
      children.push(child);
      return child;
    },
    insertBefore(child: any, ref: any) {
      child.parentNode = node;
      const idx = children.indexOf(ref);
      if (idx === -1) children.push(child);
      else children.splice(idx, 0, child);
      return child;
    },
    removeChild(child: any) {
      const idx = children.indexOf(child);
      if (idx !== -1) children.splice(idx, 1);
      child.parentNode = null;
      return child;
    },
    setAttribute(k: string, v: any) {
      attrs[k] = String(v);
    },
    getAttribute(k: string) {
      return attrs[k] ?? null;
    },
    removeAttribute(k: string) {
      delete attrs[k];
    },
    addEventListener(type: string, fn: Function) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: Function) {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent(evt: any) {
      const eventObj = {
        ...evt,
        target: evt?.target ?? node,
        currentTarget: node,
        stopPropagation: () => {},
        preventDefault: () => {},
      };
      const set = listeners.get(evt?.type);
      if (set) {
        for (const fn of Array.from(set)) fn(eventObj);
      }
      if (evt?.bubbles !== false && node.parentNode) {
        node.parentNode.dispatchEvent({ ...eventObj, currentTarget: node.parentNode });
      } else if (evt?.bubbles !== false && node.ownerDocument && node.parentNode === null) {
        node.ownerDocument.dispatchEvent(eventObj);
      }
      return true;
    },
    focus() {},
    blur() {},
    contains(other: any) {
      if (other === node) return true;
      return children.some((c) => c.contains?.(other));
    },
    querySelectorAll(selector: string): any[] {
      const out: any[] = [];
      const testAttrMatch = selector.match(/^\[([a-zA-Z0-9_-]+)="([^"]+)"\]$/);
      const walk = (n: any) => {
        for (const c of n.childNodes || []) {
          if (testAttrMatch) {
            if (c.getAttribute?.(testAttrMatch[1]) === testAttrMatch[2]) out.push(c);
          } else if (c.tagName === selector.toUpperCase()) {
            out.push(c);
          }
          walk(c);
        }
      };
      walk(node);
      return out;
    },
    querySelector(selector: string): any | null {
      return node.querySelectorAll(selector)[0] ?? null;
    },
  };
  Object.defineProperty(node, 'firstChild', { get: () => children[0] ?? null });
  Object.defineProperty(node, 'lastChild', { get: () => children[children.length - 1] ?? null });
  Object.defineProperty(node, 'nextSibling', {
    get: () => {
      if (!node.parentNode) return null;
      const sibs = node.parentNode.childNodes;
      const idx = sibs.indexOf(node);
      return idx >= 0 ? (sibs[idx + 1] ?? null) : null;
    },
  });
  return node;
}

const fakeDoc: any = makeNode('#document', 9);
fakeDoc.createElement = (tag: string) => {
  const n = makeNode(tag, 1);
  n.ownerDocument = fakeDoc;
  return n;
};
fakeDoc.createElementNS = (_ns: string, tag: string) => {
  const n = makeNode(tag, 1);
  n.ownerDocument = fakeDoc;
  return n;
};
fakeDoc.createTextNode = (txt: string) => {
  const n = makeNode('#text', 3);
  n.nodeValue = txt;
  n.textContent = txt;
  n.ownerDocument = fakeDoc;
  return n;
};
fakeDoc.createComment = (txt: string) => {
  const n = makeNode('#comment', 8);
  n.nodeValue = txt;
  n.ownerDocument = fakeDoc;
  return n;
};
fakeDoc.body = makeNode('body', 1);
fakeDoc.body.ownerDocument = fakeDoc;
fakeDoc.documentElement = makeNode('html', 1);
fakeDoc.documentElement.ownerDocument = fakeDoc;
fakeDoc.head = makeNode('head', 1);
fakeDoc.head.ownerDocument = fakeDoc;
fakeDoc.activeElement = fakeDoc.body;

const winObj: any = {
  document: fakeDoc,
  location: { href: 'http://localhost:8081/', origin: 'http://localhost:8081' },
  addEventListener: () => {},
  removeEventListener: () => {},
  open: () => null,
  HTMLIFrameElement: function HTMLIFrameElement() {},
};
fakeDoc.defaultView = winObj;
(globalThis as any).document = fakeDoc;
(globalThis as any).window = winObj;

const createMockComponent = (name: string) => {
  const Comp = ({ children, testID, accessibilityLabel, ...rest }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        'data-testid': testID,
        'aria-label': accessibilityLabel,
        ...rest,
      },
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: ({ children, onPress, disabled, testID, accessibilityLabel, accessibilityRole }: any) =>
    React.createElement(
      'button',
      {
        type: 'button',
        disabled: Boolean(disabled),
        'aria-disabled': disabled ? 'true' : undefined,
        'data-testid': testID,
        'aria-label': accessibilityLabel,
        role: accessibilityRole || 'button',
        onClick: disabled ? undefined : onPress,
      },
      children
    ),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: ({ value, onChangeText, placeholder, testID }: any) =>
    React.createElement('input', {
      value: value ?? '',
      placeholder: placeholder ?? '',
      'data-testid': testID,
      ref: (el: any) => {
        if (el) el.__onChangeText = onChangeText;
      },
      onChange: (e: any) => onChangeText?.(e.target.value),
    }),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: ({ visible, children }: any) => (visible ? React.createElement('div', null, children) : null),
  Image: createMockComponent('Image'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  Switch: createMockComponent('Switch'),
  RefreshControl: createMockComponent('RefreshControl'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  processColor: (c: any) => c,
  PanResponder: { create: () => ({ panHandlers: {} }) },
  UIManager: {},
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
  },
  DeviceEventEmitter: { addListener: () => ({ remove: () => {} }) },
  Alert: { alert: () => {} },
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) {
        this.val = val;
      }
      interpolate() {
        return this;
      }
    },
    timing: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
    sequence: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
    loop: () => ({ start: () => {}, stop: () => {} }),
    View: createMockComponent('Animated.View'),
  },
}));

mock.module('@expo-google-fonts/geist', () => ({ useFonts: () => [true] }));
mock.module('@expo-google-fonts/geist-mono', () => ({ useFonts: () => [true] }));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'mock-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('expo-document-picker', () => ({
  getDocumentAsync: async () => ({ canceled: true, assets: [] }),
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

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({ isCompact: false, isDesktop: true, width: 1280 }),
}));

let blobOpenCalls = 0;
mock.module('../services/documentOpener', () => ({
  openDocument: async () => true,
  openDocumentBlob: () => {
    blobOpenCalls += 1;
    return true;
  },
}));

const { clinicService } = await import('../services/clinicService');
const { openAvailmentSlipPdf } = await import('../utils/philhealthSlip');
const { default: PatientIdentityCheckModal } = await import(
  '../components/patient/PatientIdentityCheckModal'
);
const { default: PhilHealthSettingsTab } = await import(
  '../components/settings/PhilHealthSettingsTab'
);
const { default: PhilHealthYakapToolsSection } = await import(
  '../components/tools/PhilHealthYakapToolsSection'
);
const { default: PhilHealthCoverageModal } = await import(
  '../components/patient/PhilHealthCoverageModal'
);

async function flushMicrotasks(ticks = 6) {
  for (let i = 0; i < ticks; i++) {
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
}

async function withMountedDom(
  element: React.ReactElement,
  run: (ctx: { container: any }) => Promise<void>
) {
  const container = fakeDoc.createElement('div');
  fakeDoc.body.appendChild(container);
  const root = createRoot(container);
  try {
    await React.act(async () => {
      root.render(element);
      await flushMicrotasks();
    });
    await run({ container });
  } finally {
    await React.act(async () => {
      root.unmount();
      await flushMicrotasks(2);
    });
    container.parentNode?.removeChild(container);
  }
}

function collectText(node: any): string {
  if (!node) return '';
  if (node.nodeType === 3) return node.nodeValue || '';
  const children = node.childNodes || [];
  if (children.length === 0) return node.textContent || '';
  return children.map(collectText).join('');
}

function clickNode(node: any) {
  if (!node) throw new Error('Expected interactive node to exist');
  node.dispatchEvent({ type: 'click', bubbles: true, cancelable: true });
}

describe('YAKAP 2.0 Plain-Language UI & End-to-End Onboarding Suite', () => {
  const originals: Record<string, any> = {};
  const previousClinicCtx = (globalThis as any).__mockClinicContext;

  beforeEach(() => {
    blobOpenCalls = 0;
    (globalThis as any).__mockClinicContext = {
      facilityName: 'NextStep Primary Care',
      accreditationNumber: 'ACC-987654',
      settings: { isPhilHealthConfigured: true },
    };
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(originals)) {
      (clinicService as any)[k] = v;
    }
  });

  afterAll(() => {
    if (previousClinicCtx !== undefined) {
      (globalThis as any).__mockClinicContext = previousClinicCtx;
    } else {
      delete (globalThis as any).__mockClinicContext;
    }
  });

  test('1. Legacy v1 files are deleted and new YAKAP 2.0 components exist', () => {
    expect(fs.existsSync(path.resolve(__dirname, '../utils/yakapEnlistment.ts'))).toBe(false);
    expect(
      fs.existsSync(path.resolve(__dirname, '../components/patient/YakapEnlistmentSection.tsx'))
    ).toBe(false);
    expect(
      fs.existsSync(path.resolve(__dirname, '../components/patient/yakapEnlistment.ts'))
    ).toBe(false);
    expect(
      fs.existsSync(path.resolve(__dirname, '../components/PhilHealthProfileModal.tsx'))
    ).toBe(false);
    expect(
      fs.existsSync(path.resolve(__dirname, '../components/patient/PatientIdentityCheckModal.tsx'))
    ).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, '../utils/philhealthSlip.ts'))).toBe(true);
  });

  test('2. Rendered YAKAP 2.0 Settings, Tools, and Identity Check UI exclude forbidden jargon', () => {
    const bannedUiTerms = [
      'PCAPI',
      'PCU',
      'FPE',
      'eKAS',
      'Annex C',
      'PMCC',
      'Konsulta',
      'SOAP auth',
      'Cipher key',
      'Transmittal',
      'Current · ',
    ];

    const settingsHtml = renderToStaticMarkup(
      React.createElement(PhilHealthSettingsTab, {
        facilityName: 'NextStep Family Clinic',
        accreditationNumber: 'P123456789',
        settings: {
          clinicId: 'c1',
          facilityName: 'NextStep Family Clinic',
          accreditationNumber: 'P123456789',
          pmccNumber: '123456',
          softwareCertificateId: 'CERT-2026',
          isPhilHealthConfigured: true,
        } as any,
      })
    );
    const identityHtml = renderToStaticMarkup(
      React.createElement(PatientIdentityCheckModal, {
        visible: true,
        onClose: () => {},
        patientId: 'pat-1',
        patientName: 'Juan Dela Cruz',
        philHealthPin: '12-345678901-9',
      })
    );
    const toolsHtml = renderToStaticMarkup(
      React.createElement(PhilHealthYakapToolsSection, {
        activeTool: 'masterlist',
        onSelectTool: () => {},
        canAccess: true,
      })
    );

    const combinedRendered = `${settingsHtml}\n${identityHtml}\n${toolsHtml}`;
    for (const term of bannedUiTerms) {
      expect(combinedRendered).not.toContain(term);
    }

    expect(identityHtml).toContain('Confirm Patient Identity');
    expect(identityHtml).toContain('Face Scan');
    expect(identityHtml).toContain('Text Code (OTP)');
    expect(identityHtml).toContain('Photo ID');
    expect(toolsHtml).toContain('Sync Patient List');
    expect(toolsHtml).toContain('Checkup Records &amp; Clinic Submissions');

    const screeningSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/screening/HealthScreeningModal.tsx'),
      'utf8'
    );
    expect(screeningSrc).toContain('Continue Without PhilHealth');
    expect(screeningSrc).toContain('Print Confirmation Slip');
    expect(screeningSrc).not.toContain("'Current · '");
  });

  test('3. PatientIdentityCheckModal exercises Face Scan and Photo ID paths cleanly', async () => {
    const calls: string[] = [];
    const verifiedResults: any[] = [];

    originals.startPatientPcuSession = clinicService.startPatientPcuSession;
    originals.verifyPatientPcuSession = clinicService.verifyPatientPcuSession;
    originals.recordPatientValidId = clinicService.recordPatientValidId;

    clinicService.startPatientPcuSession = async () => {
      calls.push('pcu:start');
      return [
        {
          verificationId: 'ver-1',
          sdkUrl: '/sandbox/pcu/ver-1',
          livenessAuthorizationId: 'AUTH-001',
          status: 'PENDING',
          expiresInSeconds: 300,
        },
        null,
      ];
    };
    clinicService.verifyPatientPcuSession = async () => {
      calls.push('pcu:verify');
      return [
        {
          verificationId: 'ver-1',
          patientId: 'pat-1',
          mode: 'PCU',
          verificationDate: '2026-11-20',
          isVerified: true,
        },
        null,
      ];
    };
    clinicService.recordPatientValidId = async (_id, payload) => {
      calls.push(`id:${payload.validIdTypeCode}`);
      return [
        {
          verificationId: 'ver-3',
          patientId: 'pat-1',
          mode: 'ValidId',
          verificationDate: '2026-11-20',
          isVerified: true,
        },
        null,
      ];
    };

    await withMountedDom(
      React.createElement(PatientIdentityCheckModal, {
        visible: true,
        onClose: () => {},
        patientId: 'pat-1',
        patientName: 'Maria Clara',
        onVerified: (res) => verifiedResults.push(res),
      }),
      async ({ container }) => {
        await React.act(async () => {
          clickNode(container.querySelector('[data-testid="identity-check-start-pcu-btn"]'));
          await flushMicrotasks();
        });
        expect(calls).toContain('pcu:start');

        await React.act(async () => {
          clickNode(container.querySelector('[data-testid="identity-check-verify-pcu-btn"]'));
          await flushMicrotasks();
        });
        expect(calls).toContain('pcu:verify');
        expect(verifiedResults.length).toBe(1);
      }
    );

    await withMountedDom(
      React.createElement(PatientIdentityCheckModal, {
        visible: true,
        onClose: () => {},
        patientId: 'pat-1',
        patientName: 'Maria Clara',
        onVerified: (res) => verifiedResults.push(res),
      }),
      async ({ container }) => {
        await React.act(async () => {
          clickNode(container.querySelector('[data-testid="identity-method-valid_id"]'));
          await flushMicrotasks();
        });
        await React.act(async () => {
          clickNode(container.querySelector('[data-testid="identity-check-save-id-btn"]'));
          await flushMicrotasks();
        });
        expect(calls).toContain('id:P02');
        expect(verifiedResults.length).toBe(2);
      }
    );
  });

  test('4. openAvailmentSlipPdf decodes base64 PDF and delegates to documentOpener.openDocumentBlob', async () => {
    const ok = await openAvailmentSlipPdf({
      patient_pin: '123456789019',
      eff_year: '2026',
      mime_type: 'application/pdf',
      pdf_base64: Buffer.from('%PDF-1.4\n%test', 'ascii').toString('base64'),
    });
    expect(ok).toBe(true);
    expect(blobOpenCalls).toBe(1);
  });

  test('5. PhilHealthCoverageModal No-PIN state has no skip option, collapses locked next steps, and renders PIN error inside input description', async () => {
    originals.getPatientPhilHealthCoverage = clinicService.getPatientPhilHealthCoverage;
    clinicService.getPatientPhilHealthCoverage = async (patientId: string) => [
      {
        patientId,
        philHealthNumber: null,
        membership: null,
        enlistments: [],
        fpeStatus: { isCompleted: false, effectiveYear: 2026 },
        submissions: [],
      } as any,
      null,
    ];

    await withMountedDom(
      React.createElement(PhilHealthCoverageModal, {
        visible: true,
        onClose: () => {},
        patient: {
          id: 'pat-nopin-1',
          patientCode: 'PAT-NOPIN',
          firstName: 'Pedro',
          lastName: 'Penduko',
          fullName: 'Pedro Penduko',
          dateOfBirth: '1990-02-14',
          age: 36,
          sex: 'Male',
        } as any,
        onStartYakapScreening: () => {},
      }),
      async ({ container }) => {
        const isBtnDisabled = (el: any) =>
          Boolean(el && (el.disabled || el.getAttribute('disabled') !== null || el.getAttribute('aria-disabled') === 'true'));

        // Strict PhilHealth onboarding: no skip banner, "Continue Without PhilHealth", or redundant footer Save button
        expect(container.querySelector('[data-testid="yakap-nopin-fallback-banner"]')).toBeNull();
        expect(container.querySelector('[data-testid="coverage-continue-without-philhealth-btn"]')).toBeNull();
        expect(container.querySelector('[data-testid="philhealth-save-coverage-btn"]')).toBeNull();

        // Locked Steps 2-5 collapse to step & title ONLY (no lock badge or action buttons until unlocked)
        const modalText = collectText(container);
        expect(modalText).toContain('Step 2 · Check PhilHealth Eligibility');
        expect(modalText).toContain('Step 3 · Confirm Patient Identity');
        expect(modalText).toContain('Step 4 · Assign Patient to This Clinic');
        expect(modalText).toContain('Step 5 · 2026 Annual PhilHealth Checkup');
        expect(modalText).not.toContain('Finish Step 1 First');
        expect(modalText).not.toContain('Finish Step 2 First');
        expect(modalText).not.toContain('Finish Step 3 First');
        expect(modalText).not.toContain('Finish Step 4 First');

        expect(container.querySelector('[data-testid="check-yakap-standing-btn"]')).toBeNull();
        expect(container.querySelector('[data-testid="open-identity-check-btn"]')).toBeNull();
        expect(container.querySelector('[data-testid="assign-clinic-yakap-btn"]')).toBeNull();
        expect(container.querySelector('[data-testid="start-yakap-screening-btn"]')).toBeNull();

        // Step 1 Save button is hidden when no PIN is entered
        expect(container.querySelector('[data-testid="save-step1-membership-btn"]')).toBeNull();

        // Clicking Verify PIN on blank input shows the error inside coverage-patient-pin-input description
        const verifyBtn = container.querySelector('[data-testid="verify-pin-btn"]');
        await React.act(async () => {
          clickNode(verifyBtn);
          await flushMicrotasks();
        });
        const pinField = container.querySelector('[data-testid="coverage-patient-pin-input"]');
        expect(collectText(pinField)).toContain('Enter a complete 12-digit PhilHealth PIN.');
      }
    );
  });

  test('6. PhilHealthCoverageModal enforces sequence + PhilHealth DB verification and strict vertical steps 1 -> 2 -> 3 -> 4 -> 5', async () => {
    const isBtnDisabled = (el: any) =>
      Boolean(el && (el.disabled || el.getAttribute('disabled') !== null || el.getAttribute('aria-disabled') === 'true'));

    let storedPin: string | null = null;
    let storedVerifiedToday = false;
    let storedEnlisted = false;
    let standingChecks = 0;
    let selectionSubmits = 0;
    let launchedScreening = false;
    let verifyOutcome: 'not_found' | 'server_error' | 'verified' = 'not_found';

    originals.getPatientPhilHealthCoverage = clinicService.getPatientPhilHealthCoverage;
    originals.validatePhilHealthPin = clinicService.validatePhilHealthPin;
    originals.upsertPatientPhilHealthMembership = clinicService.upsertPatientPhilHealthMembership;
    originals.validatePatientYakapStanding = clinicService.validatePatientYakapStanding;
    originals.startPatientPcuSession = clinicService.startPatientPcuSession;
    originals.verifyPatientPcuSession = clinicService.verifyPatientPcuSession;
    originals.submitPatientYakapSelection = clinicService.submitPatientYakapSelection;

    clinicService.getPatientPhilHealthCoverage = async (patientId: string) => [
      {
        patientId,
        philHealthNumber: storedPin,
        membership: storedPin
          ? { patientId, memberType: 'MM', philHealthPin: storedPin }
          : null,
        latestIdentityVerification: storedVerifiedToday
          ? {
              verificationId: 'ver-today',
              patientId,
              mode: 'PCU',
              verificationDate: '2026-11-20',
              isVerifiedForToday: true,
              isVerified: true,
            }
          : null,
        enlistments: storedEnlisted
          ? [
              {
                id: 'enl-step4',
                patientId,
                effectiveYear: 2026,
                status: 'Active',
                source: 'ClinicEnlistment',
                enlistmentDate: '2026-11-20',
                selectionControlNumber: 'K001',
              },
            ]
          : [],
        fpeStatus: { isCompleted: false, effectiveYear: 2026 },
        currentYearFpeStatus: { isCompleted: false, effectiveYear: 2026, hasActiveEnlistment: storedEnlisted },
        submissions: [],
      } as any,
      null,
    ];
    let pendingVerifyResolve: ((res: any) => void) | null = null;
    clinicService.validatePhilHealthPin = (pin: string) =>
      new Promise((resolve) => {
        const result =
          verifyOutcome === 'not_found'
            ? ({
                isValid: false,
                formattedPin: pin,
                isSequenceValid: true,
                isPhilHealthVerified: false,
                isServerError: false,
                failureReason: 'PIN not found in PhilHealth registry.',
              } as any)
            : verifyOutcome === 'server_error'
              ? ({
                  isValid: false,
                  formattedPin: pin,
                  isSequenceValid: true,
                  isPhilHealthVerified: false,
                  isServerError: true,
                  failureReason: 'PhilHealth verification service is unavailable.',
                } as any)
              : ({
                  isValid: true,
                  formattedPin: pin,
                  isSequenceValid: true,
                  isPhilHealthVerified: true,
                  isServerError: false,
                  memberName: 'DONITO, MARCO',
                } as any);
        if (pendingVerifyResolve === null) {
          resolve([result, null]);
        } else {
          pendingVerifyResolve = () => resolve([result, null]);
        }
      });
    clinicService.upsertPatientPhilHealthMembership = async (_id, payload: any) => {
      storedPin = payload.philHealthPin;
      return [{ philHealthPin: storedPin } as any, null];
    };
    clinicService.validatePatientYakapStanding = async () => {
      standingChecks += 1;
      return [
        {
          pin: storedPin || '12-345678901-8',
          effectiveYear: 2026,
          pcuStatus: 'UNVERIFIED',
          selectionStatus: 'PENDING',
          needsIdentityCheck: true,
          needsClinicSelection: true,
          canStartCheckup: false,
          summaryMessage: 'Please verify identity and assign clinic.',
        } as any,
        null,
      ];
    };
    clinicService.startPatientPcuSession = async () => [
      {
        verificationId: 'ver-today',
        sdkUrl: '/sandbox/pcu',
        livenessAuthorizationId: 'AUTH-1',
        status: 'PENDING',
        expiresInSeconds: 300,
      },
      null,
    ];
    clinicService.verifyPatientPcuSession = async () => {
      storedVerifiedToday = true;
      return [
        {
          verificationId: 'ver-today',
          patientId: 'pat-seq-1',
          mode: 'PCU',
          verificationDate: '2026-11-20',
          isVerified: true,
        },
        null,
      ];
    };
    clinicService.submitPatientYakapSelection = async () => {
      selectionSubmits += 1;
      storedEnlisted = true;
      return [
        {
          enlistmentId: 'enl-step4',
          effectiveYear: 2026,
          selectionStatus: 'SELECTED',
          queuedForSync: false,
          assignedToClinic: true,
          message: 'Assigned cleanly.',
        } as any,
        null,
      ];
    };

    await withMountedDom(
      React.createElement(PhilHealthCoverageModal, {
        visible: true,
        onClose: () => {},
        patient: {
          id: 'pat-seq-1',
          patientCode: 'PAT-SEQ',
          firstName: 'Marco',
          lastName: 'Donito',
          fullName: 'Marco Donito',
          dateOfBirth: '2000-01-01',
          age: 26,
          sex: 'Male',
        } as any,
        onStartYakapScreening: () => {
          launchedScreening = true;
        },
      }),
      async ({ container }) => {
        const standingBtn = () => container.querySelector('[data-testid="check-yakap-standing-btn"]');
        const identityBtn = () => container.querySelector('[data-testid="open-identity-check-btn"]');
        const assignBtn = () => container.querySelector('[data-testid="assign-clinic-yakap-btn"]');
        const startBtn = () => container.querySelector('[data-testid="start-yakap-screening-btn"]');
        const saveStep1Btn = () => container.querySelector('[data-testid="save-step1-membership-btn"]');
        const verifyBtn = () => container.querySelector('[data-testid="verify-pin-btn"]');
        const pinContainer = () => container.querySelector('[data-testid="coverage-patient-pin-input"]');
        const unverifiedFlag = () => container.querySelector('[data-testid="pin-db-unverified-flag"]');

        // Locked steps 2-5 start collapsed and Save Step 1 button is hidden with blank PIN
        expect(standingBtn()).toBeNull();
        expect(identityBtn()).toBeNull();
        expect(assignBtn()).toBeNull();
        expect(startBtn()).toBeNull();
        expect(saveStep1Btn()).toBeNull();

        // Step 1: Invalid Mod-11 sequence keeps Save Step 1 hidden
        const pinInput = pinContainer()?.tagName === 'INPUT' ? pinContainer() : pinContainer()?.querySelector?.('input');
        expect(pinInput).not.toBeNull();
        await React.act(async () => {
          pinInput.__onChangeText('12-345678901-9');
          await flushMicrotasks();
        });
        expect(saveStep1Btn()).toBeNull();

        // Enter valid 12-digit Mod-11 sequence -> waits for PIN verification (button hidden until Verify PIN resolves)
        await React.act(async () => {
          pinInput.__onChangeText('12-345678901-8');
          await flushMicrotasks();
        });
        expect(collectText(pinContainer())).toContain('Click Verify PIN to confirm in PhilHealth records.');
        expect(collectText(pinContainer())).not.toContain('Valid PhilHealth PIN');
        expect(collectText(container)).not.toContain('Valid sequence — you can save now (flagged as unverified)');
        expect(saveStep1Btn()).toBeNull();

        // While Verify PIN is actively checking, Save Step 1 stays hidden and Verify PIN is disabled
        pendingVerifyResolve = () => {};
        await React.act(async () => {
          clickNode(verifyBtn());
          await flushMicrotasks(2);
        });
        expect(collectText(pinContainer())).toContain('Checking format and PhilHealth records...');
        expect(isBtnDisabled(verifyBtn())).toBe(true);
        expect(saveStep1Btn()).toBeNull();

        // Verify fails because PIN is invalid / not found in PhilHealth DB -> do NOT allow continue (button stays hidden)
        await React.act(async () => {
          pendingVerifyResolve?.(null);
          pendingVerifyResolve = null;
          await flushMicrotasks();
        });
        expect(collectText(pinContainer())).toContain('PIN not found in PhilHealth registry.');
        expect(saveStep1Btn()).toBeNull();
        expect(standingBtn()).toBeNull();

        // Verify fails due to PhilHealth server error -> button appears labeled "Defer PIN Verification & Continue"
        verifyOutcome = 'server_error';
        await React.act(async () => {
          clickNode(verifyBtn());
          await flushMicrotasks();
        });
        expect(collectText(pinContainer())).toContain('PhilHealth verification service is unavailable.');
        expect(collectText(saveStep1Btn())).toBe('Defer PIN Verification & Continue');
        expect(isBtnDisabled(saveStep1Btn())).toBe(false);

        // Deferring saves valid PIN sequence, flags DB-unverified, hides Save button (no changes left), and expands Step 2
        await React.act(async () => {
          clickNode(saveStep1Btn());
          await flushMicrotasks();
        });
        expect(storedPin).toBe('12-345678901-8');
        expect(unverifiedFlag()).not.toBeNull();
        expect(collectText(container)).toContain('Saved · Verification Pending');
        expect(saveStep1Btn()).toBeNull();
        expect(standingBtn()).not.toBeNull();
        expect(isBtnDisabled(standingBtn())).toBe(false);
        expect(identityBtn()).toBeNull();
        expect(assignBtn()).toBeNull();
        expect(startBtn()).toBeNull();

        // Later PhilHealth DB verification succeeds -> clears DB-unverified flag; no edits so Save button remains hidden
        verifyOutcome = 'verified';
        await React.act(async () => {
          clickNode(verifyBtn());
          await flushMicrotasks();
        });
        expect(collectText(pinContainer())).toContain('Verified with PhilHealth (DONITO, MARCO)');
        expect(unverifiedFlag()).toBeNull();
        expect(collectText(container)).toContain('Verified with PhilHealth');
        expect(saveStep1Btn()).toBeNull();

        // Editing to a new unsaved PIN waits hidden until Verify PIN confirms it, then shows "Save Membership & Continue"
        await React.act(async () => {
          pinInput.__onChangeText('12-345678912-3');
          await flushMicrotasks();
        });
        expect(saveStep1Btn()).toBeNull();
        await React.act(async () => {
          clickNode(verifyBtn());
          await flushMicrotasks();
        });
        expect(collectText(saveStep1Btn())).toBe('Save Membership & Continue');

        // Restore saved verified PIN and verify it cleanly (no unsaved changes -> Save button hides again)
        await React.act(async () => {
          pinInput.__onChangeText('12-345678901-8');
          await flushMicrotasks();
        });
        await React.act(async () => {
          clickNode(verifyBtn());
          await flushMicrotasks();
        });
        expect(saveStep1Btn()).toBeNull();

        // Step 2: Check PhilHealth Eligibility -> expands Step 3 while Steps 4-5 stay collapsed
        await React.act(async () => {
          clickNode(standingBtn());
          await flushMicrotasks();
        });
        expect(standingChecks).toBe(1);
        expect(identityBtn()).not.toBeNull();
        expect(isBtnDisabled(identityBtn())).toBe(false);
        expect(assignBtn()).toBeNull();
        expect(startBtn()).toBeNull();

        // Step 3: Confirm Patient Identity via sub-modal -> expands Step 4 while Step 5 stays collapsed
        await React.act(async () => {
          clickNode(identityBtn());
          await flushMicrotasks();
        });
        await React.act(async () => {
          clickNode(container.querySelector('[data-testid="identity-check-start-pcu-btn"]'));
          await flushMicrotasks();
        });
        await React.act(async () => {
          clickNode(container.querySelector('[data-testid="identity-check-verify-pcu-btn"]'));
          await flushMicrotasks();
        });
        expect(assignBtn()).not.toBeNull();
        expect(isBtnDisabled(assignBtn())).toBe(false);
        expect(startBtn()).toBeNull();

        // Step 4: Assign to This Clinic -> expands Step 5
        await React.act(async () => {
          clickNode(assignBtn());
          await flushMicrotasks();
        });
        expect(selectionSubmits).toBe(1);
        expect(startBtn()).not.toBeNull();
        expect(isBtnDisabled(startBtn())).toBe(false);

        // Step 5: Start PhilHealth Checkup works now
        await React.act(async () => {
          clickNode(startBtn());
          await flushMicrotasks();
        });
        expect(launchedScreening).toBe(true);
      }
    );
  });

  test('7. PhilHealthCoverageModal blocks Dependent (DD) continuation until all required Principal Member fields are valid', async () => {
    const isBtnDisabled = (el: any) =>
      Boolean(el && (el.disabled || el.getAttribute('disabled') !== null || el.getAttribute('aria-disabled') === 'true'));

    let storedMembership: any = null;
    let storedPin: string | null = null;
    let upsertCalls = 0;
    let principalVerifyMode: 'invalid' | 'server_error' | 'verified' = 'invalid';
    const validatePinCalls: Array<{ pin: string; excludePatientId?: string; options?: { checkUniqueness?: boolean } }> =
      [];

    originals.getPatientPhilHealthCoverage = clinicService.getPatientPhilHealthCoverage;
    originals.validatePhilHealthPin = clinicService.validatePhilHealthPin;
    originals.upsertPatientPhilHealthMembership = clinicService.upsertPatientPhilHealthMembership;
    originals.checkPatientDuplicates = clinicService.checkPatientDuplicates;

    clinicService.checkPatientDuplicates = async () => [{ hasDuplicates: false, matches: [] } as any, null];
    clinicService.getPatientPhilHealthCoverage = async (patientId: string) => [
      {
        patientId,
        philHealthNumber: storedPin,
        membership: storedMembership,
        enlistments: [],
        fpeStatus: { isCompleted: false, effectiveYear: 2026 },
        submissions: [],
      } as any,
      null,
    ];
    clinicService.validatePhilHealthPin = async (
      pin: string,
      excludePatientId?: string,
      options?: { checkUniqueness?: boolean }
    ) => {
      validatePinCalls.push({ pin, excludePatientId, options });
      if (pin === '12-345678912-3') {
        if (principalVerifyMode === 'invalid') {
          return [
            {
              isValid: false,
              formattedPin: pin,
              isSequenceValid: true,
              isPhilHealthVerified: false,
              isServerError: false,
              failureReason: 'PIN not found in PhilHealth records.',
            } as any,
            null,
          ];
        }
        if (principalVerifyMode === 'server_error') {
          return [
            {
              isValid: false,
              formattedPin: pin,
              isSequenceValid: true,
              isPhilHealthVerified: false,
              isServerError: true,
              failureReason: 'PhilHealth verification service is unavailable.',
            } as any,
            null,
          ];
        }
        return [
          {
            isValid: true,
            formattedPin: pin,
            isSequenceValid: true,
            isPhilHealthVerified: true,
            isServerError: false,
            memberName: 'DONITO, ELENA',
          } as any,
          null,
        ];
      }
      return [
        {
          isValid: true,
          formattedPin: pin,
          isSequenceValid: true,
          isPhilHealthVerified: true,
          isServerError: false,
          memberName: 'DONITO, MARCO',
        } as any,
        null,
      ];
    };
    clinicService.upsertPatientPhilHealthMembership = async (patientId: string, payload: any) => {
      upsertCalls += 1;
      storedPin = payload.philHealthPin;
      storedMembership = {
        patientId,
        memberType: payload.memberType,
        dependentRelationship: payload.dependentRelationship,
        philHealthPin: payload.philHealthPin,
        principalMemberPin: payload.principalMemberPin,
        principalLastName: payload.principalLastName,
        principalFirstName: payload.principalFirstName,
        principalDateOfBirth: payload.principalDateOfBirth,
      };
      return [storedMembership, null];
    };

    await withMountedDom(
      React.createElement(PhilHealthCoverageModal, {
        visible: true,
        onClose: () => {},
        patient: {
          id: 'pat-dep-required-1',
          patientCode: 'PAT-DEP',
          firstName: 'Marco',
          lastName: 'Donito',
          fullName: 'Marco Donito',
          dateOfBirth: '2016-05-01',
          age: 10,
          sex: 'Male',
        } as any,
      }),
      async ({ container }) => {
        const pinContainer = () => container.querySelector('[data-testid="coverage-patient-pin-input"]');
        const pinInput = pinContainer()?.querySelector?.('input') ?? pinContainer();
        const verifyBtn = () => container.querySelector('[data-testid="verify-pin-btn"]');
        const saveStep1Btn = () => container.querySelector('[data-testid="save-step1-membership-btn"]');
        const standingBtn = () => container.querySelector('[data-testid="check-yakap-standing-btn"]');
        const dependentHint = () => container.querySelector('[data-testid="dependent-required-hint"]');

        // Enter & verify Patient PIN first
        await React.act(async () => {
          pinInput.__onChangeText('12-345678901-8');
          await flushMicrotasks();
        });
        await React.act(async () => {
          clickNode(verifyBtn());
          await flushMicrotasks();
        });
        expect(isBtnDisabled(saveStep1Btn())).toBe(false);

        // Switch Membership Type to Dependent (DD)
        const depSegment = container
          .querySelectorAll('button')
          .find((b: any) => collectText(b).includes('Dependent (DD)'));
        expect(depSegment).toBeDefined();
        await React.act(async () => {
          clickNode(depSegment);
          await flushMicrotasks();
        });

        // Required Principal PIN is empty/unverified -> Save/Continue stays hidden and Step 2 stays locked
        const principalPinContainer = () => container.querySelector('[data-testid="coverage-principal-pin-input"]');
        const verifyPrincipalBtn = () => container.querySelector('[data-testid="verify-principal-pin-btn"]');
        expect(container.querySelector('[data-testid="principal-sponsor-card"]')).not.toBeNull();
        expect(verifyPrincipalBtn()).not.toBeNull();
        expect(saveStep1Btn()).toBeNull();
        expect(standingBtn()).toBeNull();

        // Fill Principal Member PIN, First Name, Last Name, and valid past DOB, but same PIN as patient -> must block
        const principalPinInput = principalPinContainer()?.querySelector?.('input') ?? principalPinContainer();
        const principalLastInput = container.querySelector('[data-testid="coverage-principal-last-name-input"]');
        const principalFirstInput = container.querySelector('[data-testid="coverage-principal-first-name-input"]');
        const principalDobInput = container.querySelector('[data-testid="coverage-principal-dob-input-input"]');

        await React.act(async () => {
          principalPinInput.__onChangeText('12-345678901-8');
          principalLastInput.__onChangeText('Donito');
          principalFirstInput.__onChangeText('Elena');
          principalDobInput.__onChangeText('1980-04-15');
          await flushMicrotasks();
        });
        expect(collectText(principalPinContainer())).toContain(
          'Principal Member PIN cannot be the same as the Patient PhilHealth PIN.'
        );
        expect(isBtnDisabled(verifyPrincipalBtn())).toBe(true);
        expect(saveStep1Btn()).toBeNull();

        // Distinct Principal Member PIN waits for PhilHealth legitimacy verification
        await React.act(async () => {
          principalPinInput.__onChangeText('12-345678912-3');
          await flushMicrotasks();
        });
        expect(collectText(principalPinContainer())).toContain('Click Verify PIN to confirm in PhilHealth records.');
        expect(saveStep1Btn()).toBeNull();

        // Principal PIN fails PhilHealth DB check -> shows error & keeps Continue hidden
        await React.act(async () => {
          clickNode(verifyPrincipalBtn());
          await flushMicrotasks();
        });
        expect(collectText(principalPinContainer())).toContain('PIN not found in PhilHealth records.');
        expect(saveStep1Btn()).toBeNull();

        // Principal PIN verification server error -> allows Defer PIN Verification & Continue
        principalVerifyMode = 'server_error';
        await React.act(async () => {
          clickNode(verifyPrincipalBtn());
          await flushMicrotasks();
        });
        expect(collectText(principalPinContainer())).toContain('PhilHealth verification service is unavailable.');
        expect(collectText(saveStep1Btn())).toBe('Defer PIN Verification & Continue');
        expect(isBtnDisabled(saveStep1Btn())).toBe(false);

        // Principal PIN passes PhilHealth DB check (with checkUniqueness: false)
        principalVerifyMode = 'verified';
        await React.act(async () => {
          clickNode(verifyPrincipalBtn());
          await flushMicrotasks();
        });
        expect(collectText(principalPinContainer())).toContain('Verified with PhilHealth (DONITO, ELENA)');
        expect(validatePinCalls[validatePinCalls.length - 1]).toEqual({
          pin: '12-345678912-3',
          excludePatientId: undefined,
          options: { checkUniqueness: false },
        });
        expect(collectText(saveStep1Btn())).toBe('Save Membership & Continue');

        // Future Principal DOB still blocks Save/Continue even after PIN verification
        await React.act(async () => {
          principalDobInput.__onChangeText('2099-01-01');
          await flushMicrotasks();
        });
        expect(dependentHint()).not.toBeNull();
        expect(isBtnDisabled(saveStep1Btn())).toBe(true);
        expect(collectText(container)).toContain('Future date not permitted');
        await React.act(async () => {
          clickNode(saveStep1Btn());
          await flushMicrotasks();
        });
        expect(upsertCalls).toBe(0);

        // Provide valid past Principal DOB -> button enables and Step 1 saves cleanly + unlocks Step 2
        await React.act(async () => {
          principalDobInput.__onChangeText('1980-04-15');
          await flushMicrotasks();
        });
        expect(dependentHint()).toBeNull();
        expect(isBtnDisabled(saveStep1Btn())).toBe(false);

        await React.act(async () => {
          clickNode(saveStep1Btn());
          await flushMicrotasks();
        });
        expect(upsertCalls).toBe(1);
        expect(storedMembership?.memberType).toBe('DD');
        expect(storedMembership?.principalFirstName).toBe('Elena');
        expect(storedMembership?.principalDateOfBirth).toBe('1980-04-15');
        expect(standingBtn()).not.toBeNull();
      }
    );
  });

  test('8. PhilHealthCoverageModal detects non-unique Patient PhilHealth PIN within clinic and blocks saving', async () => {
    let remoteValidateCalls = 0;
    let upsertCalls = 0;

    originals.getPatientPhilHealthCoverage = clinicService.getPatientPhilHealthCoverage;
    originals.validatePhilHealthPin = clinicService.validatePhilHealthPin;
    originals.upsertPatientPhilHealthMembership = clinicService.upsertPatientPhilHealthMembership;
    originals.checkPatientDuplicates = clinicService.checkPatientDuplicates;

    clinicService.getPatientPhilHealthCoverage = async (patientId: string) => [
      {
        patientId,
        philHealthNumber: null,
        membership: null,
        enlistments: [],
        fpeStatus: { isCompleted: false, effectiveYear: 2026 },
        submissions: [],
      } as any,
      null,
    ];
    clinicService.checkPatientDuplicates = async (params: any) => {
      if ((params?.philHealthNumber || '').replace(/\D/g, '') === '123456789018') {
        return [
          {
            hasDuplicates: true,
            matches: [
              {
                patientId: 'pat-other-99',
                patientCode: 'PAT-0099',
                fullName: 'Juan Dela Cruz',
                philHealthNumber: '12-345678901-8',
              },
            ],
          } as any,
          null,
        ];
      }
      return [{ hasDuplicates: false, matches: [] } as any, null];
    };
    clinicService.validatePhilHealthPin = async (pin: string) => {
      remoteValidateCalls += 1;
      if (pin.replace(/\D/g, '') === '123456789123') {
        return [
          {
            isValid: false,
            formattedPin: pin,
            isSequenceValid: true,
            isUniqueInClinic: false,
            isPhilHealthVerified: false,
            isServerError: false,
            conflictingPatientName: 'Maria Santos',
            conflictingPatientCode: 'PAT-0102',
            reason: 'PhilHealth PIN is already assigned to another patient: Maria Santos (PAT-0102).',
          } as any,
          null,
        ];
      }
      return [null, { message: 'timeout of 15000ms exceeded', status: 504 } as any];
    };
    clinicService.upsertPatientPhilHealthMembership = async () => {
      upsertCalls += 1;
      return [null, { message: 'Should not save duplicate PIN' } as any];
    };

    await withMountedDom(
      React.createElement(PhilHealthCoverageModal, {
        visible: true,
        onClose: () => {},
        patient: {
          id: 'pat-unique-check-1',
          patientCode: 'PAT-UNIQ',
          firstName: 'Marco',
          lastName: 'Donito',
          fullName: 'Marco Donito',
          dateOfBirth: '1999-05-01',
          age: 27,
          sex: 'Male',
        } as any,
      }),
      async ({ container }) => {
        const pinContainer = () => container.querySelector('[data-testid="coverage-patient-pin-input"]');
        const pinInput = () => pinContainer()?.querySelector?.('input') ?? pinContainer();
        const verifyBtn = () => container.querySelector('[data-testid="verify-pin-btn"]');
        const saveStep1Btn = () => container.querySelector('[data-testid="save-step1-membership-btn"]');
        const standingBtn = () => container.querySelector('[data-testid="check-yakap-standing-btn"]');

        // Case A: Local duplicate match rejects immediately before PhilHealth gateway call
        await React.act(async () => {
          pinInput().__onChangeText('12-345678901-8');
          await flushMicrotasks();
        });
        await React.act(async () => {
          clickNode(verifyBtn());
          await flushMicrotasks();
        });
        expect(remoteValidateCalls).toBe(0);
        expect(collectText(pinContainer())).toContain(
          'PhilHealth PIN is already assigned to another patient: Juan Dela Cruz (PAT-0099).'
        );
        expect(saveStep1Btn()).toBeNull();
        expect(standingBtn()).toBeNull();

        // Case B: Server-side PinValidationResult flags non-unique PIN in clinic
        await React.act(async () => {
          pinInput().__onChangeText('12-345678912-3');
          await flushMicrotasks();
        });
        await React.act(async () => {
          clickNode(verifyBtn());
          await flushMicrotasks();
        });
        expect(remoteValidateCalls).toBe(1);
        expect(collectText(pinContainer())).toContain(
          'PhilHealth PIN is already assigned to another patient: Maria Santos (PAT-0102).'
        );
        expect(saveStep1Btn()).toBeNull();
        expect(upsertCalls).toBe(0);
      }
    );
  });

  test('9. PhilHealthCoverageModal emits clear Connection URL error instead of raw Request failed with status code 404', async () => {
    const errorNotifications: string[] = [];
    const { notify } = await import('../utils/feedback');
    const origNotifyError = notify.error;
    notify.error = (msg: string) => {
      errorNotifications.push(msg);
    };

    originals.getPatientPhilHealthCoverage = clinicService.getPatientPhilHealthCoverage;
    originals.validatePatientYakapStanding = clinicService.validatePatientYakapStanding;
    originals.checkPatientDuplicates = clinicService.checkPatientDuplicates;

    clinicService.checkPatientDuplicates = async () => [{ hasDuplicates: false, matches: [] } as any, null];
    clinicService.getPatientPhilHealthCoverage = async (patientId: string) => [
      {
        patientId,
        philHealthNumber: '12-345678901-8',
        membership: {
          patientId,
          memberType: 'MM',
          philHealthPin: '12-345678901-8',
        },
        enlistments: [],
        fpeStatus: { isCompleted: false, effectiveYear: 2026 },
        submissions: [],
      } as any,
      null,
    ];
    clinicService.validatePatientYakapStanding = async () => [
      null,
      { message: 'Request failed with status code 404', status: 404 } as any,
    ];

    try {
      // Case A: Clinic settings returned from server with null Connection URLs -> emits clear URL error before request
      (globalThis as any).__mockClinicContext = {
        facilityName: 'Nextstep OPD',
        accreditationNumber: 'P10038831',
        settings: {
          isPhilHealthConfigured: true,
          philHealthBaseUrl: null,
          branchPhilHealthBaseUrl: null,
        },
      };

      await withMountedDom(
        React.createElement(PhilHealthCoverageModal, {
          visible: true,
          onClose: () => {},
          patient: {
            id: 'pat-missing-url-1',
            patientCode: 'PAT-URL1',
            firstName: 'Marco',
            lastName: 'Donito',
            fullName: 'Marco Donito',
            dateOfBirth: '2001-01-01',
            age: 25,
            sex: 'Male',
          } as any,
        }),
        async ({ container }) => {
          const standingBtn = () => container.querySelector('[data-testid="check-yakap-standing-btn"]');
          await React.act(async () => {
            clickNode(standingBtn());
            await flushMicrotasks();
          });
        }
      );

      expect(errorNotifications.some((m) => m.includes('PhilHealth Connection URL is not configured'))).toBe(true);
      expect(errorNotifications.some((m) => m.includes('Request failed with status code 404'))).toBe(false);

      // Case B: Connection URL is set, but server returns raw HTTP 404 -> translates cleanly
      errorNotifications.length = 0;
      (globalThis as any).__mockClinicContext = {
        facilityName: 'Nextstep OPD',
        accreditationNumber: 'P10038831',
        settings: {
          isPhilHealthConfigured: true,
          philHealthBaseUrl: 'https://pcapi.philhealth.gov.ph',
          branchPhilHealthBaseUrl: null,
        },
      };

      await withMountedDom(
        React.createElement(PhilHealthCoverageModal, {
          visible: true,
          onClose: () => {},
          patient: {
            id: 'pat-missing-url-2',
            patientCode: 'PAT-URL2',
            firstName: 'Marco',
            lastName: 'Donito',
            fullName: 'Marco Donito',
            dateOfBirth: '2001-01-01',
            age: 25,
            sex: 'Male',
          } as any,
        }),
        async ({ container }) => {
          const standingBtn = () => container.querySelector('[data-testid="check-yakap-standing-btn"]');
          await React.act(async () => {
            clickNode(standingBtn());
            await flushMicrotasks();
          });
        }
      );

      expect(
        errorNotifications.some((m) => m.includes('PhilHealth server endpoint returned 404 (Not Found)'))
      ).toBe(true);
      expect(errorNotifications.some((m) => m.includes('Request failed with status code 404'))).toBe(false);
    } finally {
      notify.error = origNotifyError;
    }
  });
});
