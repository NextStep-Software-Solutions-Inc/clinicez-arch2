import { describe, expect, test, mock, beforeEach, afterEach, afterAll } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import fs from 'fs';
import path from 'path';

(globalThis as any).__DEV__ = true;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// Lightweight virtual DOM for react-dom/client interactive testing without happy-dom
class MiniNode {
  nodeType: number;
  tagName: string;
  nodeName: string;
  parentNode: MiniNode | null = null;
  childNodes: MiniNode[] = [];
  attrs: Record<string, any> = {};
  style: Record<string, any> = {};
  dataset: Record<string, string> = {};
  listeners: Record<string, Set<Function>> = {};
  value: string = '';
  nodeValue: string = '';
  ownerDocument: any = null;

  constructor(nodeType: number, tagName: string, text = '', ownerDocument: any = null) {
    this.nodeType = nodeType;
    this.tagName = tagName.toUpperCase();
    this.nodeName = nodeType === 3 ? '#text' : nodeType === 8 ? '#comment' : this.tagName;
    this.nodeValue = text;
    this.ownerDocument = ownerDocument;
  }

  get children(): MiniNode[] {
    return this.childNodes.filter((c) => c.nodeType === 1);
  }

  get firstChild(): MiniNode | null {
    return this.childNodes[0] ?? null;
  }

  get firstElementChild(): MiniNode | null {
    return this.children[0] ?? null;
  }

  get lastElementChild(): MiniNode | null {
    const ch = this.children;
    return ch[ch.length - 1] ?? null;
  }

  get nextSibling(): MiniNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 ? this.parentNode.childNodes[idx + 1] ?? null : null;
  }

  get textContent(): string {
    if (this.nodeType === 3) return this.nodeValue;
    if (this.nodeType === 8) return '';
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(val: string) {
    this.childNodes = [];
    if (val) {
      this.appendChild(new MiniNode(3, '', String(val), this.ownerDocument));
    }
  }

  appendChild(child: MiniNode): MiniNode {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(newNode: MiniNode, refNode: MiniNode | null): MiniNode {
    if (!refNode) return this.appendChild(newNode);
    if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
    const idx = this.childNodes.indexOf(refNode);
    newNode.parentNode = this;
    newNode.ownerDocument = this.ownerDocument;
    if (idx === -1) this.childNodes.push(newNode);
    else this.childNodes.splice(idx, 0, newNode);
    return newNode;
  }

  removeChild(child: MiniNode): MiniNode {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  setAttribute(name: string, val: any) {
    this.attrs[name] = String(val);
    if (name === 'value') this.value = String(val);
    if (name.startsWith('data-')) {
      const camel = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[camel] = String(val);
    }
  }

  removeAttribute(name: string) {
    delete this.attrs[name];
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  addEventListener(type: string, fn: Function) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(fn);
  }

  removeEventListener(type: string, fn: Function) {
    this.listeners[type]?.delete(fn);
  }

  dispatchEvent(evt: any): boolean {
    const eventObj = {
      ...evt,
      target: evt.target ?? this,
      currentTarget: this,
      stopPropagation: () => {},
      preventDefault: () => {},
    };
    const set = this.listeners[evt.type];
    if (set) {
      for (const fn of Array.from(set)) {
        fn(eventObj);
      }
    }
    if (evt.bubbles !== false && this.parentNode) {
      this.parentNode.dispatchEvent({ ...eventObj, currentTarget: this.parentNode });
    } else if (evt.bubbles !== false && this.ownerDocument && this.parentNode === null) {
      this.ownerDocument.dispatchEvent(eventObj);
    }
    return true;
  }

  querySelector(selector: string): MiniNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): MiniNode[] {
    const out: MiniNode[] = [];
    const attrMatch = selector.match(/^\[([^=\]]+)=["']?([^"'\]]+)["']?\]$/);
    const visit = (node: MiniNode) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          if (attrMatch) {
            if (child.getAttribute(attrMatch[1]) === attrMatch[2]) out.push(child);
          } else if (child.tagName.toLowerCase() === selector.toLowerCase()) {
            out.push(child);
          }
          visit(child);
        }
      }
    };
    visit(this);
    return out;
  }
}

function createMiniDom() {
  const docListeners: Record<string, Set<Function>> = {};
  const doc: any = {
    nodeType: 9,
    nodeName: '#document',
    activeElement: null,
    body: null as any,
    documentElement: null as any,
    addEventListener(type: string, fn: Function) {
      if (!docListeners[type]) docListeners[type] = new Set();
      docListeners[type].add(fn);
    },
    removeEventListener(type: string, fn: Function) {
      docListeners[type]?.delete(fn);
    },
    dispatchEvent(evt: any) {
      const set = docListeners[evt.type];
      if (set) {
        for (const fn of Array.from(set)) fn(evt);
      }
      return true;
    },
    createElement(tag: string) {
      return new MiniNode(1, tag, '', doc);
    },
    createTextNode(text: string) {
      return new MiniNode(3, '', text, doc);
    },
    createComment(text: string) {
      return new MiniNode(8, '', text, doc);
    },
    querySelectorAll(selector: string) {
      return doc.body.querySelectorAll(selector);
    },
    querySelector(selector: string) {
      return doc.body.querySelector(selector);
    },
  };
  doc.documentElement = new MiniNode(1, 'html', '', doc);
  doc.body = new MiniNode(1, 'body', '', doc);
  doc.documentElement.appendChild(doc.body);
  return doc;
}

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    placeholder,
    testID,
    onPress,
    onChangeText,
    value,
    disabled,
  }: any) => {
    const tag = name === 'TextInput' ? 'input' : name === 'Pressable' ? 'button' : 'div';
    return React.createElement(
      tag,
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { placeholder } : {}),
        ...(disabled ? { disabled: true } : {}),
        ...(onPress && !disabled ? { onClick: onPress } : {}),
        ...(tag === 'input'
          ? {
              value: value ?? '',
              ref: (el: any) => {
                if (el) el._onChangeText = onChangeText;
              },
              onChange: (e: any) => onChangeText?.(e?.target?.value ?? ''),
            }
          : {}),
      },
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  Image: createMockComponent('Image'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
  Switch: createMockComponent('Switch'),
  RefreshControl: createMockComponent('RefreshControl'),
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
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
    timing: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
    sequence: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
    loop: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
    spring: () => ({ start: (cb?: any) => cb && cb(), stop: () => {} }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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

mock.module('../utils/useBreakpoint', () => ({
  useBreakpoint: () => ({
    width: 1280,
    height: 800,
    isCompact: false,
    isWorkstation: true,
    isDesktop: true,
    isWide: false,
  }),
}));

mock.module('../utils/usePhilHealthCatalog', () => ({
  usePhilHealthCatalog: (lib: string) => {
    if (lib === 'lib_mdiseases') {
      return {
        items: [
          { code: '01', description: 'Hypertension' },
          { code: '02', description: 'Diabetes Mellitus' },
        ],
        loading: false,
        error: null,
        reload: () => {},
      };
    }
    return { items: [], loading: false, error: null, reload: () => {} };
  },
}));

mock.module('../hooks/useEhrOptions', () => ({
  useEhrOptions: (setCode: string) => {
    if (setCode === 'dependent_relationship') {
      return {
        options: [
          { code: 'C', philHealthCode: 'C', label: 'Child' },
          { code: 'S', philHealthCode: 'S', label: 'Spouse' },
          { code: 'P', philHealthCode: 'P', label: 'Parent' },
        ],
        loading: false,
        error: null,
        reload: () => {},
      };
    }
    if (setCode === 'cvd_risk_level') {
      return {
        options: [
          { code: 'BandA', philHealthCode: 'BandA', label: 'Low Risk (<10%)' },
          { code: 'BandB', philHealthCode: 'BandB', label: 'Moderate Risk (10% to <20%)' },
        ],
        loading: false,
        error: null,
        reload: () => {},
      };
    }
    if (setCode === 'pe_general_survey') {
      return {
        options: [{ code: '1', philHealthCode: '1', label: 'Awake and alert' }],
        loading: false,
        error: null,
        reload: () => {},
      };
    }
    return { options: [], loading: false, error: null, reload: () => {} };
  },
}));

mock.module('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: () => {},
    setParams: () => {},
    goBack: () => {},
  }),
  useFocusEffect: () => {},
  useRoute: () => ({ key: 'Patients', name: 'Patients', params: undefined }),
  DefaultTheme: { colors: {} },
  createStaticNavigation: () => () => null,
}));

mock.module('expo-document-picker', () => ({
  getDocumentAsync: async () => ({ canceled: true, assets: [] }),
}));

const MockResponsiveLayout = ({ children, headerTitle, actions, rightAction }: any) =>
  React.createElement(
    'div',
    { 'data-component': 'ResponsiveLayout' },
    headerTitle ? React.createElement('div', null, headerTitle) : null,
    actions?.map((a: any, i: number) =>
      React.createElement('button', { key: i, onClick: a.onPress }, a.label)
    ),
    rightAction,
    children
  );
const mockResponsiveLayout = () => ({
  default: MockResponsiveLayout,
  ResponsiveLayout: MockResponsiveLayout,
  ClinicHeaderBar: createMockComponent('ClinicHeaderBar'),
  WorkstationSidebar: createMockComponent('WorkstationSidebar'),
  WORKSTATION_NAV_ITEMS: [],
  UserMenu: createMockComponent('UserMenu'),
  MobileBottomTabBar: createMockComponent('MobileBottomTabBar'),
  SidebarProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
  useSidebar: () => ({ mode: 'expanded', setMode: () => {}, isOpen: false, setIsOpen: () => {} }),
});
mock.module('../components/layout', mockResponsiveLayout);
mock.module('@layout', mockResponsiveLayout);

mock.module('../utils/useSafeInsets', () => ({
  useSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

mock.module('../services/offlineSyncService', () => ({
  offlineSyncService: {
    subscribe: () => () => {},
    getPendingCount: () => 0,
    getFailedCount: () => 0,
  },
}));

mock.module('../services/outboxPolicy', () => ({
  shouldQueueOffline: () => false,
}));

const previousClinicContext = (globalThis as any).__mockClinicContext;
const previousAuthContext = (globalThis as any).__mockAuthContext;
const previousStaffContext = (globalThis as any).__mockStaffContext;

const { clinicService } = await import('../services/clinicService');
const { default: PhilHealthCoverageModal } = await import('../components/patient/PhilHealthCoverageModal');
const { default: HealthScreeningModal } = await import('../components/screening/HealthScreeningModal');
const { default: EncountersTimelineTab } = await import('../components/chart/EncountersTimelineTab');
const { buildPatientOverflowMenuItems } = await import('../components/patient/PatientDirectoryCard');
const { default: PatientsScreen } = await import('../navigation/screens/Patients.screen');

const sampleAdultFemale: any = {
  id: 'pat-female-1',
  patientCode: 'PAT-2026-001',
  firstName: 'Maria',
  lastName: 'Santos',
  fullName: 'Maria Santos',
  dateOfBirth: '1995-05-15',
  age: 31,
  sex: 'Female',
  philHealthNumber: '12-345678901-9',
  guardians: [
    {
      id: 'g-1',
      firstName: 'Roberto',
      lastName: 'Santos',
      relationship: 'Parent',
      philHealthPin: '11-223344556-7',
      dateOfBirth: '1965-03-10',
      isPrimaryGuardian: true,
    },
  ],
};

const sampleAdultMaleNoPin: any = {
  id: 'pat-male-1',
  patientCode: 'PAT-2026-002',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  fullName: 'Juan Dela Cruz',
  dateOfBirth: '1991-01-20',
  age: 35,
  sex: 'Male',
  philHealthNumber: null,
};

const samplePediatric: any = {
  id: 'pat-peds-1',
  patientCode: 'PAT-2026-003',
  firstName: 'Leo',
  lastName: 'Reyes',
  fullName: 'Leo Reyes',
  dateOfBirth: '2016-06-01',
  age: 10,
  sex: 'Male',
  philHealthNumber: null,
};

async function flushMicrotasks(rounds = 24) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

async function withMountedDom(
  element: React.ReactElement,
  fn: (ctx: { container: MiniNode; doc: any; rerender: (next: React.ReactElement) => Promise<void> }) => Promise<void>
) {
  const originalDoc = (globalThis as any).document;
  const originalWin = (globalThis as any).window;
  const doc = createMiniDom();
  const win: any = {
    document: doc,
    event: undefined,
    navigator: { userAgent: 'bun-test' },
    location: { pathname: '/', search: '' },
    HTMLElement: MiniNode,
    HTMLInputElement: MiniNode,
    HTMLButtonElement: MiniNode,
    HTMLIFrameElement: class HTMLIFrameElement {},
    Element: MiniNode,
    Node: MiniNode,
    SVGElement: MiniNode,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  doc.defaultView = win;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const root = createRoot(container);

  const rerender = async (next: React.ReactElement) => {
    await React.act(async () => {
      root.render(next);
      await flushMicrotasks();
    });
  };

  try {
    await rerender(element);
    await fn({ container, doc, rerender });
  } finally {
    await React.act(async () => {
      root.unmount();
      await flushMicrotasks();
    });
    (globalThis as any).document = originalDoc;
    (globalThis as any).window = originalWin;
  }
}

function findByTestId(root: MiniNode, id: string): MiniNode | null {
  return root.querySelector(`[data-testid="${id}"]`);
}

function clickNode(node: MiniNode | null) {
  if (!node) throw new Error('Expected node to exist before clicking');
  node.dispatchEvent({ type: 'click', bubbles: true });
}

function changeInput(node: MiniNode | undefined | null, text: string) {
  if (!node) throw new Error('Expected input node to exist');
  node.value = text;
  if (typeof (node as any)._onChangeText === 'function') {
    (node as any)._onChangeText(text);
  } else {
    node.dispatchEvent({ type: 'input', bubbles: true });
  }
}

describe('Health Screening & PhilHealth Info Decoupled Workflow', () => {
  const originalMethods: Record<string, any> = {};
  let callLog: Record<string, any[]>;

  beforeEach(() => {
    callLog = {
      ensureDirectVisit: [],
      checkInPatient: [],
      recordTriage: [],
      updateTriage: [],
      saveHealthScreeningProgress: [],
      completeHealthScreening: [],
      escalateHealthScreening: [],
      createPatientYakapEnlistment: [],
      upsertPatientPhilHealthMembership: [],
      updatePatientPhysicalExam: [],
      getPatientHealthScreenings: [],
    };

    (globalThis as any).__mockClinicContext = {
      facilityName: 'NextStep Family Clinic',
      planTier: 'pro',
      accreditationNumber: 'ACC-987654',
      settings: {
        isPhilHealthConfigured: true,
        allowNurseMidwifeYakapFpeFacilitator: false,
        defaultHealthScreeningServiceCode: 'HEALTH-SCREEN',
      },
    };
    (globalThis as any).__mockAuthContext = {
      can: () => true,
    };
    (globalThis as any).__mockStaffContext = {
      current: { id: 'doc-1', role: 'Doctor', firstName: 'Jose', lastName: 'Rizal' },
      currentName: 'Dr. Jose Rizal',
    };

    const stubs: Record<string, any> = {
      getPatientPhilHealthCoverage: async (patientId: string) => [
        {
          patientId,
          philHealthNumber: '12-345678901-9',
          membership: {
            patientId,
            memberType: 'MM',
            philHealthPin: '12-345678901-9',
          },
          enlistments: [
            {
              id: 'enl-1',
              patientId,
              effectiveYear: 2026,
              status: 'Enlisted',
              source: 'WalkIn',
              packageType: 'Yakap',
              enlistmentDate: '2026-01-10',
              caseNo: 'CASE-2026-01',
              enlistmentTransNo: 'ETR-2026-01',
            },
          ],
          currentYearFpeStatus: {
            effectiveYear: 2026,
            hasActiveEnlistment: true,
            enlistmentId: 'enl-1',
            isCompleted: false,
            profilingDate: null,
            profilingTransNo: null,
            profilingAtc: null,
          },
        },
        null,
      ],
      validatePhilHealthPin: async (pin: string) => [{ valid: pin.replace(/\D/g, '').length === 12, message: 'Valid PIN (Mod-11)' }, null],
      upsertPatientPhilHealthMembership: async (patientId: string, payload: any) => {
        callLog.upsertPatientPhilHealthMembership.push({ patientId, payload });
        return [{ patientId, ...payload }, null];
      },
      createPatientYakapEnlistment: async (patientId: string, payload: any) => {
        callLog.createPatientYakapEnlistment.push({ patientId, payload });
        return [{ id: 'enl-new', patientId, status: 'Enlisted', ...payload }, null];
      },
      getPatientChart: async (patientId: string) => [
        {
          patientId,
          patientName: 'Test Patient',
          allergies: [],
          medicalHistory: [],
          familyHistory: [],
          immunizations: [],
          vitalsHistory: [],
          consultations: [],
          labOrders: [],
          procedures: [],
          healthScreenings: [],
          socialHistory: null,
          reproductiveHistory: null,
          latestNcdAssessment: null,
        },
        null,
      ],
      getPatientHealthScreenings: async (patientId: string, queueItemId?: string) => {
        callLog.getPatientHealthScreenings.push({ patientId, queueItemId });
        return [[], null];
      },
      getPatients: async () => [[], null],
      getPatientCounts: async () => [
        { all: 0, myPatients: 0, students: 0, employees: 0, alerts: 0, seniorPwd: 0 },
        null,
      ],
      getCustomFields: async () => [[], null],
      getHealthScreeningById: async () => [null, null],
      getPatientPhysicalExam: async () => [null, null],
      getTriage: async () => [null, null],
      getLabOrders: async () => [[], null],
      getServices: async () => [[], null],
      ensureDirectVisit: async (payload: any) => {
        callLog.ensureDirectVisit.push(payload);
        return [{ id: 'q-dv-1', queueNumber: 'DV-001', status: 'Triaged', ...payload }, null];
      },
      checkInPatient: async (payload: any) => {
        callLog.checkInPatient.push(payload);
        return [{ id: 'q-chk-1' }, null];
      },
      recordTriage: async (queueItemId: string, payload: any) => {
        callLog.recordTriage.push({ queueItemId, payload });
        return [{ id: 'vit-1', queueItemId, patientId: 'pat-female-1', ...payload }, null];
      },
      updateTriage: async (queueItemId: string, payload: any) => {
        callLog.updateTriage.push({ queueItemId, payload });
        return [{ id: 'vit-1', queueItemId, ...payload }, null];
      },
      updatePatientPhysicalExam: async (patientId: string, payload: any) => {
        callLog.updatePatientPhysicalExam.push({ patientId, payload });
        return [{ id: 'pe-1', patientId, ...payload }, null];
      },
      saveNcdRiskAssessment: async (patientId: string, payload: any) => [
        { id: 'ncd-1', patientId, riskBand: payload.riskBand || 'BandA', ...payload },
        null,
      ],
      updateNcdRiskAssessment: async (patientId: string, id: string, payload: any) => [
        { id, patientId, riskBand: payload.riskBand || 'BandA', ...payload },
        null,
      ],
      saveHealthScreeningProgress: async (payload: any) => {
        callLog.saveHealthScreeningProgress.push(payload);
        return [
          {
            id: payload.screeningId || 'hs-1',
            patientId: payload.patientId,
            queueItemId: payload.queueItemId || 'q-dv-1',
            screeningType: payload.screeningType,
            workflowMode: payload.workflowMode,
            status: payload.sendToDoctor ? 'AwaitingDoctor' : 'InProgress',
            screeningDateUtc: '2026-11-20T03:00:00Z',
          },
          null,
        ];
      },
      completeHealthScreening: async (id: string, payload: any) => {
        callLog.completeHealthScreening.push({ id, payload });
        return [
          {
            id,
            patientId: 'pat-female-1',
            queueItemId: 'q-dv-1',
            screeningType: 'YakapFpe',
            workflowMode: 'YakapAvailment',
            status: 'Completed',
            disposition: payload.disposition,
            profilingTransNo: 'PACC98765420260001',
            screeningDateUtc: '2026-11-20T03:00:00Z',
            completedAtUtc: '2026-11-20T03:15:00Z',
          },
          null,
        ];
      },
      escalateHealthScreening: async (id: string, payload: any) => {
        callLog.escalateHealthScreening.push({ id, payload });
        return [
          {
            id,
            patientId: 'pat-female-1',
            queueItemId: 'q-dv-1',
            screeningType: 'AnnualPhysicalExam',
            workflowMode: 'Regular',
            status: 'EscalatedToConsultation',
            disposition: 'EscalatedToConsultation',
            screeningDateUtc: '2026-11-20T03:00:00Z',
          },
          null,
        ];
      },
    };

    for (const [key, fn] of Object.entries(stubs)) {
      originalMethods[key] = (clinicService as any)[key];
      (clinicService as any)[key] = fn;
    }
  });

  afterEach(() => {
    for (const [key, fn] of Object.entries(originalMethods)) {
      (clinicService as any)[key] = fn;
    }
  });

  afterAll(() => {
    if (previousClinicContext !== undefined) (globalThis as any).__mockClinicContext = previousClinicContext;
    else delete (globalThis as any).__mockClinicContext;
    if (previousAuthContext !== undefined) (globalThis as any).__mockAuthContext = previousAuthContext;
    else delete (globalThis as any).__mockAuthContext;
    if (previousStaffContext !== undefined) (globalThis as any).__mockStaffContext = previousStaffContext;
    else delete (globalThis as any).__mockStaffContext;
  });

  // =========================================================================
  // Suite 1: PhilHealthCoverageModal (Administrative Coverage & Enlistment)
  // =========================================================================
  describe('Suite 1: PhilHealthCoverageModal (Administrative Dialog)', () => {
    test('1.1 Dormant visible=false or patient=null returns empty markup', () => {
      expect(
        renderToStaticMarkup(
          React.createElement(PhilHealthCoverageModal, {
            visible: false,
            patient: sampleAdultFemale,
            onClose: () => {},
          })
        )
      ).toBe('');
      expect(
        renderToStaticMarkup(
          React.createElement(PhilHealthCoverageModal, {
            visible: true,
            patient: null,
            onClose: () => {},
          })
        )
      ).toBe('');
    });

    test('1.2 Renders PIN verification, Dependent (DD) sponsor + Use Legal Guardian copy, enlistment renewal, and YAKAP shortcut with ZERO visit writes', async () => {
      let yakapLaunchedPatient: any = null;
      let closedCount = 0;

      await withMountedDom(
        React.createElement(PhilHealthCoverageModal, {
          visible: true,
          patient: sampleAdultFemale,
          onClose: () => {
            closedCount++;
          },
          onStartYakapScreening: (p) => {
            yakapLaunchedPatient = p;
          },
        }),
        async ({ container }) => {
          expect(container.textContent).toContain('PhilHealth Info & YAKAP Enlistment');
          expect(container.textContent).toContain('Member (MM)');
          expect(container.textContent).toContain('Dependent (DD)');
          expect(findByTestId(container, 'yakap-fpe-status-banner')).not.toBeNull();

          // Verify PIN button runs validation without creating any visit
          await React.act(async () => {
            clickNode(findByTestId(container, 'verify-pin-btn'));
            await flushMicrotasks();
          });

          // Toggle to Dependent (DD) -> reveals Principal Sponsor Card & Use Legal Guardian button
          const ddButton = container
            .querySelectorAll('button')
            .find((b) => b.textContent.includes('Dependent (DD)'));
          expect(ddButton).toBeDefined();
          await React.act(async () => {
            clickNode(ddButton!);
            await flushMicrotasks();
          });

          expect(findByTestId(container, 'principal-sponsor-card')).not.toBeNull();
          expect(container.textContent).toContain('Child');
          expect(container.textContent).toContain('Spouse');

          // Click "Use Legal Guardian"
          await React.act(async () => {
            clickNode(findByTestId(container, 'use-legal-guardian-btn'));
            await flushMicrotasks();
          });
          const principalPinWrapper = findByTestId(container, 'coverage-principal-pin-input');
          const principalPinInput = principalPinWrapper?.querySelector('input') ?? principalPinWrapper;
          expect(principalPinInput?.value || principalPinInput?.getAttribute('value')).toBe('11-223344556-7');

          // Open Add / Renew Enlistment sub-modal and confirm
          await React.act(async () => {
            clickNode(findByTestId(container, 'add-renew-enlistment-btn'));
            await flushMicrotasks();
          });
          expect(findByTestId(container, 'yakap-enlistment-renewal-modal')).not.toBeNull();

          await React.act(async () => {
            clickNode(findByTestId(container, 'confirm-enlistment-btn'));
            await flushMicrotasks();
          });
          expect(callLog.createPatientYakapEnlistment.length).toBe(1);

          // Click "Start YAKAP Health Screening" -> closes dialog and calls onStartYakapScreening
          await React.act(async () => {
            clickNode(findByTestId(container, 'start-yakap-screening-btn'));
            await flushMicrotasks();
          });
          expect(closedCount).toBeGreaterThanOrEqual(1);
          expect(yakapLaunchedPatient?.id).toBe(sampleAdultFemale.id);

          // Zero clinical visit or screening writes
          expect(callLog.ensureDirectVisit.length).toBe(0);
          expect(callLog.checkInPatient.length).toBe(0);
          expect(callLog.saveHealthScreeningProgress.length).toBe(0);
        }
      );
    });
  });

  // =========================================================================
  // Suite 2: HealthScreeningModal (4-Station Pipeline & Gating)
  // =========================================================================
  describe('Suite 2: HealthScreeningModal (4-Station Pipeline & Gating)', () => {
    test('2.1 Renders for non-accredited clinic & patient without PIN with ZERO writes on open and cancel', async () => {
      (globalThis as any).__mockClinicContext = {
        facilityName: 'Private Cash Clinic',
        accreditationNumber: '',
        settings: { isPhilHealthConfigured: false },
      };

      await withMountedDom(
        React.createElement(HealthScreeningModal, {
          visible: true,
          patient: sampleAdultMaleNoPin,
          onClose: () => {},
        }),
        async ({ container, rerender }) => {
          expect(container.textContent).toContain('Health Screening & Preventive Assessment');
          expect(container.textContent).toContain('Juan Dela Cruz');
          expect(container.textContent).toContain('Direct Visit — creates on save');

          // Navigate across stations 2, 3, 4 without saving
          for (const step of [2, 3, 4]) {
            await React.act(async () => {
              clickNode(findByTestId(container, `screening-step-${step}`));
              await flushMicrotasks();
            });
          }

          // Cancel/close modal
          await rerender(
            React.createElement(HealthScreeningModal, {
              visible: false,
              patient: sampleAdultMaleNoPin,
              onClose: () => {},
            })
          );

          expect(callLog.ensureDirectVisit.length).toBe(0);
          expect(callLog.recordTriage.length).toBe(0);
          expect(callLog.saveHealthScreeningProgress.length).toBe(0);
          expect(callLog.completeHealthScreening.length).toBe(0);
          expect(callLog.escalateHealthScreening.length).toBe(0);
        }
      );
    });

    test('2.2 Cohort-adaptive gating for Male Adult, Female Adult, and Pediatric (age 10)', async () => {
      // Male adult (age 35): reproductive hidden, PhilPEN visible
      await withMountedDom(
        React.createElement(HealthScreeningModal, {
          visible: true,
          patient: sampleAdultMaleNoPin,
          onClose: () => {},
        }),
        async ({ container }) => {
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-step-2'));
            await flushMicrotasks();
          });
          expect(findByTestId(container, 'screening-reproductive-section')).toBeNull();
          expect(findByTestId(container, 'screening-philpen-section')).not.toBeNull();
        }
      );

      // Female adult (age 31): both reproductive and PhilPEN visible
      await withMountedDom(
        React.createElement(HealthScreeningModal, {
          visible: true,
          patient: sampleAdultFemale,
          onClose: () => {},
        }),
        async ({ container }) => {
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-step-2'));
            await flushMicrotasks();
          });
          expect(findByTestId(container, 'screening-reproductive-section')).not.toBeNull();
          expect(findByTestId(container, 'screening-philpen-section')).not.toBeNull();
        }
      );

      // Pediatric (age 10): both reproductive and PhilPEN hidden
      await withMountedDom(
        React.createElement(HealthScreeningModal, {
          visible: true,
          patient: samplePediatric,
          onClose: () => {},
        }),
        async ({ container }) => {
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-step-2'));
            await flushMicrotasks();
          });
          expect(findByTestId(container, 'screening-reproductive-section')).toBeNull();
          expect(findByTestId(container, 'screening-philpen-section')).toBeNull();
        }
      );
    });

    test('2.3 Auto-jumps to Station 3 when resuming AwaitingDoctor screening', async () => {
      (clinicService as any).getHealthScreeningById = async (id: string) => [
        {
          id,
          patientId: sampleAdultFemale.id,
          queueItemId: 'q-await-1',
          screeningType: 'AnnualPhysicalExam',
          workflowMode: 'Regular',
          status: 'AwaitingDoctor',
          screeningDateUtc: '2026-11-20T02:00:00Z',
          vitals: { id: 'vit-99', systolicBp: 120, diastolicBp: 80 },
        },
        null,
      ];

      await withMountedDom(
        React.createElement(HealthScreeningModal, {
          visible: true,
          patient: sampleAdultFemale,
          queueItemId: 'q-await-1',
          initialScreeningId: 'hs-await-1',
          onClose: () => {},
        }),
        async ({ container }) => {
          expect(findByTestId(container, 'screening-station-3')).not.toBeNull();
          expect(findByTestId(container, 'nurse-handoff-summary-card')).not.toBeNull();
          expect(container.textContent).toContain('Awaiting Doctor PE');
        }
      );
    });

    test('2.4 Red-flag vitals detection renders banner and escalates preserving queueItemId', async () => {
      let escalatedPayload: any = null;
      await withMountedDom(
        React.createElement(HealthScreeningModal, {
          visible: true,
          patient: sampleAdultFemale,
          queueItemId: 'q-existing-rf',
          onClose: () => {},
          onEscalateToConsultation: (p) => {
            escalatedPayload = p;
          },
        }),
        async ({ container }) => {
          const inputs = container.querySelectorAll('input');
          const sysInput = inputs.find((el) => el.getAttribute('placeholder')?.includes('120'));
          expect(sysInput).toBeDefined();
          await React.act(async () => {
            changeInput(sysInput, '190');
            await flushMicrotasks();
          });

          expect(findByTestId(container, 'screening-red-flag-banner')).not.toBeNull();

          await React.act(async () => {
            clickNode(findByTestId(container, 'red-flag-escalate-btn'));
            await flushMicrotasks();
          });

          expect(callLog.escalateHealthScreening.length).toBe(1);
          expect(escalatedPayload?.queueItemId).toBe('q-existing-rf');
        }
      );
    });

    test('2.5 Role authority matrix & YAKAP FPE readiness checklist (Nurse vs Physician)', async () => {
      // Nurse without facilitator enabled: routes APE to physician, cannot self-complete APE
      (globalThis as any).__mockAuthContext = {
        can: (perm: string) => perm === 'triage:write' || perm === 'patients:write',
      };
      (globalThis as any).__mockStaffContext = {
        current: { id: 'nurse-1', role: 'Nurse', firstName: 'Clara', lastName: 'Barton' },
        currentName: 'Nurse Clara Barton',
      };

      await withMountedDom(
        React.createElement(HealthScreeningModal, {
          visible: true,
          patient: sampleAdultFemale,
          initialTrack: 'Regular',
          onClose: () => {},
        }),
        async ({ container }) => {
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-step-4'));
            await flushMicrotasks();
          });
          expect(findByTestId(container, 'authority-notice-banner')).not.toBeNull();
          expect(findByTestId(container, 'screening-route-physician-btn')).not.toBeNull();
        }
      );

      // Nurse with allowNurseMidwifeYakapFpeFacilitator=true: can complete YakapFpe with facilitatorType="H"
      (globalThis as any).__mockClinicContext = {
        ...((globalThis as any).__mockClinicContext || {}),
        settings: {
          isPhilHealthConfigured: true,
          allowNurseMidwifeYakapFpeFacilitator: true,
        },
      };
      await withMountedDom(
        React.createElement(HealthScreeningModal, {
          visible: true,
          patient: sampleAdultFemale,
          initialTrack: 'YakapAvailment',
          onClose: () => {},
        }),
        async ({ container }) => {
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-step-4'));
            await flushMicrotasks();
          });
          expect(findByTestId(container, 'yakap-readiness-checklist')).not.toBeNull();
          expect(findByTestId(container, 'screening-complete-btn')).not.toBeNull();
        }
      );

      // Physician (consultations:sign): completes YakapFpe & renders completion banner
      (globalThis as any).__mockAuthContext = {
        can: () => true,
      };
      (globalThis as any).__mockStaffContext = {
        current: { id: 'doc-1', role: 'Doctor', firstName: 'Jose', lastName: 'Rizal' },
        currentName: 'Dr. Jose Rizal',
      };
      await withMountedDom(
        React.createElement(HealthScreeningModal, {
          visible: true,
          patient: sampleAdultFemale,
          initialTrack: 'YakapAvailment',
          onClose: () => {},
        }),
        async ({ container }) => {
          // Record BP in Station 1
          const sysInput = container
            .querySelectorAll('input')
            .find((el) => el.getAttribute('placeholder')?.includes('120'));
          await React.act(async () => {
            changeInput(sysInput, '120');
            await flushMicrotasks();
          });

          // Mark Walk-In in YAKAP strip
          const walkInBtn = container
            .querySelectorAll('button')
            .find((b) => b.textContent.includes('Walk-In'));
          if (walkInBtn) {
            await React.act(async () => {
              clickNode(walkInBtn);
              await flushMicrotasks();
            });
          }

          // Station 3 -> All Essentially Normal
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-step-3'));
            await flushMicrotasks();
          });
          await React.act(async () => {
            clickNode(findByTestId(container, 'all-essentially-normal-btn'));
            await flushMicrotasks();
          });

          // Station 4 -> Complete & Sign Off
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-step-4'));
            await flushMicrotasks();
          });
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-complete-btn'));
            await flushMicrotasks();
          });

          expect(callLog.completeHealthScreening.length).toBe(1);
          expect(findByTestId(container, 'screening-completed-banner')).not.toBeNull();
          expect(findByTestId(container, 'screening-issue-medcert-btn')).not.toBeNull();
        }
      );
    });

    test('2.6 Cross-patient state reset on patient switch drops prior patient notes/ATC', async () => {
      await withMountedDom(
        React.createElement(HealthScreeningModal, {
          visible: true,
          patient: sampleAdultFemale,
          initialTrack: 'YakapAvailment',
          onClose: () => {},
        }),
        async ({ container, rerender }) => {
          const atcInput = container
            .querySelectorAll('input')
            .find((el) => el.getAttribute('placeholder')?.toLowerCase().includes('atc'));
          if (atcInput) {
            await React.act(async () => {
              changeInput(atcInput, 'ATC-PATIENT-A');
              await flushMicrotasks();
            });
          }

          await rerender(
            React.createElement(HealthScreeningModal, {
              visible: true,
              patient: sampleAdultMaleNoPin,
              initialTrack: 'Regular',
              onClose: () => {},
            })
          );

          expect(container.textContent).toContain('Juan Dela Cruz');
          expect(container.textContent).not.toContain('ATC-PATIENT-A');
        }
      );
    });
  });

  // =========================================================================
  // Suite 3: Billing.screen.tsx SOA Auto-Attach & YAKAP ₱0.00
  // =========================================================================
  describe('Suite 3: Billing.screen.tsx SOA Auto-Attach & YAKAP ₱0.00', () => {
    const billingSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Billing.screen.tsx'),
      'utf8'
    );

    test('3.1 Regular Health Screening auto-attaches configurable HEALTH-SCREEN item & ordered labs without charging false consultation fee', () => {
      expect(billingSource).toContain("p.visitType !== 'PreventiveHealthAssessment'");
      expect(billingSource).toContain('clinicService.getPatientHealthScreenings(p.patientId, p.queueItemId)');
      expect(billingSource).toContain("visitScreening && visitScreening.workflowMode === 'Regular'");
      expect(billingSource).toContain('effectiveSettings?.defaultHealthScreeningServiceItemId');
      expect(billingSource).toContain("effectiveSettings?.defaultHealthScreeningServiceCode || 'HEALTH-SCREEN'");
      expect(billingSource).toContain('id: `screening-${visitScreening.id}`');
      expect(billingSource).toContain('id: `lab-${labItem.id');
    });

    test('3.2 YAKAP FPE displays ₱0.00 covered notice, attaches zero-peso YAKAP-FPE item, and supports optional co-payment', () => {
      expect(billingSource).toContain('PhilHealth YAKAP FPE Covered (₱0.00)');
      expect(billingSource).toContain("code: 'YAKAP-FPE'");
      expect(billingSource).toContain("code: 'YAKAP-COPAY'");
      expect(billingSource).toContain('upsertYakapCoPaymentLineItem');
      expect(billingSource).toContain('activeYakapEnlistment?.hasCoPayment');
    });
  });

  // =========================================================================
  // Suite 4: Dashboard.screen.tsx & Queue.screen.tsx Operational Surfaces
  // =========================================================================
  describe('Suite 4: Dashboard.screen.tsx & Queue.screen.tsx Operational Surfaces', () => {
    const dashboardSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx'),
      'utf8'
    );
    const queueSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Queue.screen.tsx'),
      'utf8'
    );

    test('4.1 Both Dashboard & Queue hydrate active PreventiveHealthAssessment screenings, display Awaiting Doctor PE pill, and mount HealthScreeningModal outside ScrollView', () => {
      for (const src of [dashboardSource, queueSource]) {
        expect(src).toContain("visitType === 'PreventiveHealthAssessment'");
        expect(src).toContain('clinicService.getPatientHealthScreenings(item.patientId, item.id)');
        expect(src).toContain('Promise.allSettled');
        expect(src).toContain('screeningHydrationSeqRef');
        expect(src).toContain('label="Awaiting Doctor PE"');
        expect(src).toContain('title="Health screening"');
        expect(src).toContain('icon="heartPulse"');
        expect(src).toContain('<HealthScreeningModal');
        expect(src).toContain('initialScreeningId={screeningInitialId}');

        // Modal mounted outside </ScrollView>
        const scrollEndIdx = src.lastIndexOf('</ScrollView>');
        const modalIdx = src.lastIndexOf('<HealthScreeningModal');
        expect(scrollEndIdx).toBeGreaterThan(-1);
        expect(modalIdx).toBeGreaterThan(scrollEndIdx);
      }

      // Queue.screen.tsx action bar wraps cleanly for mobile/tablet parity
      expect(queueSource).toMatch(/ticketActionsRow:\s*\{[\s\S]*?flexWrap:\s*'wrap'/);
    });
  });

  // =========================================================================
  // Suite 5: EncountersTimelineTab.tsx Screening Timeline
  // =========================================================================
  describe('Suite 5: EncountersTimelineTab.tsx Screening Timeline', () => {
    const timelineSource = fs.readFileSync(
      path.resolve(__dirname, '../components/chart/EncountersTimelineTab.tsx'),
      'utf8'
    );

    test('5.1 Renders APE & YAKAP FPE health screenings chronologically with disposition, vitals/risk summary, and ProfilingTransNo', () => {
      const screenings: any[] = [
        {
          id: 'hs-ape-1',
          patientId: sampleAdultFemale.id,
          queueItemId: 'q-ape-1',
          patientVitalsId: 'vit-ape-1',
          ncdRiskAssessmentId: 'ncd-ape-1',
          screeningType: 'AnnualPhysicalExam',
          workflowMode: 'Regular',
          status: 'Completed',
          disposition: 'Cleared',
          screeningDateUtc: '2026-11-18T02:00:00Z',
          completedAtUtc: '2026-11-18T02:30:00Z',
          screenedByNurseName: 'Nurse Clara',
          examinedByDoctorName: 'Dr. Jose Rizal',
          clinicalImpression: 'Healthy adult clearance',
        },
        {
          id: 'hs-yakap-1',
          patientId: sampleAdultFemale.id,
          queueItemId: 'q-ykp-1',
          screeningType: 'YakapFpe',
          workflowMode: 'YakapAvailment',
          status: 'Completed',
          disposition: 'ClearedWithAdvice',
          screeningDateUtc: '2026-11-20T01:00:00Z',
          completedAtUtc: '2026-11-20T01:45:00Z',
          profilingTransNo: 'PACC98765420260007',
          philHealthAtc: 'ATC-2026-88',
        },
      ];

      const vitalsHistory: any[] = [
        {
          id: 'vit-ape-1',
          queueItemId: 'q-ape-1',
          systolicBp: 118,
          diastolicBp: 76,
          heartRateBpm: 72,
          bmi: 21.8,
        },
      ];

      const latestNcdAssessment: any = {
        id: 'ncd-ape-1',
        riskBand: 'BandA',
        calculatedRiskScorePercent: 4,
      };

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: sampleAdultFemale,
          patientId: sampleAdultFemale.id,
          consultations: [],
          healthScreenings: screenings,
          vitalsHistory,
          latestNcdAssessment,
        })
      );

      expect(markup).toContain('APE');
      expect(markup).toContain('Cleared');
      expect(markup).toContain('BP 118/76');
      expect(markup).toContain('WHO/ISH Risk: BandA (4%)');
      expect(markup).toContain('YAKAP FPE');
      expect(markup).toContain('Cleared w/ Advice');
      expect(markup).toContain('PACC98765420260007');
      expect(markup).toContain('ATC-2026-88');
      expect(markup).not.toContain('No encounters found');
    });

    test('5.2 Preserves Challenger 4.1 invariant (no icon="activity" or icon="yakap") and skips fallback fetch when healthScreenings prop is passed', async () => {
      expect(timelineSource).not.toContain('icon="activity"');
      expect(timelineSource).not.toContain('icon="yakap"');

      await withMountedDom(
        React.createElement(EncountersTimelineTab, {
          patient: sampleAdultFemale,
          patientId: sampleAdultFemale.id,
          consultations: [],
          healthScreenings: [],
        }),
        async () => {
          expect(callLog.getPatientHealthScreenings.length).toBe(0);
        }
      );

      await withMountedDom(
        React.createElement(EncountersTimelineTab, {
          patient: sampleAdultFemale,
          patientId: sampleAdultFemale.id,
          consultations: [],
        }),
        async () => {
          expect(callLog.getPatientHealthScreenings.length).toBe(1);
        }
      );
    });

    test('5.3 Two-pass FK-first vitals matching prioritizes hs.patientVitalsId over an earlier queueItemId-only match', () => {
      const screenings: any[] = [
        {
          id: 'hs-multi-vit',
          patientId: sampleAdultFemale.id,
          queueItemId: 'q-dup',
          patientVitalsId: 'vit-2',
          screeningType: 'AnnualPhysicalExam',
          workflowMode: 'Regular',
          status: 'Completed',
          disposition: 'Cleared',
          screeningDateUtc: '2026-11-20T02:00:00Z',
          completedAtUtc: '2026-11-20T02:30:00Z',
        },
      ];
      const vitalsHistory: any[] = [
        {
          id: 'vit-1',
          queueItemId: 'q-dup',
          systolicBp: 150,
          diastolicBp: 95,
        },
        {
          id: 'vit-2',
          queueItemId: 'q-dup',
          systolicBp: 118,
          diastolicBp: 76,
        },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(EncountersTimelineTab, {
          patient: sampleAdultFemale,
          patientId: sampleAdultFemale.id,
          consultations: [],
          healthScreenings: screenings,
          vitalsHistory,
        })
      );

      expect(markup).toContain('BP 118/76');
      expect(markup).not.toContain('BP 150/95');
    });
  });

  // =========================================================================
  // Suite 6: Directory Card, Patients Screen & ServiceCheckInModal Decoupling
  // =========================================================================
  describe('Suite 6: Directory Card, Patients Screen & ServiceCheckInModal Decoupling', () => {
    test('6.1 PatientDirectoryCard separates PhilHealth info (shield) and Health screening (heartPulse) without accreditation/PIN gate', () => {
      const items = buildPatientOverflowMenuItems(sampleAdultMaleNoPin, {
        hasPhilHealthAccreditation: false,
        onOpenPhilHealth: () => {},
        onStartHealthScreening: () => {},
      });

      const phItem = items.find((i) => i.id === 'philhealth-profile');
      const hsItem = items.find((i) => i.id === 'start-profiling');

      expect(phItem?.label).toBe('PhilHealth info');
      expect(phItem?.icon).toBe('shield');
      expect(hsItem?.label).toBe('Health screening');
      expect(hsItem?.icon).toBe('heartPulse');
    });

    test('6.2 Patients.screen.tsx and ServiceCheckInModal.tsx wire decoupled modals and updated screening hint with zero legacy modal references', () => {
      const patientsSource = fs.readFileSync(
        path.resolve(__dirname, '../navigation/screens/Patients.screen.tsx'),
        'utf8'
      );
      const checkInSource = fs.readFileSync(
        path.resolve(__dirname, '../components/patient/ServiceCheckInModal.tsx'),
        'utf8'
      );

      const legacyModalName = 'PhilHealth' + 'ProfileModal';
      expect(patientsSource).toContain('<PhilHealthCoverageModal');
      expect(patientsSource).toContain('<HealthScreeningModal');
      expect(patientsSource).toContain("resolveActiveVisitForAction(patient, 'Health Screening'");
      expect(patientsSource).not.toContain(legacyModalName);

      expect(checkInSource).toContain(
        'Health screening, APE, pre-employment, PhilHealth YAKAP FPE, or vitals monitoring'
      );
    });

    test('6.3 PatientsScreen HealthScreeningModal.onSuccess retains active Triaged ticket on AwaitingDoctor and prunes terminal Completed/Cancelled tickets', async () => {
      let getPatientsCalls = 0;
      const patientDirectoryItem: any = {
        ...sampleAdultMaleNoPin,
        id: 'pat-dir-hs',
        fullName: 'Juan Dela Cruz',
        patientCode: 'PAT-HS-01',
        contactNumber: '09170000011',
        activeQueueTicket: undefined,
        activeQueueTickets: [],
      };

      (clinicService as any).getPatients = async () => {
        getPatientsCalls++;
        return [[patientDirectoryItem], null];
      };
      (clinicService as any).getPatientCounts = async () => [
        { all: 1, myPatients: 0, students: 0, employees: 0, alerts: 0, seniorPwd: 0 },
        null,
      ];
      let activeScreeningQueueItemId = 'q-dv-await';
      (clinicService as any).saveHealthScreeningProgress = async (payload: any) => {
        callLog.saveHealthScreeningProgress.push(payload);
        activeScreeningQueueItemId = payload.queueItemId || activeScreeningQueueItemId;
        return [
          {
            id: payload.screeningId || 'hs-dir-1',
            patientId: payload.patientId,
            queueItemId: activeScreeningQueueItemId,
            queueNumber: 'DV-101',
            screeningType: payload.screeningType,
            workflowMode: payload.workflowMode,
            status: payload.sendToDoctor ? 'AwaitingDoctor' : 'InProgress',
            screeningDateUtc: '2026-11-20T03:00:00Z',
          },
          null,
        ];
      };
      (clinicService as any).completeHealthScreening = async (id: string, payload: any) => {
        callLog.completeHealthScreening.push({ id, payload });
        return [
          {
            id,
            patientId: 'pat-dir-hs',
            queueItemId: activeScreeningQueueItemId,
            queueNumber: 'DV-101',
            screeningType: 'RoutineWellness',
            workflowMode: 'Regular',
            status: 'Completed',
            disposition: payload.disposition,
            screeningDateUtc: '2026-11-20T03:00:00Z',
            completedAtUtc: '2026-11-20T03:20:00Z',
          },
          null,
        ];
      };

      await withMountedDom(
        React.createElement(PatientsScreen, { route: { params: undefined } as any }),
        async ({ container }) => {
          expect(container.textContent).toContain('Juan Dela Cruz');
          expect(getPatientsCalls).toBe(1);

          // 1. Open overflow menu -> Health screening (zero writes on open)
          const moreBtn = container.querySelector('[aria-label="More actions for Juan Dela Cruz"]');
          expect(moreBtn).not.toBeNull();
          await React.act(async () => {
            clickNode(moreBtn);
            await flushMicrotasks();
          });

          const hsMenuBtn = container.querySelector('[aria-label="Health screening"]');
          expect(hsMenuBtn).not.toBeNull();
          await React.act(async () => {
            clickNode(hsMenuBtn!);
            await flushMicrotasks();
          });

          expect(findByTestId(container, 'health-screening-modal')).not.toBeNull();
          expect(container.textContent).toContain('Direct Visit — creates on save');

          // 2. Navigate to Station 2 and Save & Send to Doctor (status = AwaitingDoctor)
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-step-2'));
            await flushMicrotasks();
          });
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-send-to-doctor-btn'));
            await flushMicrotasks();
          });

          // Active Triaged ticket added in-place without refetch
          expect(container.textContent).toContain('Queued (DV-101)');
          expect(getPatientsCalls).toBe(1);

          // 3. Re-open Health screening -> resolveActiveVisitForAction binds to active q-dv-await (not Direct Visit)
          const closeBtn = container
            .querySelectorAll('button')
            .find((b) => b.textContent === 'Cancel');
          if (closeBtn) {
            await React.act(async () => {
              clickNode(closeBtn);
              await flushMicrotasks();
            });
          }
          await React.act(async () => {
            clickNode(container.querySelector('[aria-label="More actions for Juan Dela Cruz"]'));
            await flushMicrotasks();
          });
          const hsMenuBtn2 = container.querySelector('[aria-label="Health screening"]');
          expect(hsMenuBtn2).not.toBeNull();
          await React.act(async () => {
            clickNode(hsMenuBtn2!);
            await flushMicrotasks();
          });
          expect(findByTestId(container, 'health-screening-modal')).not.toBeNull();
          expect(container.textContent).not.toContain('Direct Visit — creates on save');

          // 4. Complete Station 4 (Routine Wellness -> status = Completed)
          const sysInput = container
            .querySelectorAll('input')
            .find((el) => el.getAttribute('placeholder')?.includes('120'));
          if (sysInput) {
            await React.act(async () => {
              changeInput(sysInput, '118');
              await flushMicrotasks();
            });
          }
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-step-4'));
            await flushMicrotasks();
          });
          await React.act(async () => {
            clickNode(findByTestId(container, 'screening-complete-btn'));
            await flushMicrotasks();
          });

          expect(findByTestId(container, 'screening-completed-banner')).not.toBeNull();
          // Terminal Completed screening pruned DV-101 from activeQueueTickets & activeQueueTicket
          expect(container.textContent).not.toContain('Queued (DV-101)');
          expect(getPatientsCalls).toBe(1);

          // 5. Close modal and trigger Health screening again -> must NOT bind to closed q-dv-await
          const doneBtn = container
            .querySelectorAll('button')
            .find((b) => b.textContent === 'Done' || b.textContent === 'Close');
          expect(doneBtn).toBeDefined();
          await React.act(async () => {
            clickNode(doneBtn!);
            await flushMicrotasks();
          });
          await React.act(async () => {
            clickNode(container.querySelector('[aria-label="More actions for Juan Dela Cruz"]'));
            await flushMicrotasks();
          });
          const hsMenuBtn3 = container.querySelector('[aria-label="Health screening"]');
          expect(hsMenuBtn3).not.toBeNull();
          await React.act(async () => {
            clickNode(hsMenuBtn3!);
            await flushMicrotasks();
          });
          expect(container.textContent).toContain('Direct Visit — creates on save');
        }
      );
    });

    test('6.4 PatientsScreen PhilHealthCoverageModal.onSaved clears stale PIN badge in-place when philHealthNumber becomes null', async () => {
      let getPatientsCalls = 0;
      let storedPin: string | null = '12-345678901-9';
      const patientWithPin: any = {
        ...sampleAdultFemale,
        id: 'pat-clear-pin',
        fullName: 'Ana Clear',
        patientCode: 'PAT-CLR-01',
        contactNumber: '09170000009',
        philHealthNumber: '12-345678901-9',
        activeQueueTickets: [],
      };

      (clinicService as any).getPatients = async () => {
        getPatientsCalls++;
        return [[patientWithPin], null];
      };
      (clinicService as any).getPatientCounts = async () => [
        { all: 1, myPatients: 0, students: 0, employees: 0, alerts: 0, seniorPwd: 0 },
        null,
      ];
      (clinicService as any).getPatientPhilHealthCoverage = async (patientId: string) => [
        {
          patientId,
          philHealthNumber: storedPin,
          membership: {
            patientId,
            memberType: 'MM',
            philHealthPin: storedPin ?? '',
          },
          enlistments: [],
          currentYearFpeStatus: {
            effectiveYear: 2026,
            hasActiveEnlistment: false,
            isCompleted: false,
          },
        },
        null,
      ];
      (clinicService as any).upsertPatientPhilHealthMembership = async (
        patientId: string,
        payload: any
      ) => {
        storedPin = payload.philHealthPin ? payload.philHealthPin : null;
        return [{ patientId, ...payload }, null];
      };

      await withMountedDom(
        React.createElement(PatientsScreen, { route: { params: undefined } as any }),
        async ({ container }) => {
          expect(container.textContent).toContain('PhilHealth 12-345678901-9');
          expect(getPatientsCalls).toBe(1);

          // Open PhilHealthCoverageModal via PIN badge
          const pinBadgeBtn = container.querySelector(
            '[aria-label="Open PhilHealth profile for Ana Clear"]'
          );
          expect(pinBadgeBtn).not.toBeNull();
          await React.act(async () => {
            clickNode(pinBadgeBtn);
            await flushMicrotasks();
          });

          expect(findByTestId(container, 'philhealth-coverage-modal')).not.toBeNull();

          // Clear PIN input and click Save Coverage
          const pinWrapper = findByTestId(container, 'coverage-patient-pin-input');
          const pinInput = pinWrapper?.querySelector('input') ?? pinWrapper;
          await React.act(async () => {
            changeInput(pinInput, '');
            await flushMicrotasks();
          });
          await React.act(async () => {
            clickNode(findByTestId(container, 'philhealth-save-coverage-btn'));
            await flushMicrotasks();
          });

          expect(storedPin).toBeNull();
          expect(container.textContent).not.toContain('PhilHealth 12-345678901-9');
          expect(getPatientsCalls).toBe(1);
        }
      );
    });
  });

  // =========================================================================
  // Suite 7: Design-Token & Zero Raw Literal Compliance
  // =========================================================================
  describe('Suite 7: Design-Token & Zero Raw Literal Compliance', () => {
    const hexRegex = new RegExp('#(?:[0-9a-fA-F]{3}){1,2}\\b', 'g');
    const rgbRegex = new RegExp('\\brgba?\\(', 'i');
    const numericFontSizeRegex = new RegExp('fontSize:\\s*\\d+');
    const numericRadiusRegex = new RegExp('(?<!shadow)Radius:\\s*[1-9]\\d*');
    const emojiRegex = new RegExp('[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}]', 'u');

    const targetFiles = [
      '../components/patient/PhilHealthCoverageModal.tsx',
      '../components/screening/HealthScreeningModal.tsx',
      '../components/settings/PhilHealthSettingsTab.tsx',
      '../components/settings/GeneralSettingsTab.tsx',
      '../components/patient/PatientDirectoryCard.tsx',
      '../navigation/screens/Patients.screen.tsx',
      '../navigation/screens/Dashboard.screen.tsx',
      '../navigation/screens/Queue.screen.tsx',
      '../components/patient/ServiceCheckInModal.tsx',
      '../navigation/screens/Billing.screen.tsx',
      '../components/chart/EncountersTimelineTab.tsx',
    ];

    for (const relPath of targetFiles) {
      test(`7.x ${path.basename(relPath)} complies with @clinicez/design-tokens (zero raw hex/rgba/numeric fontSize/Radius/emoji)`, () => {
        const content = fs.readFileSync(path.resolve(__dirname, relPath), 'utf8');
        expect(content.match(hexRegex) || []).toEqual([]);
        expect(rgbRegex.test(content)).toBe(false);
        expect(numericFontSizeRegex.test(content)).toBe(false);
        expect(numericRadiusRegex.test(content)).toBe(false);
        expect(emojiRegex.test(content)).toBe(false);
      });
    }
  });
});
