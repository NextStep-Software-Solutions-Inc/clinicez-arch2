import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import React, { act } from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';

// ── Unify React instance across patient-app and workspace root ────────────────
for (const reactPkg of [
  '../../../node_modules/react',
  '../../../packages/comms-sdk/node_modules/react',
]) {
  try {
    mock.module(require.resolve(reactPkg), () => ({ ...React, default: React }));
  } catch { /* not present */ }
  try {
    mock.module(require.resolve(`${reactPkg}/jsx-runtime`), () => ReactJsxRuntime);
  } catch { /* not present */ }
  try {
    mock.module(require.resolve(`${reactPkg}/jsx-dev-runtime`), () => ReactJsxDevRuntime);
  } catch { /* not present */ }
}
mock.module('react', () => ({ ...React, default: React }));
mock.module('react/jsx-runtime', () => ReactJsxRuntime);
mock.module('react/jsx-dev-runtime', () => ReactJsxDevRuntime);

const { createRoot } = await import('react-dom/client');
type Root = ReturnType<typeof createRoot>;

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// ── Minimal DOM Container for React 19 createRoot (renders null leaf components) ─
class FakeHTMLIFrameElement {}
class FakeHTMLElement {}

function createFakeDocument() {
  const createNode = (tagName: string) => {
    const node: any = {
      nodeType: 1,
      nodeName: tagName.toUpperCase(),
      tagName: tagName.toUpperCase(),
      namespaceURI: 'http://www.w3.org/1999/xhtml',
      childNodes: [] as any[],
      style: {},
      ownerDocument: null as any,
      parentNode: null as any,
      appendChild(child: any) {
        child.parentNode = node;
        node.childNodes.push(child);
        return child;
      },
      removeChild(child: any) {
        const idx = node.childNodes.indexOf(child);
        if (idx >= 0) node.childNodes.splice(idx, 1);
        child.parentNode = null;
        return child;
      },
      insertBefore(child: any, ref: any) {
        child.parentNode = node;
        const idx = ref ? node.childNodes.indexOf(ref) : -1;
        if (idx >= 0) node.childNodes.splice(idx, 0, child);
        else node.childNodes.push(child);
        return child;
      },
      addEventListener() {},
      removeEventListener() {},
      setAttribute() {},
      removeAttribute() {},
    };
    return node;
  };

  const doc: any = {
    nodeType: 9,
    nodeName: '#document',
    defaultView: null as any,
    activeElement: null,
    documentElement: null as any,
    body: null as any,
    createElement(tag: string) {
      const el = createNode(tag);
      el.ownerDocument = doc;
      return el;
    },
    createTextNode(text: string) {
      return {
        nodeType: 3,
        nodeName: '#text',
        nodeValue: text,
        ownerDocument: doc,
        parentNode: null,
      };
    },
    addEventListener() {},
    removeEventListener() {},
  };
  doc.documentElement = doc.createElement('html');
  doc.body = doc.createElement('body');
  doc.defaultView = {
    document: doc,
    HTMLIFrameElement: FakeHTMLIFrameElement,
    HTMLElement: FakeHTMLElement,
    Node: Object,
    addEventListener() {},
    removeEventListener() {},
  };
  return doc;
}

if (typeof (globalThis as any).HTMLIFrameElement === 'undefined') {
  (globalThis as any).HTMLIFrameElement = FakeHTMLIFrameElement;
}
if (typeof (globalThis as any).HTMLElement === 'undefined') {
  (globalThis as any).HTMLElement = FakeHTMLElement;
}
if (typeof (globalThis as any).document === 'undefined') {
  (globalThis as any).document = createFakeDocument();
}
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = (globalThis as any).document.defaultView;
}

// ── Real Event Bus Mocks for DeviceEventEmitter & Navigation ──────────────────
type Listener = (...args: any[]) => void;

const deviceListeners = new Map<string, Set<Listener>>();
const mockDeviceEventEmitter = {
  addListener(event: string, listener: Listener) {
    if (!deviceListeners.has(event)) deviceListeners.set(event, new Set());
    deviceListeners.get(event)!.add(listener);
    return {
      remove() {
        deviceListeners.get(event)?.delete(listener);
      },
    };
  },
  emit(event: string, ...args: any[]) {
    for (const listener of Array.from(deviceListeners.get(event) ?? [])) {
      listener(...args);
    }
  },
};

const navListeners = new Map<string, Set<Listener>>();
const mockNavigation = {
  goBack: mock(() => {}),
  addListener(event: string, listener: Listener) {
    if (!navListeners.has(event)) navListeners.set(event, new Set());
    navListeners.get(event)!.add(listener);
    return () => {
      navListeners.get(event)?.delete(listener);
    };
  },
  emit(event: string, ...args: any[]) {
    for (const listener of Array.from(navListeners.get(event) ?? [])) {
      listener(...args);
    }
  },
};

// ── Captured Rendered Component Props Registry ────────────────────────────────
const capturedFields = new Map<string, any>();
const capturedSaveBars = new Map<string, any>();
const capturedDatePickers = new Map<string, any>();

// ── Mockable SQLite State ─────────────────────────────────────────────────────
const APP_ROOT = path.resolve(import.meta.dir, '..');
const TEST_PATIENT_ID = '11111111-1111-4111-8111-111111111111';

let mockObsRow: Record<string, any> | null = null;
let mockDentalRow: Record<string, any> | null = null;
let mockPregnancies: any[] = [];
let mockContraItems: any[] = [];
let obsFindFirstCount = 0;
let dentalFindFirstCount = 0;
let obsFindFirstDelay: (() => Promise<void>) | null = null;
let dentalFindFirstDelay: (() => Promise<void>) | null = null;
let dbUpdateCalls: Array<{ table: any; values: any }> = [];
let dbInsertCalls: Array<{ table: any; values: any }> = [];
let flushSyncCalls = 0;

function resetTestState() {
  deviceListeners.clear();
  navListeners.clear();
  capturedFields.clear();
  capturedSaveBars.clear();
  capturedDatePickers.clear();
  mockObsRow = null;
  mockDentalRow = null;
  mockPregnancies = [];
  mockContraItems = [];
  obsFindFirstCount = 0;
  dentalFindFirstCount = 0;
  obsFindFirstDelay = null;
  dentalFindFirstDelay = null;
  dbUpdateCalls = [];
  dbInsertCalls = [];
  flushSyncCalls = 0;
  mockNavigation.goBack.mockClear();
}

function mockAliasAndPath(specifiers: string[], factory: () => any) {
  for (const spec of specifiers) {
    mock.module(spec, factory);
  }
}

// Override react-native with functional DeviceEventEmitter & null-rendering primitives
mock.module('react-native', () => {
  const PassThrough = ({ children }: any) => React.createElement(React.Fragment, null, children ?? null);
  return {
    Platform: { OS: 'web', select: (obj: Record<string, unknown>) => obj?.web ?? obj?.default },
    StyleSheet: {
      create: <T,>(styles: T): T => styles,
      flatten: <T,>(styles: T): T => styles,
      hairlineWidth: 1,
    },
    AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
    DeviceEventEmitter: mockDeviceEventEmitter,
    TurboModuleRegistry: { get: () => null, getEnforcing: () => ({}) },
    Dimensions: { get: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }), addEventListener: () => ({ remove: () => {} }) },
    useWindowDimensions: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
    View: PassThrough,
    Text: PassThrough,
    ScrollView: PassThrough,
    KeyboardAvoidingView: PassThrough,
    Pressable: PassThrough,
    TouchableOpacity: PassThrough,
    TouchableHighlight: PassThrough,
    TextInput: () => null,
    ActivityIndicator: () => null,
    Modal: PassThrough,
  };
});

mock.module('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

mock.module('@gorhom/bottom-sheet', () => ({
  BottomSheetModalProvider: ({ children }: any) => React.createElement(React.Fragment, null, children ?? null),
}));

const obsTableToken = { __table: 'patient_obstetric_profile', id: 'id', patientId: 'patientId' };
const pregTableToken = { __table: 'patient_pregnancies', id: 'id', patientId: 'patientId' };
const contraTableToken = { __table: 'patient_contraceptive_history', id: 'id', patientId: 'patientId' };
const dentalTableToken = { __table: 'patient_dental_vision', id: 'id', patientId: 'patientId' };

mockAliasAndPath(
  ['@db/schema/patientObstetricProfile', path.resolve(APP_ROOT, 'db/schema/patientObstetricProfile.ts')],
  () => ({ patientObstetricProfile: obsTableToken }),
);
mockAliasAndPath(
  ['@db/schema/patientPregnancies', path.resolve(APP_ROOT, 'db/schema/patientPregnancies.ts')],
  () => ({ patientPregnancies: pregTableToken }),
);
mockAliasAndPath(
  ['@db/schema/patientContraceptiveHistory', path.resolve(APP_ROOT, 'db/schema/patientContraceptiveHistory.ts')],
  () => ({ patientContraceptiveHistory: contraTableToken }),
);
mockAliasAndPath(
  ['@db/schema/patientDentalVision', path.resolve(APP_ROOT, 'db/schema/patientDentalVision.ts')],
  () => ({ patientDentalVision: dentalTableToken }),
);

const mockDb = {
  query: {
    patientObstetricProfile: {
      findFirst: async () => {
        obsFindFirstCount += 1;
        if (obsFindFirstDelay) await obsFindFirstDelay();
        return mockObsRow ? { ...mockObsRow } : undefined;
      },
    },
    patientDentalVision: {
      findFirst: async () => {
        dentalFindFirstCount += 1;
        if (dentalFindFirstDelay) await dentalFindFirstDelay();
        return mockDentalRow ? { ...mockDentalRow } : undefined;
      },
    },
  },
  select: () => ({
    from: (table: any) => ({
      where: () => {
        const rowsForTable = () => {
          if (table === obsTableToken) return mockObsRow ? [{ ...mockObsRow }] : [];
          if (table === dentalTableToken) return mockDentalRow ? [{ ...mockDentalRow }] : [];
          if (table === pregTableToken) return [...mockPregnancies];
          if (table === contraTableToken) return [...mockContraItems];
          return [];
        };
        const resultPromise = Promise.resolve(rowsForTable()) as any;
        resultPromise.limit = () => Promise.resolve(rowsForTable().slice(0, 1));
        return resultPromise;
      },
    }),
  }),
  update: (table: any) => ({
    set: (values: any) => ({
      where: async () => {
        dbUpdateCalls.push({ table, values });
        if (table === obsTableToken) {
          mockObsRow = { ...(mockObsRow ?? { id: 'obs-1' }), ...values };
        } else if (table === dentalTableToken) {
          mockDentalRow = { ...(mockDentalRow ?? { id: 'dv-1' }), ...values };
        }
      },
    }),
  }),
  insert: (table: any) => ({
    values: async (values: any) => {
      dbInsertCalls.push({ table, values });
      if (table === obsTableToken) {
        mockObsRow = { ...values };
      } else if (table === dentalTableToken) {
        mockDentalRow = { ...values };
      }
    },
  }),
};

mockAliasAndPath(['@db/index', '../db/index', path.resolve(APP_ROOT, 'db/index.ts')], () => ({
  db: mockDb,
  originalDb: mockDb,
  registerSyncTrigger: () => {},
  flushDatabaseSnapshot: async () => {},
  clearWebDatabaseSnapshot: async () => {},
  ensureDatabaseReady: async () => {},
}));

mockAliasAndPath(
  ['hooks/usePatientId', path.resolve(APP_ROOT, 'hooks/usePatientId.ts')],
  () => ({ usePatientId: () => TEST_PATIENT_ID }),
);
mockAliasAndPath(
  ['contexts/AuthContext', path.resolve(APP_ROOT, 'contexts/AuthContext.tsx')],
  () => ({ useAuth: () => ({ getToken: async () => 'mock-token', userId: 'clerk-user-1' }) }),
);
mockAliasAndPath(
  ['contexts/ThemeContext', path.resolve(APP_ROOT, 'contexts/ThemeContext.tsx')],
  () => ({
    useAppTheme: () => ({
      spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
      colors: { border: '#ccc', surface: '#fff', text: '#000', primary: '#0D6963' },
      radii: { md: 8, lg: 12 },
      sizes: { iconSm: 16 },
    }),
  }),
);
mockAliasAndPath(
  ['hooks/useSafeHeaderHeight', path.resolve(APP_ROOT, 'hooks/useSafeHeaderHeight.ts')],
  () => ({ useSafeHeaderHeight: () => 56 }),
);
mockAliasAndPath(
  ['hooks/useEhrOptions', path.resolve(APP_ROOT, 'hooks/useEhrOptions.ts')],
  () => ({
    useEhrOptions: () => ({
      options: [],
      selectOptions: [
        { label: 'None', value: 'None' },
        { label: 'Glasses', value: 'Glasses' },
        { label: 'Contacts', value: 'Contacts' },
        { label: 'Both', value: 'Both' },
      ],
      loading: false,
    }),
  }),
);
mockAliasAndPath(
  ['@utils/dialog', path.resolve(APP_ROOT, 'utils/dialog.ts')],
  () => ({ dialog: { alert: () => {}, confirm: async () => true } }),
);
mockAliasAndPath(
  ['services/api/syncService', path.resolve(APP_ROOT, 'services/api/syncService.ts')],
  () => ({
    flushAndSyncProfile: async () => {
      flushSyncCalls += 1;
      // Mirror real syncService behavior: emits 'profile-synced' before resolving
      mockDeviceEventEmitter.emit('profile-synced', { patientId: TEST_PATIENT_ID, timestamp: Date.now() });
      return { success: true, synced: 1, failed: 0, skipped: false };
    },
    deleteProfileListItem: async () => ({ success: true }),
  }),
);
mockAliasAndPath(
  ['services/api/patientApi', path.resolve(APP_ROOT, 'services/api/patientApi.ts')],
  () => ({
    deletePatientPregnancy: async () => {},
    deletePatientContraceptiveHistory: async () => {},
  }),
);

// UI component mocks that record latest props and render null / children
const FragmentPassthrough = ({ children }: any) => React.createElement(React.Fragment, null, children ?? null);

mockAliasAndPath(
  ['components/layout/Screen', path.resolve(APP_ROOT, 'components/layout/Screen.tsx')],
  () => ({ default: FragmentPassthrough }),
);
mockAliasAndPath(
  ['@ui/ThemedBottomSheetModal', path.resolve(APP_ROOT, 'components/ui/ThemedBottomSheetModal.tsx')],
  () => ({
    default: React.forwardRef(({ children }: any, _ref: any) =>
      React.createElement(React.Fragment, null, children ?? null),
    ),
  }),
);
mockAliasAndPath(
  ['@ui/ThemedBottomSheetScrollView', path.resolve(APP_ROOT, 'components/ui/ThemedBottomSheetScrollView.tsx')],
  () => ({ default: FragmentPassthrough }),
);
mockAliasAndPath(
  ['components/profile/ProfileSectionHeader', path.resolve(APP_ROOT, 'components/profile/ProfileSectionHeader.tsx')],
  () => ({ default: () => null }),
);
mockAliasAndPath(
  ['components/profile/ProfileListItemCard', path.resolve(APP_ROOT, 'components/profile/ProfileListItemCard.tsx')],
  () => ({ default: () => null }),
);
mockAliasAndPath(
  ['components/profile/ProfileAddButton', path.resolve(APP_ROOT, 'components/profile/ProfileAddButton.tsx')],
  () => ({ default: () => null }),
);
mockAliasAndPath(
  ['components/profile/ProfileToggle', path.resolve(APP_ROOT, 'components/profile/ProfileToggle.tsx')],
  () => ({ default: () => null }),
);
mockAliasAndPath(
  ['components/profile/ProfileSelectModal', path.resolve(APP_ROOT, 'components/profile/ProfileSelectModal.tsx')],
  () => ({
    default: (props: any) => {
      capturedFields.set(`modal:${props.title}`, props);
      return null;
    },
  }),
);
mockAliasAndPath(
  ['components/profile/ProfileDatePicker', path.resolve(APP_ROOT, 'components/profile/ProfileDatePicker.tsx')],
  () => ({
    default: (props: any) => {
      capturedDatePickers.set(props.label, props);
      return null;
    },
  }),
);
mockAliasAndPath(
  ['components/profile/ProfileFormField', path.resolve(APP_ROOT, 'components/profile/ProfileFormField.tsx')],
  () => ({
    default: (props: any) => {
      capturedFields.set(props.label, props);
      return null;
    },
  }),
);
mockAliasAndPath(
  ['components/profile/ProfileSaveBar', path.resolve(APP_ROOT, 'components/profile/ProfileSaveBar.tsx')],
  () => ({
    default: (props: any) => {
      capturedSaveBars.set(props.label ?? 'Save Changes', props);
      return null;
    },
  }),
);

// Import subjects under test AFTER mocks are registered
const { useProfileSync } = await import('../hooks/useProfileSync');
const { default: ObstetricProfileScreen } = await import('../navigation/screens/profile/ObstetricProfile.screen');
const { default: DentalVisionScreen } = await import('../navigation/screens/profile/DentalVision.screen');

async function flushMicrotasks(rounds = 4) {
  for (let i = 0; i < rounds; i++) {
    await Promise.resolve();
  }
}

function mountComponent(element: React.ReactElement): { root: Root; unmount: () => Promise<void> } {
  const container = (globalThis as any).document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    root,
    unmount: async () => {
      await act(async () => {
        root.unmount();
        await flushMicrotasks();
      });
    },
  };
}

describe('Issue #233: Profile form stability and background sync dirty-form protection', () => {
  beforeEach(() => {
    resetTestState();
  });

  afterEach(() => {
    resetTestState();
  });

  describe('useProfileSync hook dirty-form guard', () => {
    test('invokes onRefresh when clean, suppresses onRefresh while dirty, and resumes once clean again', async () => {
      const isDirtyRef = { current: false };
      let refreshCount = 0;

      function Harness() {
        useProfileSync(() => {
          refreshCount += 1;
        }, { isDirtyRef });
        return null;
      }

      const mounted = mountComponent(React.createElement(Harness));
      try {
        // Clean: both profile-synced and focus trigger refresh
        act(() => {
          mockDeviceEventEmitter.emit('profile-synced');
          mockNavigation.emit('focus');
        });
        expect(refreshCount).toBe(2);

        // Dirty: both profile-synced and focus are suppressed
        isDirtyRef.current = true;
        act(() => {
          mockDeviceEventEmitter.emit('profile-synced');
          mockNavigation.emit('focus');
        });
        expect(refreshCount).toBe(2);

        // Clean again (e.g., after save): refreshes resume
        isDirtyRef.current = false;
        act(() => {
          mockDeviceEventEmitter.emit('profile-synced');
        });
        expect(refreshCount).toBe(3);
      } finally {
        await mounted.unmount();
      }

      // Unmounted: listeners were removed
      act(() => {
        mockDeviceEventEmitter.emit('profile-synced');
        mockNavigation.emit('focus');
      });
      expect(refreshCount).toBe(3);
    });
  });

  describe('ObstetricProfileScreen regression coverage', () => {
    test('keystrokes never re-trigger loadObsProfile or reset unsaved input, and profile-synced/focus do not clobber dirty edits', async () => {
      mockObsRow = {
        id: 'obs-1',
        patientId: TEST_PATIENT_ID,
        ageAtMenarche: 12,
        lmp: '2026-01-10',
        cycleLength: 28,
        cycleDuration: 5,
        dysmenorrheaSeverity: 'Mild',
        ageAtMenopause: null,
        gravida: 2,
        para: 1,
        abortion: 0,
        livingChildren: 1,
      };

      const mounted = mountComponent(React.createElement(ObstetricProfileScreen));
      try {
        await act(async () => {
          await flushMicrotasks();
        });

        // Initial load hydrated stored SQLite values
        expect(obsFindFirstCount).toBe(1);
        expect(capturedFields.get('Age at Menarche')?.value).toBe('12');
        expect(capturedFields.get('Cycle Length (days)')?.value).toBe('28');
        expect(capturedFields.get('Gravida (G) — Total Pregnancies')?.value).toBe('2');
        expect(capturedSaveBars.get('Save Obstetric Profile')?.isDirty).toBe(false);

        // Simulate user typing across multiple fields (previously wiped immediately on every keystroke)
        await act(async () => {
          capturedFields.get('Age at Menarche').onChangeText('13');
          await flushMicrotasks();
        });
        await act(async () => {
          capturedFields.get('Cycle Length (days)').onChangeText('30');
          await flushMicrotasks();
        });
        await act(async () => {
          capturedFields.get('Dysmenorrhea').onChangeText('Moderate');
          await flushMicrotasks();
        });
        await act(async () => {
          capturedFields.get('Gravida (G) — Total Pregnancies').onChangeText('3');
          await flushMicrotasks();
        });

        // Critical Bug #1 assertion: keystrokes did NOT re-run loadObsProfile or reset input
        expect(obsFindFirstCount).toBe(1);
        expect(capturedFields.get('Age at Menarche')?.value).toBe('13');
        expect(capturedFields.get('Cycle Length (days)')?.value).toBe('30');
        expect(capturedFields.get('Dysmenorrhea')?.value).toBe('Moderate');
        expect(capturedFields.get('Gravida (G) — Total Pregnancies')?.value).toBe('3');
        expect(capturedSaveBars.get('Save Obstetric Profile')?.isDirty).toBe(true);

        // Mutate underlying DB to simulate a 60s background sync / tab focus pulling server data
        mockObsRow = { ...mockObsRow, ageAtMenarche: 11, cycleLength: 26, gravida: 1 };

        await act(async () => {
          mockDeviceEventEmitter.emit('profile-synced', { patientId: TEST_PATIENT_ID });
          mockNavigation.emit('focus');
          await flushMicrotasks();
        });

        // Critical Bug #2 assertion: unsaved edits remain intact and obs DB query was skipped while dirty
        expect(obsFindFirstCount).toBe(1);
        expect(capturedFields.get('Age at Menarche')?.value).toBe('13');
        expect(capturedFields.get('Cycle Length (days)')?.value).toBe('30');
        expect(capturedFields.get('Dysmenorrhea')?.value).toBe('Moderate');
        expect(capturedFields.get('Gravida (G) — Total Pregnancies')?.value).toBe('3');

        // Save changes -> updates DB, flushes sync, and clears isDirty
        await act(async () => {
          await capturedSaveBars.get('Save Obstetric Profile').onSave();
          await flushMicrotasks();
        });

        expect(dbUpdateCalls.length).toBe(1);
        expect(dbUpdateCalls[0].values.ageAtMenarche).toBe(13);
        expect(dbUpdateCalls[0].values.cycleLength).toBe(30);
        expect(dbUpdateCalls[0].values.gravida).toBe(3);
        expect(flushSyncCalls).toBe(1);
        expect(capturedSaveBars.get('Save Obstetric Profile')?.isDirty).toBe(false);

        // Once clean again, subsequent background sync refreshes cleanly from SQLite
        mockObsRow = { ...mockObsRow, cycleLength: 29 };
        await act(async () => {
          mockDeviceEventEmitter.emit('profile-synced', { patientId: TEST_PATIENT_ID });
          await flushMicrotasks();
        });
        expect(obsFindFirstCount).toBe(2);
        expect(capturedFields.get('Cycle Length (days)')?.value).toBe('29');
      } finally {
        await mounted.unmount();
      }
    });

    test('uses UPDATE instead of INSERT when a background sync creates the obstetric row while the form is dirty', async () => {
      // Initially no row exists in SQLite
      mockObsRow = null;

      const mounted = mountComponent(React.createElement(ObstetricProfileScreen));
      try {
        await act(async () => {
          await flushMicrotasks();
        });

        // User starts typing into fresh empty form
        await act(async () => {
          capturedFields.get('Age at Menarche').onChangeText('14');
          await flushMicrotasks();
        });
        expect(capturedSaveBars.get('Save Obstetric Profile')?.isDirty).toBe(true);

        // Background sync inserts a row from another device while user is editing
        mockObsRow = { id: 'obs-from-sync', patientId: TEST_PATIENT_ID, ageAtMenarche: 12 };
        await act(async () => {
          mockDeviceEventEmitter.emit('profile-synced', { patientId: TEST_PATIENT_ID });
          await flushMicrotasks();
        });
        expect(capturedFields.get('Age at Menarche')?.value).toBe('14');

        // User clicks Save -> must detect existing row and UPDATE rather than colliding on INSERT
        await act(async () => {
          await capturedSaveBars.get('Save Obstetric Profile').onSave();
          await flushMicrotasks();
        });

        expect(dbUpdateCalls.length).toBe(1);
        expect(dbInsertCalls.length).toBe(0);
        expect(dbUpdateCalls[0].values.ageAtMenarche).toBe(14);
      } finally {
        await mounted.unmount();
      }
    });
  });

  describe('DentalVisionScreen regression coverage', () => {
    test('preserves unsaved edits across profile-synced and navigation focus events, then refreshes when clean after save', async () => {
      mockDentalRow = {
        id: 'dv-1',
        patientId: TEST_PATIENT_ID,
        dentistName: 'Dr. Santos',
        dentistClinic: 'Smile Studio',
        orthodonticDevice: 'None',
        eyeDoctorName: 'Dr. Cruz',
        correctiveLenses: 'Glasses',
      };

      const mounted = mountComponent(React.createElement(DentalVisionScreen));
      try {
        await act(async () => {
          await flushMicrotasks();
        });

        expect(dentalFindFirstCount).toBe(1);
        expect(capturedFields.get('Dentist Name')?.value).toBe('Dr. Santos');
        expect(capturedFields.get('Dental Clinic')?.value).toBe('Smile Studio');
        expect(capturedSaveBars.get('Save Changes')?.isDirty).toBe(false);

        // User begins editing Dental & Vision fields
        await act(async () => {
          capturedFields.get('Dentist Name').onChangeText('Dr. Reyes');
          capturedFields.get('Dental Clinic').onChangeText('Bright Dental Care');
          capturedFields.get('Orthodontic Device / Appliance').onChangeText('Retainer');
          capturedFields.get('Eye Doctor / Ophthalmologist').onChangeText('Dr. Mendoza');
          capturedFields.get('modal:Corrective Lenses').onSelect('Both');
          await flushMicrotasks();
        });

        expect(capturedSaveBars.get('Save Changes')?.isDirty).toBe(true);
        expect(capturedFields.get('Dentist Name')?.value).toBe('Dr. Reyes');
        expect(capturedFields.get('Dental Clinic')?.value).toBe('Bright Dental Care');
        expect(capturedFields.get('Orthodontic Device / Appliance')?.value).toBe('Retainer');
        expect(capturedFields.get('Eye Doctor / Ophthalmologist')?.value).toBe('Dr. Mendoza');
        expect(capturedFields.get('Corrective Lenses')?.value).toBe('Both');

        // Simulate 60s background sync and browser tab refocus emitting profile-synced + focus
        mockDentalRow = {
          ...mockDentalRow,
          dentistName: 'Dr. Old Server Value',
          dentistClinic: 'Old Clinic',
          correctiveLenses: 'None',
        };

        await act(async () => {
          mockDeviceEventEmitter.emit('profile-synced', { patientId: TEST_PATIENT_ID });
          mockNavigation.emit('focus');
          await flushMicrotasks();
        });

        // Unsaved user edits must NOT be wiped
        expect(dentalFindFirstCount).toBe(1);
        expect(capturedFields.get('Dentist Name')?.value).toBe('Dr. Reyes');
        expect(capturedFields.get('Dental Clinic')?.value).toBe('Bright Dental Care');
        expect(capturedFields.get('Orthodontic Device / Appliance')?.value).toBe('Retainer');
        expect(capturedFields.get('Eye Doctor / Ophthalmologist')?.value).toBe('Dr. Mendoza');
        expect(capturedFields.get('Corrective Lenses')?.value).toBe('Both');

        // Save persists edited values and resets dirty flag
        await act(async () => {
          await capturedSaveBars.get('Save Changes').onSave();
          await flushMicrotasks();
        });

        expect(dbUpdateCalls.length).toBe(1);
        expect(dbUpdateCalls[0].values.dentistName).toBe('Dr. Reyes');
        expect(dbUpdateCalls[0].values.dentistClinic).toBe('Bright Dental Care');
        expect(dbUpdateCalls[0].values.orthodonticDevice).toBe('Retainer');
        expect(dbUpdateCalls[0].values.eyeDoctorName).toBe('Dr. Mendoza');
        expect(dbUpdateCalls[0].values.correctiveLenses).toBe('Both');
        expect(capturedSaveBars.get('Save Changes')?.isDirty).toBe(false);

        // Once clean, background sync refreshes from SQLite again
        mockDentalRow = { ...mockDentalRow, dentistName: 'Dr. Updated Elsewhere' };
        await act(async () => {
          mockDeviceEventEmitter.emit('profile-synced', { patientId: TEST_PATIENT_ID });
          await flushMicrotasks();
        });

        expect(dentalFindFirstCount).toBe(2);
        expect(capturedFields.get('Dentist Name')?.value).toBe('Dr. Updated Elsewhere');
      } finally {
        await mounted.unmount();
      }
    });

    test('protects user edits made while an async SQLite load is still in flight and uses UPDATE if sync created the row', async () => {
      mockDentalRow = {
        id: 'dv-async',
        patientId: TEST_PATIENT_ID,
        dentistName: 'Dr. Stale Slow DB',
        dentistClinic: 'Slow Clinic',
        orthodonticDevice: '',
        eyeDoctorName: '',
        correctiveLenses: 'None',
      };

      let releaseQuery!: () => void;
      dentalFindFirstDelay = () =>
        new Promise<void>((resolve) => {
          releaseQuery = resolve;
        });

      const mounted = mountComponent(React.createElement(DentalVisionScreen));
      try {
        await act(async () => {
          await flushMicrotasks();
        });

        // User starts typing BEFORE initial SQLite query resolves
        await act(async () => {
          capturedFields.get('Dentist Name').onChangeText('Dr. Typed Immediately');
          await flushMicrotasks();
        });
        expect(capturedFields.get('Dentist Name')?.value).toBe('Dr. Typed Immediately');
        expect(capturedSaveBars.get('Save Changes')?.isDirty).toBe(true);

        // Now the slow in-flight DB query resolves — must NOT clobber typed input
        await act(async () => {
          releaseQuery();
          await flushMicrotasks();
        });
        expect(capturedFields.get('Dentist Name')?.value).toBe('Dr. Typed Immediately');

        // Saving must UPDATE existing row rather than colliding on INSERT
        await act(async () => {
          await capturedSaveBars.get('Save Changes').onSave();
          await flushMicrotasks();
        });
        expect(dbUpdateCalls.length).toBe(1);
        expect(dbInsertCalls.length).toBe(0);
        expect(dbUpdateCalls[0].values.dentistName).toBe('Dr. Typed Immediately');
      } finally {
        await mounted.unmount();
      }
    });
  });

  describe('All singleton profile screens static safety invariants', () => {
    const SINGLETON_SCREENS = [
      'ObstetricProfile.screen.tsx',
      'DentalVision.screen.tsx',
      'GovernmentIds.screen.tsx',
      'ContactInfo.screen.tsx',
      'PersonalDemographics.screen.tsx',
      'Occupation.screen.tsx',
      'SocialHistory.screen.tsx',
      'MaleReproductive.screen.tsx',
      'MentalHealth.screen.tsx',
      'NcdQuestionnaire.screen.tsx',
    ];

    const SINGLETON_UPSERT_SCREENS = [
      'ObstetricProfile.screen.tsx',
      'DentalVision.screen.tsx',
      'GovernmentIds.screen.tsx',
      'Occupation.screen.tsx',
      'SocialHistory.screen.tsx',
      'MaleReproductive.screen.tsx',
      'MentalHealth.screen.tsx',
      'NcdQuestionnaire.screen.tsx',
    ];

    for (const file of SINGLETON_SCREENS) {
      test(`${file} guards load/reset with a dirty ref and never puts useForm() wrapper object in useCallback deps`, () => {
        const source = fs
          .readFileSync(path.join(APP_ROOT, 'navigation/screens/profile', file), 'utf8')
          .replace(/\r\n/g, '\n');

        // Must maintain a ref mirroring isDirty
        expect(source).toMatch(/const is(?:Obs)?DirtyRef = useRef\((?:isObsDirty|isDirty)\);/);
        expect(source).toMatch(/is(?:Obs)?DirtyRef\.current = (?:isObsDirty|isDirty);/);

        // Must short-circuit before DB read and before resetting form state
        expect(source).toMatch(/if \(!patientId \|\| is(?:Obs)?DirtyRef\.current\) return;/);
        expect(source).toMatch(/!is(?:Obs)?DirtyRef\.current/);

        // Must never depend on an unstable obsForm / form wrapper object from useForm()
        expect(source).not.toContain('[patientId, obsForm]');

        if (file !== 'ObstetricProfile.screen.tsx') {
          expect(source).toMatch(/useProfileSync\([^,]+,\s*\{\s*isDirtyRef\s*\}\)/);
        } else {
          expect(source).toContain('[patientId, resetObsForm]');
        }
      });
    }

    for (const file of SINGLETON_UPSERT_SCREENS) {
      test(`${file} checks SQLite row existence before choosing UPDATE vs INSERT on save`, () => {
        const source = fs
          .readFileSync(path.join(APP_ROOT, 'navigation/screens/profile', file), 'utf8')
          .replace(/\r\n/g, '\n');

        expect(source).toContain('existingRows.length > 0');
      });
    }
  });
});
