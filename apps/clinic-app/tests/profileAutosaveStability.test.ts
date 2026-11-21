// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import type {
  ClinicPatient,
  NcdRiskAssessment,
  PatientReproductiveHistory,
  PatientSocialHistory,
} from '../services/clinicService';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({ children, ...props }: any) =>
    React.createElement('div', { 'data-component': name, ...props }, children);
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
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
  Alert: { alert: () => {} },
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
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
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Easing: { linear: (t: number) => t, inOut: () => (t: number) => t, ease: (t: number) => t },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
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
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  default: 'Svg',
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'staff-1', name: 'Dr. Wave Ambray', role: 'Doctor' },
    state: 'authenticated',
    permissions: ['patients:read', 'patients:write'],
  }),
  usePermission: () => true,
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    current: { id: 'staff-1', name: 'Dr. Wave Ambray', role: 'Doctor' },
    currentName: 'Dr. Wave Ambray',
  }),
}));

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    dateFormat: 'MM/DD/YYYY',
    timeFormat: '12h',
    timeZoneId: 'Asia/Manila',
  }),
}));

mock.module('../hooks/useEhrOptions', () => ({
  useEhrOptions: (category: string) => {
    if (category === 'physical_activity') {
      return {
        loading: false,
        options: [
          { code: 'SEDENTARY', label: 'Sedentary (<30 mins/week)' },
          { code: 'MODERATE', label: 'Moderate Activity (≥150 mins/week)' },
        ],
      };
    }
    if (category === 'dietary_intake') {
      return {
        loading: false,
        options: [{ code: 'BALANCED', label: 'Balanced Diet' }],
      };
    }
    if (category === 'alcohol_type') {
      return {
        loading: false,
        options: [{ code: 'OCCASIONAL', label: 'Occasional / Social' }],
      };
    }
    if (category === 'contraceptive_method') {
      const opts = [
        { code: 'NONE', label: 'None', value: 'None' },
        {
          code: 'OCP',
          label: 'Oral Contraceptive Pills (OCP)',
          value: 'Oral Contraceptive Pills (OCP)',
        },
      ];
      return { loading: false, options: opts, selectOptions: opts };
    }
    if (category === 'delivery_type') {
      const opts = [
        {
          code: 'NSVD',
          label: 'Normal Spontaneous Vaginal',
          value: 'Normal Spontaneous Vaginal',
        },
      ];
      return { loading: false, options: opts, selectOptions: opts };
    }
    return { loading: false, options: [], selectOptions: [] };
  },
}));

const { clinicService } = await import('../services/clinicService');
const { default: CardiometabolicRiskTab } = await import(
  '../components/chart/CardiometabolicRiskTab'
);
const { default: LifestyleSocialTab } = await import('../components/chart/LifestyleSocialTab');
const { default: ReproductiveHealthTab } = await import(
  '../components/chart/ReproductiveHealthTab'
);

let saveNcdCalls = 0;
let updateNcdCalls = 0;
let updateSocialCalls = 0;
let updateReproductiveCalls = 0;

clinicService.getNcdRiskAssessments = async () => [[], null];
clinicService.saveNcdRiskAssessment = async (_patientId: string, payload: any) => {
  saveNcdCalls += 1;
  const created: NcdRiskAssessment = {
    id: 'ncd-session-1',
    clinicId: 'clinic-1',
    patientId: _patientId,
    riskBand: payload.riskBand || 'BandA',
    assessmentDate: payload.assessmentDate || '2026-11-04',
    createdAt: new Date().toISOString(),
    ...payload,
  };
  return [created, null];
};
clinicService.updateNcdRiskAssessment = async (_patientId: string, id: string, payload: any) => {
  updateNcdCalls += 1;
  const updated: NcdRiskAssessment = {
    id,
    clinicId: 'clinic-1',
    patientId: _patientId,
    riskBand: payload.riskBand || 'BandA',
    assessmentDate: payload.assessmentDate || '2026-11-04',
    createdAt: '2026-11-04T01:00:00Z',
    updatedAt: new Date().toISOString(),
    ...payload,
  };
  return [updated, null];
};
clinicService.getSocialHistory = async (_patientId: string) => [null as any, null];
clinicService.updateSocialHistory = async (_patientId: string, payload: any) => {
  updateSocialCalls += 1;
  const updated: PatientSocialHistory = {
    id: 'soc-1',
    clinicId: 'clinic-1',
    patientId: _patientId,
    isSmoker: Boolean(payload.isSmoker),
    isAlcoholDrinker: Boolean(payload.isAlcoholDrinker),
    usesIllicitDrugs: Boolean(payload.usesIllicitDrugs),
    isSexuallyActive: Boolean(payload.isSexuallyActive),
    createdAt: '2026-11-04T01:00:00Z',
    updatedAt: new Date().toISOString(),
    ...payload,
  };
  return [updated, null];
};
clinicService.getReproductiveHistory = async (_patientId: string) => [null as any, null];
clinicService.updateReproductiveHistory = async (_patientId: string, payload: any) => {
  updateReproductiveCalls += 1;
  const updated: PatientReproductiveHistory = {
    id: 'rep-1',
    clinicId: 'clinic-1',
    patientId: _patientId,
    isApplicable: Boolean(payload.isApplicable),
    isMenopausal: Boolean(payload.isMenopausal),
    hadPreEclampsiaHypertension: Boolean(payload.hadPreEclampsiaHypertension),
    receivedFamilyPlanningCounseling: Boolean(payload.receivedFamilyPlanningCounseling),
    createdAt: '2026-11-04T01:00:00Z',
    updatedAt: new Date().toISOString(),
    ...payload,
  };
  return [updated, null];
};

interface MountedTree<P> {
  getTree: () => any;
  setProps: (next: Partial<P>) => void;
  unmount: () => void;
}

function mountWithHooks<P extends object>(
  Component: React.ComponentType<P>,
  initialProps: P
): MountedTree<P> {
  const stateSlots: any[] = [];
  const effectSlots: Array<{ fn: () => any; cleanup?: any; deps?: any[]; changed: boolean }> = [];
  const refSlots: Array<{ current: any }> = [];
  const memoSlots: Array<{ val: any; deps?: any[] }> = [];
  const callbackSlots: Array<{ fn: any; deps?: any[] }> = [];

  let slotIdx = 0;
  let effectIdx = 0;
  let refIdx = 0;
  let memoIdx = 0;
  let callbackIdx = 0;
  let currentProps: P = { ...initialProps };
  let latestTree: any = null;
  let isRendering = false;
  let queuedRender = false;

  const depsChanged = (prevDeps: any[] | undefined, nextDeps: any[] | undefined) => {
    if (!prevDeps || !nextDeps || prevDeps.length !== nextDeps.length) return true;
    return nextDeps.some((d, i) => !Object.is(d, prevDeps[i]));
  };

  const dispatcher = {
    useState: (initial: any) => {
      const idx = slotIdx++;
      if (stateSlots.length <= idx) {
        stateSlots.push(typeof initial === 'function' ? initial() : initial);
      }
      const setter = (updater: any) => {
        const nextVal = typeof updater === 'function' ? updater(stateSlots[idx]) : updater;
        if (!Object.is(stateSlots[idx], nextVal)) {
          stateSlots[idx] = nextVal;
          scheduleRender();
        }
      };
      return [stateSlots[idx], setter];
    },
    useRef: (initial: any) => {
      const idx = refIdx++;
      if (refSlots.length <= idx) {
        refSlots.push({ current: initial });
      }
      return refSlots[idx];
    },
    useMemo: (factory: () => any, deps?: any[]) => {
      const idx = memoIdx++;
      const prev = memoSlots[idx];
      if (!prev || depsChanged(prev.deps, deps)) {
        memoSlots[idx] = { val: factory(), deps };
      }
      return memoSlots[idx].val;
    },
    useCallback: (fn: any, deps?: any[]) => {
      const idx = callbackIdx++;
      const prev = callbackSlots[idx];
      if (!prev || depsChanged(prev.deps, deps)) {
        callbackSlots[idx] = { fn, deps };
      }
      return callbackSlots[idx].fn;
    },
    useEffect: (fn: () => any, deps?: any[]) => {
      const idx = effectIdx++;
      const prev = effectSlots[idx];
      const changed = !prev || depsChanged(prev.deps, deps);
      effectSlots[idx] = { fn, deps, changed, cleanup: prev?.cleanup };
    },
    useContext: (ctx: any) => ctx?._currentValue ?? null,
  };

  function scheduleRender() {
    if (isRendering) {
      queuedRender = true;
      return;
    }
    render();
  }

  function render() {
    do {
      queuedRender = false;
      isRendering = true;
      slotIdx = 0;
      effectIdx = 0;
      refIdx = 0;
      memoIdx = 0;
      callbackIdx = 0;

      const internals = (React as any)
        .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const prevDispatcher = internals ? internals.H : null;
      if (internals) internals.H = dispatcher;
      try {
        latestTree = (Component as any)(currentProps);
      } finally {
        if (internals) internals.H = prevDispatcher;
        isRendering = false;
      }
    } while (queuedRender);

    for (const eff of effectSlots) {
      if (eff.changed) {
        eff.changed = false;
        if (typeof eff.cleanup === 'function') {
          eff.cleanup();
        }
        eff.cleanup = eff.fn();
      }
    }
  }

  render();

  return {
    getTree: () => latestTree,
    setProps: (next: Partial<P>) => {
      currentProps = { ...currentProps, ...next };
      scheduleRender();
    },
    unmount: () => {
      for (const eff of effectSlots) {
        if (typeof eff.cleanup === 'function') {
          eff.cleanup();
          eff.cleanup = undefined;
        }
      }
    },
  };
}

const statelessReadDispatcher = {
  useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useRef: (initial: any) => ({ current: initial }),
  useMemo: (factory: () => any) => factory(),
  useCallback: (fn: any) => fn,
  useEffect: () => {},
  useContext: (ctx: any) => ctx?._currentValue ?? null,
};

function collectText(node: any): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (typeof node === 'object') {
    const labelPart = node.props?.label ? `${node.props.label} ` : '';
    const titlePart = node.props?.title ? `${node.props.title} ` : '';
    if (typeof node.type === 'function') {
      const internals = (React as any)
        .__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const prev = internals ? internals.H : null;
      if (internals) internals.H = statelessReadDispatcher;
      try {
        return `${labelPart}${titlePart}${collectText(node.type(node.props || {}))}`;
      } catch {
        return `${labelPart}${titlePart}${collectText(node.props?.children)}`;
      } finally {
        if (internals) internals.H = prev;
      }
    }
    return `${labelPart}${titlePart}${collectText(node.props?.children)}`;
  }
  return '';
}

function findFirstPressableWithText(node: any, targetText: string): (() => void) | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstPressableWithText(item, targetText);
      if (found) return found;
    }
    return null;
  }
  if (typeof node.props?.onPress === 'function') {
    const text = collectText(node);
    if (text.includes(targetText)) {
      return node.props.onPress;
    }
  }
  const children = node.props?.children;
  if (children) {
    return findFirstPressableWithText(children, targetText);
  }
  return null;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Profile Sub-Tabs Auto-Save Stability (Zero Infinite Oscillation)', () => {
  const baseFemalePatient: ClinicPatient = {
    id: 'pat-female-1',
    name: 'Dela Cruz, Maria',
    age: 34,
    sex: 'Female',
    contact: '09171234567',
  } as ClinicPatient;

  beforeEach(() => {
    saveNcdCalls = 0;
    updateNcdCalls = 0;
    updateSocialCalls = 0;
    updateReproductiveCalls = 0;
  });

  test('1. Static Invariant: Auto-save useEffects depend strictly on [userEditVersion] and never on performAutoSave or onRefreshChart', () => {
    const files = [
      path.resolve(__dirname, '../components/chart/CardiometabolicRiskTab.tsx'),
      path.resolve(__dirname, '../components/chart/LifestyleSocialTab.tsx'),
      path.resolve(__dirname, '../components/chart/ReproductiveHealthTab.tsx'),
    ];

    for (const filePath of files) {
      const src = fs.readFileSync(filePath, 'utf8');
      expect(src).toContain('onRefreshChartRef.current?.()');
      expect(src).toContain('void performAutoSaveRef.current()');
      expect(src).toContain('lastSavedPayloadJsonRef');
      expect(src).toContain('lastSavedEditVersionRef');
      expect(src).toContain('}, [userEditVersion]);');
      expect(src).not.toMatch(/},\s*\[[^\]]*performAutoSave[^\]]*\]\);/);
      expect(src).not.toMatch(/},\s*\[[^\]]*onRefreshChart[^\]]*\]\);/);
    }

    const modalSrc = fs.readFileSync(
      path.resolve(__dirname, '../components/chart/PatientChartModal.tsx'),
      'utf8'
    );
    expect(modalSrc).toContain('const handleRefresh = useCallback(async () => {');
    expect(modalSrc).not.toContain('}, [isRefreshing, onRefreshChart]);');

    const consultSrc = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx'),
      'utf8'
    );
    expect(consultSrc).not.toContain(
      '}, [selectedPatient?.patientId, patientRecord, dentalChart, signedConsultationId]);'
    );
  });

  test('2. CardiometabolicRiskTab: single edit triggers strictly 1 save and never oscillates when onRefreshChart recreates parent props', async () => {
    let refreshCount = 0;
    let harness!: MountedTree<any>;

    const makeUnstableRefresh = () => () => {
      refreshCount += 1;
      // Simulate Consultations.screen / PatientChartModal re-rendering with fresh patient & callback refs
      harness.setProps({
        patient: { ...baseFemalePatient },
        onRefreshChart: makeUnstableRefresh(),
      });
    };

    harness = mountWithHooks(CardiometabolicRiskTab, {
      patient: baseFemalePatient,
      initialLatestAssessment: {
        id: 'ncd-existing-1',
        clinicId: 'clinic-1',
        patientId: baseFemalePatient.id,
        riskBand: 'BandA',
        assessmentDate: new Date().toISOString().split('T')[0],
        eatsProcessedFoodWeekly: false,
        createdAt: new Date().toISOString(),
      } as NcdRiskAssessment,
      onRefreshChart: makeUnstableRefresh(),
    });

    try {
      const yesHandler = findFirstPressableWithText(harness.getTree(), 'Yes');
      expect(yesHandler).not.toBeNull();
      yesHandler!();

      // Wait well past multiple 250ms debounce cycles (1.1s total) to detect any oscillation
      await wait(1100);

      expect(updateNcdCalls + saveNcdCalls).toBe(1);
      expect(refreshCount).toBe(1);

      const renderedText = collectText(harness.getTree());
      expect(renderedText).toContain('All changes saved');
      expect(renderedText).toContain('Last saved ');
      expect(renderedText).not.toContain('Saving changes…');
    } finally {
      harness.unmount();
    }
  });

  test('3. LifestyleSocialTab: single edit triggers strictly 1 save and never oscillates when onRefreshChart recreates parent props', async () => {
    let refreshCount = 0;
    let harness!: MountedTree<any>;

    const makeUnstableRefresh = () => () => {
      refreshCount += 1;
      harness.setProps({
        patient: { ...baseFemalePatient },
        onRefreshChart: makeUnstableRefresh(),
      });
    };

    harness = mountWithHooks(LifestyleSocialTab, {
      patient: baseFemalePatient,
      initialSocialHistory: {
        id: 'soc-existing-1',
        clinicId: 'clinic-1',
        patientId: baseFemalePatient.id,
        isSmoker: false,
        isAlcoholDrinker: false,
        usesIllicitDrugs: false,
        isSexuallyActive: false,
        createdAt: '2026-11-04T01:00:00Z',
      },
      onRefreshChart: makeUnstableRefresh(),
    });

    try {
      const currentSmokerBtn = findFirstPressableWithText(harness.getTree(), 'Current Smoker');
      expect(currentSmokerBtn).not.toBeNull();
      currentSmokerBtn!();

      await wait(1100);

      expect(updateSocialCalls).toBe(1);
      expect(refreshCount).toBe(1);

      const renderedText = collectText(harness.getTree());
      expect(renderedText).toContain('Last saved');
      expect(renderedText).not.toContain('Saving changes…');
    } finally {
      harness.unmount();
    }
  });

  test('4. ReproductiveHealthTab: single edit triggers strictly 1 save and never oscillates when onRefreshChart recreates parent props', async () => {
    let refreshCount = 0;
    let harness!: MountedTree<any>;

    const makeUnstableRefresh = () => () => {
      refreshCount += 1;
      harness.setProps({
        patient: { ...baseFemalePatient },
        onRefreshChart: makeUnstableRefresh(),
      });
    };

    harness = mountWithHooks(ReproductiveHealthTab, {
      patient: baseFemalePatient,
      initialReproductiveHistory: {
        id: 'rep-existing-1',
        clinicId: 'clinic-1',
        patientId: baseFemalePatient.id,
        isApplicable: true,
        isMenopausal: false,
        hadPreEclampsiaHypertension: false,
        receivedFamilyPlanningCounseling: false,
        createdAt: '2026-11-04T01:00:00Z',
      },
      onRefreshChart: makeUnstableRefresh(),
    });

    try {
      const yesBtn = findFirstPressableWithText(harness.getTree(), 'Yes');
      expect(yesBtn).not.toBeNull();
      yesBtn!();

      await wait(1100);

      expect(updateReproductiveCalls).toBe(1);
      expect(refreshCount).toBe(1);

      const renderedText = collectText(harness.getTree());
      expect(renderedText).toContain('Last saved');
      expect(renderedText).not.toContain('Saving changes…');
    } finally {
      harness.unmount();
    }
  });
});
