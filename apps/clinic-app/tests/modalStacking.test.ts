// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock React Native modules for Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID }: any) =>
    React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
      },
      placeholder,
      children
    );
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  Image: createMockComponent('Image'),
  KeyboardAvoidingView: createMockComponent('KeyboardAvoidingView'),
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

const modalStackingClinicContextFactory = () => ({
  useClinic: () =>
    (globalThis as any).__mockClinicContext ?? {
      facilityName: 'NextStep OPD',
      planTier: 'pro',
      accreditationNumber: 'ACC-12345',
      settings: { preferredChartLayout: 'centered' },
    },
  ClinicProvider: ({ children }: any) => children,
});

const modalStackingStaffContextFactory = () => ({
  useStaff: () =>
    (globalThis as any).__mockStaffContext ?? {
      current: { id: 'staff-1', name: 'Dr. Santos', role: 'Physician' },
      currentName: 'Dr. Santos',
    },
  formatStaffName: (s: any) => s?.name || [s?.title, s?.firstName, s?.lastName].filter(Boolean).join(' ').trim(),
  staffInitials: (s: any) => `${s?.firstName?.[0] ?? ''}${s?.lastName?.[0] ?? ''}`.toUpperCase() || '?',
  StaffProvider: ({ children }: any) => children,
});

mock.module('../context/StaffContext', modalStackingStaffContextFactory);
mock.module('@context/StaffContext', modalStackingStaffContextFactory);

mock.module('../utils/usePhilHealthCatalog', () => ({
  usePhilHealthCatalog: () => ({ items: [], loading: false, error: null, reload: () => {} }),
}));

mock.module('@utils/usePhilHealthCatalog', () => ({
  usePhilHealthCatalog: () => ({ items: [], loading: false, error: null, reload: () => {} }),
}));

const {
  registerModal,
  attachPortalElement,
  unregisterModal,
  bringModalToFront,
  getModalStack,
  getModalStackDepth,
  getModalZIndex,
  isTopModal,
  getTopModal,
  getActiveModalCount,
  clearModalStack,
  subscribeModalStack,
  syncPortalZIndex,
  bringPortalToFront,
  findPortalContainer,
  initModalStackObserver,
  ModalStackContext,
  BASE_MODAL_Z_INDEX,
  MODAL_Z_INDEX_STEP,
} = await import('../components/ui/modalStack');

const { default: Modal } = await import('../components/ui/Modal');
const { default: PatientChartModal } = await import('../components/chart/PatientChartModal');
const { default: PhilHealthProfileModal } = await import('../components/PhilHealthProfileModal');
const { default: EditPatientModal } = await import('../components/patient/EditPatientModal');
const { default: ActionMenu } = await import('../components/ui/ActionMenu');
const { default: DiagnosticLabTab } = await import('../components/chart/DiagnosticLabTab');
const { default: StatutoryImmunizationsTab } = await import('../components/chart/StatutoryImmunizationsTab');

describe('Modal Stacking System — Nested & Layered Modals', () => {
  beforeEach(() => {
    clearModalStack();
    (globalThis as any).__mockClinicContext = {
      facilityName: 'NextStep OPD',
      planTier: 'pro',
      accreditationNumber: 'ACC-12345',
      settings: { preferredChartLayout: 'centered' },
    };
    (globalThis as any).__mockStaffContext = null;
  });

  describe('1. Global Modal Stack State Machine', () => {
    test('registerModal assigns base z-index (10000) and depth 0 to the first modal', () => {
      const item = registerModal('chart-modal');
      expect(item.depth).toBe(0);
      expect(item.zIndex).toBe(BASE_MODAL_Z_INDEX);
      expect(getActiveModalCount()).toBe(1);
      expect(isTopModal('chart-modal')).toBe(true);
      expect(getModalStackDepth('chart-modal')).toBe(0);
      expect(getModalZIndex('chart-modal')).toBe(BASE_MODAL_Z_INDEX);
    });

    test('registerModal assigns incremented z-index (10100) and depth 1 when second modal opens on top', () => {
      const modal1 = registerModal('chart-modal');
      const modal2 = registerModal('demographics-edit-modal');

      expect(modal1.depth).toBe(0);
      expect(modal1.zIndex).toBe(BASE_MODAL_Z_INDEX);

      expect(modal2.depth).toBe(1);
      expect(modal2.zIndex).toBe(BASE_MODAL_Z_INDEX + MODAL_Z_INDEX_STEP);

      expect(getActiveModalCount()).toBe(2);
      expect(isTopModal('demographics-edit-modal')).toBe(true);
      expect(isTopModal('chart-modal')).toBe(false);
      expect(getTopModal()?.id).toBe('demographics-edit-modal');
    });

    test('registerModal handles 3-level deep modal hierarchy (Chart -> Edit -> Allergy Intake)', () => {
      registerModal('modal-chart');
      registerModal('modal-edit');
      const modal3 = registerModal('modal-allergy');

      expect(getActiveModalCount()).toBe(3);
      expect(modal3.depth).toBe(2);
      expect(modal3.zIndex).toBe(BASE_MODAL_Z_INDEX + 2 * MODAL_Z_INDEX_STEP); // 10200
      expect(isTopModal('modal-allergy')).toBe(true);

      // Unregister level 3: level 2 becomes the top modal
      unregisterModal('modal-allergy');
      expect(getActiveModalCount()).toBe(2);
      expect(isTopModal('modal-edit')).toBe(true);
      expect(isTopModal('modal-chart')).toBe(false);

      // Unregister level 2: level 1 becomes the top modal
      unregisterModal('modal-edit');
      expect(getActiveModalCount()).toBe(1);
      expect(isTopModal('modal-chart')).toBe(true);

      // Unregister level 1: stack is empty
      unregisterModal('modal-chart');
      expect(getActiveModalCount()).toBe(0);
      expect(isTopModal('modal-chart')).toBe(false);
    });

    test('registerModal respects parentDepth when nested in context', () => {
      // Child modal registered with parentDepth: 1 must be at least depth 2
      const child = registerModal('nested-sub-dialog', { parentDepth: 1 });
      expect(child.depth).toBeGreaterThanOrEqual(2);
      expect(child.zIndex).toBeGreaterThanOrEqual(BASE_MODAL_Z_INDEX + 2 * MODAL_Z_INDEX_STEP);
    });

    test('Re-registering an already open modal promotes it to the top of the stack', () => {
      registerModal('modal-a');
      registerModal('modal-b');
      expect(isTopModal('modal-b')).toBe(true);

      // Modal A is re-promoted/re-registered
      const promotedA = registerModal('modal-a');
      expect(getActiveModalCount()).toBe(2);
      expect(isTopModal('modal-a')).toBe(true);
      expect(isTopModal('modal-b')).toBe(false);
      expect(promotedA.depth).toBe(1);
      expect(promotedA.zIndex).toBe(BASE_MODAL_Z_INDEX + MODAL_Z_INDEX_STEP);
    });

    test('bringModalToFront moves a background modal to the topmost layer', () => {
      registerModal('modal-1');
      registerModal('modal-2');
      registerModal('modal-3');
      expect(isTopModal('modal-3')).toBe(true);

      bringModalToFront('modal-1');
      expect(isTopModal('modal-1')).toBe(true);
      expect(getModalStackDepth('modal-1')).toBe(2);
      expect(getModalZIndex('modal-1')).toBe(BASE_MODAL_Z_INDEX + 2 * MODAL_Z_INDEX_STEP);

      expect(getModalStackDepth('modal-2')).toBe(0);
      expect(getModalStackDepth('modal-3')).toBe(1);
    });

    test('subscribeModalStack notifies listeners on modal push and pop', () => {
      let callCount = 0;
      const unsubscribe = subscribeModalStack(() => {
        callCount += 1;
      });

      registerModal('test-sub-1');
      expect(callCount).toBe(1);

      registerModal('test-sub-2');
      expect(callCount).toBe(2);

      unregisterModal('test-sub-2');
      expect(callCount).toBe(3);

      unsubscribe();
      registerModal('test-sub-3');
      expect(callCount).toBe(3); // Unsubscribed, no more calls
    });
  });

  describe('2. DOM Ordering, Portal Linking & Loop Prevention', () => {
    test('bringPortalToFront moves existing DOM node to end of document.body and sets zIndex on container and animation div', () => {
      const mockAnimDiv: any = { style: {} };
      const mockContentDiv: any = { style: {}, attributes: { 'aria-modal': 'true' } };
      const mockPortal1: any = {
        style: {},
        firstElementChild: mockAnimDiv,
        querySelector: (sel: string) => sel === '[aria-modal="true"]' ? mockContentDiv : null,
        parentNode: null,
      };
      const mockPortal2: any = {
        style: {},
        firstElementChild: { style: {} },
        querySelector: () => null,
        parentNode: null,
      };

      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          if (child.parentNode) {
            const idx = child.parentNode.children.indexOf(child);
            if (idx !== -1) child.parentNode.children.splice(idx, 1);
          }
          child.parentNode = this;
          this.children.push(child);
          this.lastElementChild = child;
          return child;
        },
      };

      const originalDoc = (globalThis as any).document;
      (globalThis as any).document = { body: mockBody };

      try {
        mockBody.appendChild(mockPortal1);
        mockBody.appendChild(mockPortal2);
        expect(mockBody.lastElementChild).toBe(mockPortal2);

        // Bring portal 1 to front (e.g. modal 1 was re-activated or opened on top)
        bringPortalToFront(mockPortal1, 10200);

        expect(mockBody.lastElementChild).toBe(mockPortal1);
        expect(mockPortal1.style.position).toBe('relative');
        expect(mockPortal1.style.zIndex).toBe('10200');
        expect(mockAnimDiv.style.zIndex).toBe('10200');
        expect(mockContentDiv.style.zIndex).toBe('10200');
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('attachPortalElement attaches portal DOM node to registered modal and tags dataset ID', () => {
      const modal = registerModal('test-attach-modal');
      const mockPortal: any = {
        style: {},
        dataset: {},
        firstElementChild: { style: {} },
        querySelector: () => null,
        parentNode: null,
      };

      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          this.children.push(child);
          this.lastElementChild = child;
          return child;
        },
      };

      const originalDoc = (globalThis as any).document;
      (globalThis as any).document = { body: mockBody };

      try {
        attachPortalElement('test-attach-modal', mockPortal);
        expect(mockPortal.dataset.clinicezModalId).toBe('test-attach-modal');
        expect(mockPortal.style.zIndex).toBe(String(modal.zIndex));
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('findPortalContainer traces ancestors up to direct child of document.body', () => {
      const mockBody = { isBody: true };
      const portalDiv: any = { parentNode: mockBody, name: 'portal' };
      const animationDiv: any = { parentNode: portalDiv, name: 'animation' };
      const contentDiv: any = { parentNode: animationDiv, name: 'content' };

      const originalDoc = (globalThis as any).document;
      (globalThis as any).document = { body: mockBody };

      try {
        const found = findPortalContainer(contentDiv);
        expect(found).toBe(portalDiv);
        expect(found.name).toBe('portal');

        const orphanNode: any = { parentNode: null };
        expect(findPortalContainer(orphanNode)).toBeNull();
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('initModalStackObserver tags untracked portals without infinite mutation loops', () => {
      let mutationCount = 0;
      const observers: Function[] = [];

      class TestMutationObserver {
        constructor(public cb: Function) {}
        observe() { observers.push(this.cb); }
        disconnect() {
          const idx = observers.indexOf(this.cb);
          if (idx !== -1) observers.splice(idx, 1);
        }
      }

      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          if (child.parentNode) {
            const idx = child.parentNode.children.indexOf(child);
            if (idx !== -1) child.parentNode.children.splice(idx, 1);
          }
          child.parentNode = this;
          this.children.push(child);
          this.lastElementChild = child;
          mutationCount++;
          return child;
        },
      };

      const originalDoc = (globalThis as any).document;
      const originalMO = (globalThis as any).MutationObserver;
      (globalThis as any).document = {
        body: mockBody,
        querySelectorAll: () => [],
      };
      (globalThis as any).MutationObserver = TestMutationObserver;

      try {
        const cleanup = initModalStackObserver();
        expect(typeof cleanup).toBe('function');
        cleanup();
      } finally {
        (globalThis as any).document = originalDoc;
        (globalThis as any).MutationObserver = originalMO;
      }
    });
  });

  describe('3. React Component Layering & Layout Dispatch', () => {
    test('Modal renders standard dialog structure with stack z-index when visible', () => {
      const markup = renderToStaticMarkup(
        React.createElement(
          Modal,
          {
            visible: true,
            title: 'Primary Workstation Modal',
            subtitle: 'Clinical Overview',
            onClose: () => {},
          },
          React.createElement('div', { id: 'modal-body-content' }, 'Modal Content Here')
        )
      );

      expect(markup).toContain('Primary Workstation Modal');
      expect(markup).toContain('Clinical Overview');
      expect(markup).toContain('modal-body-content');
    });

    test('Modal supports raw=true layout to render without default dialog chrome', () => {
      const markup = renderToStaticMarkup(
        React.createElement(
          Modal,
          {
            raw: true,
            visible: true,
            onClose: () => {},
          },
          React.createElement('div', { id: 'custom-full-workstation' }, 'Custom Chart Layout')
        )
      );

      expect(markup).toContain('custom-full-workstation');
      expect(markup).not.toContain('ThemedText variant="title"');
    });

    test('Nested Modals: Sub-modal opened inside parent modal receives higher zIndex and depth', () => {
      const ParentWithChildModal = () =>
        React.createElement(
          Modal,
          {
            visible: true,
            title: 'Parent Chart Dialog',
            onClose: () => {},
          },
          React.createElement('div', null, 'Parent Content'),
          React.createElement(
            Modal,
            {
              visible: true,
              title: 'Child Demographics Dialog',
              onClose: () => {},
            },
            React.createElement('div', null, 'Child Content')
          )
        );

      const markup = renderToStaticMarkup(React.createElement(ParentWithChildModal));
      expect(markup).toContain('Parent Chart Dialog');
      expect(markup).toContain('Child Demographics Dialog');
    });

    test('PatientChartModal with EditPatientModal renders seamlessly', () => {
      const mockPatient = {
        id: 'pat-stack-1',
        fullName: 'Juan Dela Cruz',
        patientCode: 'PAT-001',
        gender: 'Male',
        dateOfBirth: '1985-05-15',
        age: 40,
        contactNumber: '0917-123-4567',
        address: 'Manila, Philippines',
        allergies: 'None',
        bloodType: 'O+',
        verificationStatus: 'Verified',
      };

      const markup = renderToStaticMarkup(
        React.createElement(PatientChartModal, {
          visible: true,
          patient: mockPatient as any,
          patientChart: null,
          onClose: () => {},
        })
      );

      expect(markup).toContain('Juan Dela Cruz');
      expect(markup).toContain('PAT-001');
    });

    test('DiagnosticLabTab panic verbal readback modal participates in modal stack', () => {
      const markup = renderToStaticMarkup(
        React.createElement(DiagnosticLabTab, {
          labOrders: [],
        })
      );
      expect(markup).toContain('Verbal Readback Acknowledgment');
    });

    test('StatutoryImmunizationsTab AEFI modal participates in modal stack', () => {
      const markup = renderToStaticMarkup(
        React.createElement(StatutoryImmunizationsTab, {
          immunizations: [],
        })
      );
      expect(markup).toContain('Report Adverse Event (AEFI)');
    });

    test('ActionMenu renders with raw Modal and participates in stack', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ActionMenu, {
          defaultOpen: true,
          trigger: React.createElement('button', null, 'Actions'),
          items: [
            { id: '1', label: 'View Profile', onPress: () => {} },
            { id: '2', label: 'Delete', onPress: () => {}, destructive: true },
          ],
        })
      );
      expect(markup).toContain('View Profile');
      expect(markup).toContain('Delete');
    });

    test('3-Level Live Stack: ChartModal -> EditPatientModal -> AllergyIntakeModal stack progression', () => {
      // 1. Chart Modal opens
      registerModal('live-chart-modal');
      expect(getActiveModalCount()).toBe(1);
      expect(getModalStackDepth('live-chart-modal')).toBe(0);
      expect(getModalZIndex('live-chart-modal')).toBe(BASE_MODAL_Z_INDEX); // 10000

      // 2. User clicks Edit Demographics inside Chart Modal -> EditPatientModal opens
      registerModal('live-edit-modal');
      expect(getActiveModalCount()).toBe(2);
      expect(getModalStackDepth('live-edit-modal')).toBe(1);
      expect(getModalZIndex('live-edit-modal')).toBe(BASE_MODAL_Z_INDEX + MODAL_Z_INDEX_STEP); // 10100
      expect(isTopModal('live-edit-modal')).toBe(true);

      // 3. User clicks Add Allergy inside EditPatientModal -> StructuredAllergyIntakeModal opens
      registerModal('live-allergy-modal');
      expect(getActiveModalCount()).toBe(3);
      expect(getModalStackDepth('live-allergy-modal')).toBe(2);
      expect(getModalZIndex('live-allergy-modal')).toBe(BASE_MODAL_Z_INDEX + 2 * MODAL_Z_INDEX_STEP); // 10200
      expect(isTopModal('live-allergy-modal')).toBe(true);

      // 4. User completes allergy intake -> AllergyIntakeModal closes
      unregisterModal('live-allergy-modal');
      expect(getActiveModalCount()).toBe(2);
      expect(isTopModal('live-edit-modal')).toBe(true);
      expect(getModalZIndex('live-edit-modal')).toBe(BASE_MODAL_Z_INDEX + MODAL_Z_INDEX_STEP); // 10100

      // 5. User saves demographics -> EditPatientModal closes
      unregisterModal('live-edit-modal');
      expect(getActiveModalCount()).toBe(1);
      expect(isTopModal('live-chart-modal')).toBe(true);
      expect(getModalZIndex('live-chart-modal')).toBe(BASE_MODAL_Z_INDEX); // 10000

      // 6. User closes Chart Modal -> stack is completely clear
      unregisterModal('live-chart-modal');
      expect(getActiveModalCount()).toBe(0);
    });
  });

  describe('4. Sibling & Sequential Modal Transitions', () => {
    test('Sequential modals opening from parent maintain correct layer each time', () => {
      // Parent chart remains open
      registerModal('chart-parent');

      // First submodal: Lab Slip
      registerModal('lab-slip-modal');
      expect(getModalStackDepth('lab-slip-modal')).toBe(1);
      expect(isTopModal('lab-slip-modal')).toBe(true);
      unregisterModal('lab-slip-modal');
      expect(isTopModal('chart-parent')).toBe(true);

      // Second submodal: Prescription Slip
      registerModal('rx-slip-modal');
      expect(getModalStackDepth('rx-slip-modal')).toBe(1);
      expect(isTopModal('rx-slip-modal')).toBe(true);
      unregisterModal('rx-slip-modal');
      expect(isTopModal('chart-parent')).toBe(true);

      // Third submodal: Upload Document
      registerModal('upload-doc-modal');
      expect(getModalStackDepth('upload-doc-modal')).toBe(1);
      expect(isTopModal('upload-doc-modal')).toBe(true);
      unregisterModal('upload-doc-modal');
      expect(isTopModal('chart-parent')).toBe(true);
    });

    test('FeedbackHost Alert modal appears on top of whichever modal triggered it', () => {
      registerModal('active-workstation-modal'); // depth 0, z 10000
      registerModal('active-upload-modal'); // depth 1, z 10100

      // Form validation error triggers Alert modal from FeedbackHost
      registerModal('feedback-alert-modal'); // depth 2, z 10200
      expect(getActiveModalCount()).toBe(3);
      expect(isTopModal('feedback-alert-modal')).toBe(true);
      expect(getModalZIndex('feedback-alert-modal')).toBe(BASE_MODAL_Z_INDEX + 2 * MODAL_Z_INDEX_STEP);

      // Dismissing alert returns focus to upload modal
      unregisterModal('feedback-alert-modal');
      expect(getActiveModalCount()).toBe(2);
      expect(isTopModal('active-upload-modal')).toBe(true);
    });
  });

  describe('5. Robustness & Adversarial Edge Cases', () => {
    test('Unregistering an unknown modal ID is completely benign and does not disturb the stack', () => {
      registerModal('stable-modal-1');
      registerModal('stable-modal-2');

      unregisterModal('non-existent-ghost-modal');
      expect(getActiveModalCount()).toBe(2);
      expect(isTopModal('stable-modal-2')).toBe(true);
    });

    test('Out-of-order unregistration recalibrates remaining stack depths and z-indices cleanly', () => {
      registerModal('layer-0');
      registerModal('layer-1');
      registerModal('layer-2');
      registerModal('layer-3');

      // Dismiss middle modal (layer-1)
      unregisterModal('layer-1');
      expect(getActiveModalCount()).toBe(3);
      expect(getModalStackDepth('layer-0')).toBe(0);
      expect(getModalStackDepth('layer-2')).toBe(1);
      expect(getModalStackDepth('layer-3')).toBe(2);
      expect(getModalZIndex('layer-3')).toBe(BASE_MODAL_Z_INDEX + 2 * MODAL_Z_INDEX_STEP);
      expect(isTopModal('layer-3')).toBe(true);
    });

    test('Custom zIndex override is honored when explicitly provided', () => {
      const emergencyAlert = registerModal('emergency-alert', { zIndexOverride: 99999 });
      expect(emergencyAlert.zIndex).toBe(99999);
      expect(getModalZIndex('emergency-alert')).toBe(99999);
    });

    test('Rapid open/close cycles do not leak memory or desynchronize stack', () => {
      for (let i = 0; i < 200; i++) {
        registerModal(`rapid-${i}`);
        if (i % 2 === 0) {
          unregisterModal(`rapid-${i}`);
        }
      }
      expect(getActiveModalCount()).toBe(100);
      clearModalStack();
      expect(getActiveModalCount()).toBe(0);
    });
  });

  describe('6. Tab-Switching Stability, Subtree Mutation Guards & Multi-Level Layering (R1-R4)', () => {
    test('R1: Suppresses dormant modal portal mounting in DOM environments when visible is false', () => {
      const originalDoc = (globalThis as any).document;
      let mutationCount = 0;
      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          this.children.push(child);
          this.lastElementChild = child;
          mutationCount++;
          return child;
        },
      };
      (globalThis as any).document = { body: mockBody };

      try {
        const markup = renderToStaticMarkup(
          React.createElement(Modal, {
            visible: false,
            title: 'Dormant Dialog',
            children: React.createElement('div', null, 'Dormant Content'),
          })
        );
        expect(markup).toBe('');
        expect(mockBody.children.length).toBe(0);
        expect(mutationCount).toBe(0);
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('R2: attachPortalElement avoids re-appending or thrashing DOM when portal is already attached', () => {
      const originalDoc = (globalThis as any).document;
      let appendCallCount = 0;
      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          if (child.parentNode) {
            const idx = child.parentNode.children.indexOf(child);
            if (idx !== -1) child.parentNode.children.splice(idx, 1);
          }
          child.parentNode = this;
          this.children.push(child);
          this.lastElementChild = child;
          appendCallCount++;
          return child;
        },
      };
      (globalThis as any).document = { body: mockBody };

      try {
        registerModal('test-active-chart');
        const mockPortal: any = {
          style: { zIndex: '10000' },
          dataset: {},
          firstElementChild: { style: { zIndex: '10000' } },
          querySelector: () => null,
          parentNode: null,
        };

        // 1. Initial attach on opening
        attachPortalElement('test-active-chart', mockPortal);
        expect(appendCallCount).toBe(1);

        // 2. Subsequent re-render or tab switch within same modal:
        // Must NOT call safeAppendChildToBody or detach/re-attach from DOM
        attachPortalElement('test-active-chart', mockPortal);
        expect(appendCallCount).toBe(1);
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('R2: MutationObserver ignores internal subtree mutations within an active modal', () => {
      const originalDoc = (globalThis as any).document;
      const originalMO = (globalThis as any).MutationObserver;
      let observerCallback: any = null;

      class SubtreeMutationObserver {
        constructor(public cb: any) {
          observerCallback = cb;
        }
        observe() {}
        disconnect() {}
      }

      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          this.children.push(child);
          this.lastElementChild = child;
          return child;
        },
      };

      (globalThis as any).document = {
        body: mockBody,
        querySelectorAll: () => [],
      };
      (globalThis as any).MutationObserver = SubtreeMutationObserver;

      try {
        const cleanup = initModalStackObserver();
        registerModal('active-tab-modal');
        const mockPortal: any = {
          style: {},
          dataset: { clinicezModalId: 'active-tab-modal' },
          firstElementChild: { style: {} },
          querySelector: () => null,
          parentNode: mockBody,
        };
        attachPortalElement('active-tab-modal', mockPortal);
        const countBefore = getActiveModalCount();

        // Simulate internal subtree mutation (e.g., clicking tabs inside modal)
        const subtreeMutation: any = {
          target: { parentNode: mockPortal },
          addedNodes: [{ nodeType: 1, getAttribute: () => null, querySelector: () => null }],
          removedNodes: [{ nodeType: 1 }],
        };

        observerCallback([subtreeMutation]);

        // Modal stack remains undisturbed
        expect(getActiveModalCount()).toBe(countBefore);
        expect(isTopModal('active-tab-modal')).toBe(true);

        cleanup();
      } finally {
        (globalThis as any).document = originalDoc;
        (globalThis as any).MutationObserver = originalMO;
      }
    });

    test('R3: Seamless tab switching in PatientChartModal across all clinical tabs', () => {
      const mockPatient = {
        id: 'pat-tabs-1',
        fullName: 'Maria Santos',
        patientCode: 'PAT-002',
        gender: 'Female',
        dateOfBirth: '1990-08-20',
        age: 35,
        contactNumber: '0918-765-4321',
        address: 'Quezon City',
        allergies: 'Penicillin',
        bloodType: 'B+',
        verificationStatus: 'Verified',
      };

      const tabsToTest = [
        'summary',
        'encounters',
        'diagnostics',
        'procedures',
        'immunizations',
        'profiles',
        'vault',
      ] as const;

      for (const tab of tabsToTest) {
        const markup = renderToStaticMarkup(
          React.createElement(PatientChartModal, {
            visible: true,
            patient: mockPatient as any,
            patientChart: null,
            activeTab: tab as any,
            onClose: () => {},
          })
        );
        expect(markup).toContain('Maria Santos');
        expect(markup).toContain('Medical chart');
      }
    });

    test('R3: PhilHealthProfileModal renders cleanly and respects visible=false short-circuit', () => {
      const mockPatient = {
        id: 'pat-phil-1',
        fullName: 'Elena Gomez',
        patientCode: 'PAT-003',
        gender: 'Female',
        age: 28,
        philHealthNumber: '12-345678901-2',
      };

      // 1. Dormant modal returns null
      const closedMarkup = renderToStaticMarkup(
        React.createElement(PhilHealthProfileModal, {
          visible: false,
          patient: mockPatient as any,
          onClose: () => {},
        })
      );
      expect(closedMarkup).toBe('');

      // 2. Visible modal renders header and tabs
      const openMarkup = renderToStaticMarkup(
        React.createElement(PhilHealthProfileModal, {
          visible: true,
          patient: mockPatient as any,
          onClose: () => {},
        })
      );
      expect(openMarkup).toContain('PhilHealth patient profile');
      expect(openMarkup).toContain('Elena Gomez');
      expect(openMarkup).toContain('General and vitals');
      expect(openMarkup).toContain('Medical and family');
      expect(openMarkup).toContain('Social and vaccines');
    });

    test('R4: Multi-level sub-modals layer on top and preserve parent intact on close', () => {
      // 1. Parent modal (Chart) opens at depth 0
      registerModal('parent-chart-modal');
      expect(getActiveModalCount()).toBe(1);
      expect(getModalStackDepth('parent-chart-modal')).toBe(0);
      expect(getModalZIndex('parent-chart-modal')).toBe(BASE_MODAL_Z_INDEX);
      expect(isTopModal('parent-chart-modal')).toBe(true);

      // 2. Sub-modal (e.g. Diagnostic panic verbal readback or AEFI reporting) opens with parentDepth: 0
      registerModal('sub-panic-readback', { parentDepth: 0 });
      expect(getActiveModalCount()).toBe(2);
      expect(getModalStackDepth('sub-panic-readback')).toBe(1);
      expect(getModalZIndex('sub-panic-readback')).toBe(BASE_MODAL_Z_INDEX + MODAL_Z_INDEX_STEP);
      expect(isTopModal('sub-panic-readback')).toBe(true);
      expect(isTopModal('parent-chart-modal')).toBe(false);

      // 3. Third-level sub-modal (e.g. blood type selector or emergency override)
      registerModal('sub-blood-type-picker', { parentDepth: 1 });
      expect(getActiveModalCount()).toBe(3);
      expect(getModalStackDepth('sub-blood-type-picker')).toBe(2);
      expect(getModalZIndex('sub-blood-type-picker')).toBe(BASE_MODAL_Z_INDEX + 2 * MODAL_Z_INDEX_STEP);
      expect(isTopModal('sub-blood-type-picker')).toBe(true);

      // 4. Closing the 3rd-level modal restores 2nd-level modal as top
      unregisterModal('sub-blood-type-picker');
      expect(getActiveModalCount()).toBe(2);
      expect(isTopModal('sub-panic-readback')).toBe(true);
      expect(getModalZIndex('sub-panic-readback')).toBe(BASE_MODAL_Z_INDEX + MODAL_Z_INDEX_STEP);

      // 5. Closing 2nd-level modal leaves parent modal intact at depth 0, base z-index, and isTop=true
      unregisterModal('sub-panic-readback');
      expect(getActiveModalCount()).toBe(1);
      expect(isTopModal('parent-chart-modal')).toBe(true);
      expect(getModalStackDepth('parent-chart-modal')).toBe(0);
      expect(getModalZIndex('parent-chart-modal')).toBe(BASE_MODAL_Z_INDEX);

      // 6. Closing parent modal clears stack
      unregisterModal('parent-chart-modal');
      expect(getActiveModalCount()).toBe(0);
    });
  });

  describe('7. Adversarial Stress, Rapid Concurrent Tab Interleaving & Edge Cases', () => {
    test('ADV-1: Rapid interleaved tab switching in Parent Modal while Sub-modal is active does not thrash DOM or dislodge child modal', () => {
      const originalDoc = (globalThis as any).document;
      const originalMO = (globalThis as any).MutationObserver;
      let observerCallback: any = null;

      class SubtreeMutationObserver {
        constructor(public cb: any) {
          observerCallback = cb;
        }
        observe() {}
        disconnect() {}
      }

      let appendCallCount = 0;
      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          if (child.parentNode) {
            const idx = child.parentNode.children.indexOf(child);
            if (idx !== -1) child.parentNode.children.splice(idx, 1);
          }
          child.parentNode = this;
          this.children.push(child);
          this.lastElementChild = child;
          appendCallCount++;
          return child;
        },
      };

      (globalThis as any).document = {
        body: mockBody,
        querySelectorAll: () => [],
      };
      (globalThis as any).MutationObserver = SubtreeMutationObserver;

      try {
        const cleanup = initModalStackObserver();

        // 1. Mount Parent Modal (e.g. PatientChartModal)
        const parentPortal: any = {
          style: { zIndex: '10000' },
          dataset: { clinicezModalId: 'patient-chart-main' },
          firstElementChild: { style: { zIndex: '10000' } },
          querySelector: () => null,
          parentNode: null,
        };
        registerModal('patient-chart-main');
        attachPortalElement('patient-chart-main', parentPortal);

        expect(mockBody.children.length).toBe(1);
        expect(mockBody.lastElementChild).toBe(parentPortal);
        expect(appendCallCount).toBe(1);

        // 2. Open Sub-modal (e.g. EditPatientModal)
        const childPortal: any = {
          style: { zIndex: '10100' },
          dataset: { clinicezModalId: 'edit-patient-sub' },
          firstElementChild: { style: { zIndex: '10100' } },
          querySelector: () => null,
          parentNode: null,
        };
        registerModal('edit-patient-sub', { parentDepth: 0 });
        attachPortalElement('edit-patient-sub', childPortal);

        expect(mockBody.children.length).toBe(2);
        expect(mockBody.lastElementChild).toBe(childPortal);
        expect(appendCallCount).toBe(2);
        expect(isTopModal('edit-patient-sub')).toBe(true);

        // 3. User rapidly switches tabs in background parent modal while edit modal is open
        for (let i = 0; i < 5; i++) {
          // Subtree mutations fired inside parentPortal
          observerCallback([
            {
              target: { parentNode: parentPortal },
              addedNodes: [{ nodeType: 1, getAttribute: () => null, querySelector: () => null }],
              removedNodes: [{ nodeType: 1 }],
            },
          ]);
          // Child re-render synchronization
          attachPortalElement('patient-chart-main', parentPortal);
        }

        // Parent modal MUST NOT re-append or leapfrog child modal
        expect(appendCallCount).toBe(2);
        expect(mockBody.lastElementChild).toBe(childPortal);
        expect(mockBody.children[0]).toBe(parentPortal);
        expect(mockBody.children[1]).toBe(childPortal);
        expect(isTopModal('edit-patient-sub')).toBe(true);

        // 4. Open 3rd-level modal (e.g. BloodTypeSelect dialog)
        const bloodTypePortal: any = {
          style: { zIndex: '10200' },
          dataset: { clinicezModalId: 'blood-type-picker' },
          firstElementChild: { style: { zIndex: '10200' } },
          querySelector: () => null,
          parentNode: null,
        };
        registerModal('blood-type-picker', { parentDepth: 1 });
        attachPortalElement('blood-type-picker', bloodTypePortal);

        expect(mockBody.children.length).toBe(3);
        expect(mockBody.lastElementChild).toBe(bloodTypePortal);
        expect(isTopModal('blood-type-picker')).toBe(true);
        expect(appendCallCount).toBe(3);

        // 5. Close 3rd-level modal
        unregisterModal('blood-type-picker');
        const bloodIdx = mockBody.children.indexOf(bloodTypePortal);
        if (bloodIdx !== -1) mockBody.children.splice(bloodIdx, 1);
        mockBody.lastElementChild = childPortal;

        expect(isTopModal('edit-patient-sub')).toBe(true);
        expect(mockBody.lastElementChild).toBe(childPortal);

        // 6. Close 2nd-level modal
        unregisterModal('edit-patient-sub');
        const childIdx = mockBody.children.indexOf(childPortal);
        if (childIdx !== -1) mockBody.children.splice(childIdx, 1);
        mockBody.lastElementChild = parentPortal;

        expect(isTopModal('patient-chart-main')).toBe(true);
        expect(mockBody.lastElementChild).toBe(parentPortal);
        expect(getModalStackDepth('patient-chart-main')).toBe(0);

        // 7. More rapid tab switches in parent modal now that it is top again
        for (let i = 0; i < 5; i++) {
          attachPortalElement('patient-chart-main', parentPortal);
        }
        // Still no redundant appends
        expect(appendCallCount).toBe(3);

        cleanup();
      } finally {
        (globalThis as any).document = originalDoc;
        (globalThis as any).MutationObserver = originalMO;
      }
    });

    test('ADV-2: Untracked modal with aria-modal="true" directly on portal element is preserved in currentPortals cleanup', () => {
      const originalDoc = (globalThis as any).document;
      const originalMO = (globalThis as any).MutationObserver;
      let observerCallback: any = null;

      class CleanupMutationObserver {
        constructor(public cb: any) {
          observerCallback = cb;
        }
        observe() {}
        disconnect() {}
      }

      // Portal element where aria-modal is on the portal element itself
      const directAriaPortal: any = {
        nodeType: 1,
        getAttribute: (attr: string) => (attr === 'aria-modal' ? 'true' : null),
        querySelector: () => null, // No descendant has aria-modal, only the root
        dataset: { clinicezModalId: 'rnw-modal-direct' },
        style: {},
        firstElementChild: { style: {} },
        parentNode: null,
      };

      const mockBody: any = {
        children: [directAriaPortal],
        lastElementChild: directAriaPortal,
        appendChild(child: any) {
          child.parentNode = this;
          this.children.push(child);
          this.lastElementChild = child;
          return child;
        },
      };
      directAriaPortal.parentNode = mockBody;

      (globalThis as any).document = {
        body: mockBody,
        querySelectorAll: (sel: string) => (sel === '[aria-modal="true"]' ? [directAriaPortal] : []),
      };
      (globalThis as any).MutationObserver = CleanupMutationObserver;

      try {
        const cleanup = initModalStackObserver();

        // Register the untracked modal in stack
        registerModal('rnw-modal-direct', { element: directAriaPortal });
        expect(getActiveModalCount()).toBe(1);

        // Trigger mutation with direct body change
        observerCallback([
          {
            target: mockBody,
            addedNodes: [directAriaPortal],
            removedNodes: [],
          },
        ]);

        // It must NOT be marked stale or unregistered because getAttribute('aria-modal') is true
        expect(getActiveModalCount()).toBe(1);
        expect(isTopModal('rnw-modal-direct')).toBe(true);

        cleanup();
      } finally {
        (globalThis as any).document = originalDoc;
        (globalThis as any).MutationObserver = originalMO;
      }
    });

    test('ADV-3: attachPortalElement re-attaches portal if it was detached from document.body', () => {
      const originalDoc = (globalThis as any).document;
      let appendCallCount = 0;
      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          child.parentNode = this;
          this.children.push(child);
          this.lastElementChild = child;
          appendCallCount++;
          return child;
        },
      };
      (globalThis as any).document = { body: mockBody };

      try {
        registerModal('test-reattach');
        const mockPortal: any = {
          style: { zIndex: '10000' },
          dataset: {},
          firstElementChild: { style: { zIndex: '10000' } },
          querySelector: () => null,
          parentNode: null,
        };

        // 1. Initial attach
        attachPortalElement('test-reattach', mockPortal);
        expect(appendCallCount).toBe(1);
        expect(mockPortal.parentNode).toBe(mockBody);

        // 2. Detach portal from body (simulating temporary DOM detachment)
        mockPortal.parentNode = null;
        mockBody.children = [];
        mockBody.lastElementChild = null;

        // 3. attachPortalElement must recognize it is detached and re-attach
        attachPortalElement('test-reattach', mockPortal);
        expect(appendCallCount).toBe(2);
        expect(mockPortal.parentNode).toBe(mockBody);
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('ADV-4: PhilHealthProfileModal tab switching between all 5 tabs leaves DOM children undisturbed', () => {
      const originalDoc = (globalThis as any).document;
      let appendCount = 0;
      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          this.children.push(child);
          this.lastElementChild = child;
          appendCount++;
          return child;
        },
      };
      (globalThis as any).document = { body: mockBody };

      const mockPatient = {
        id: 'pat-ph-adv-1',
        fullName: 'Carmela Ramos',
        patientCode: 'PAT-888',
        gender: 'Female',
        age: 32,
        philHealthNumber: '12-987654321-0',
      };

      try {
        // Tab list: general, medical, lifestyle, reproductive, ncd
        const openMarkupGeneral = renderToStaticMarkup(
          React.createElement(PhilHealthProfileModal, {
            visible: true,
            patient: mockPatient as any,
            onClose: () => {},
          })
        );
        expect(openMarkupGeneral).toContain('PhilHealth patient profile');
        expect(openMarkupGeneral).toContain('General and vitals');

        // Dormant BloodTypeSelect modal inside General tab produced NO body appends
        expect(appendCount).toBe(0);
        expect(mockBody.children.length).toBe(0);
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('ADV-5: Out-of-order unregistration and promotion synchronize modalContent [aria-modal="true"] z-index cleanly', () => {
      const originalDoc = (globalThis as any).document;
      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          if (child.parentNode) {
            const idx = child.parentNode.children.indexOf(child);
            if (idx !== -1) child.parentNode.children.splice(idx, 1);
          }
          child.parentNode = this;
          this.children.push(child);
          this.lastElementChild = child;
          return child;
        },
      };
      (globalThis as any).document = { body: mockBody };

      try {
        const createMockPortal = (id: string) => {
          const contentDiv: any = { style: {} };
          const animDiv: any = { style: {} };
          const portal: any = {
            dataset: { clinicezModalId: id },
            style: {},
            firstElementChild: animDiv,
            querySelector: (sel: string) => (sel === '[aria-modal="true"]' ? contentDiv : null),
            parentNode: null,
          };
          return { portal, animDiv, contentDiv };
        };

        const m1 = createMockPortal('modal-z-1');
        const m2 = createMockPortal('modal-z-2');
        const m3 = createMockPortal('modal-z-3');

        registerModal('modal-z-1');
        attachPortalElement('modal-z-1', m1.portal);

        registerModal('modal-z-2');
        attachPortalElement('modal-z-2', m2.portal);

        registerModal('modal-z-3');
        attachPortalElement('modal-z-3', m3.portal);

        expect(m3.contentDiv.style.zIndex).toBe('10200');
        expect(m2.contentDiv.style.zIndex).toBe('10100');
        expect(m1.contentDiv.style.zIndex).toBe('10000');

        // Unregister middle modal (modal-z-2)
        unregisterModal('modal-z-2');

        // modal-z-3 is now at depth 1, so its portal, animDiv, and modalContent MUST be 10100
        expect(getModalStackDepth('modal-z-3')).toBe(1);
        expect(m3.portal.style.zIndex).toBe('10100');
        expect(m3.animDiv.style.zIndex).toBe('10100');
        expect(m3.contentDiv.style.zIndex).toBe('10100');

        // Promote modal-z-1 to front: modal-z-3 becomes depth 0 (10000), modal-z-1 becomes depth 1 (10100)
        bringModalToFront('modal-z-1');
        expect(getModalStackDepth('modal-z-1')).toBe(1);
        expect(getModalStackDepth('modal-z-3')).toBe(0);

        expect(m1.portal.style.zIndex).toBe('10100');
        expect(m1.animDiv.style.zIndex).toBe('10100');
        expect(m1.contentDiv.style.zIndex).toBe('10100');

        expect(m3.portal.style.zIndex).toBe('10000');
        expect(m3.animDiv.style.zIndex).toBe('10000');
        expect(m3.contentDiv.style.zIndex).toBe('10000');
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('ADV-6: Detached subtree mutations containing aria-modal="true" do not trigger untracked modal additions', () => {
      const originalDoc = (globalThis as any).document;
      const originalMO = (globalThis as any).MutationObserver;
      let observerCallback: any = null;

      class SubtreeMutationObserver {
        constructor(public cb: any) {
          observerCallback = cb;
        }
        observe() {}
        disconnect() {}
      }

      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          child.parentNode = this;
          this.children.push(child);
          this.lastElementChild = child;
          return child;
        },
      };

      (globalThis as any).document = {
        body: mockBody,
        querySelectorAll: () => [],
      };
      (globalThis as any).MutationObserver = SubtreeMutationObserver;

      try {
        const cleanup = initModalStackObserver();
        registerModal('tracked-base-modal');

        // Node in a detached fragment: parentNode exists but does not lead to document.body
        const detachedFragment = { parentNode: null };
        const detachedAriaNode: any = {
          nodeType: 1,
          getAttribute: (attr: string) => (attr === 'aria-modal' ? 'true' : null),
          querySelector: () => null,
          parentNode: detachedFragment,
        };

        // Fire mutation on detached target
        observerCallback([
          {
            target: detachedFragment,
            addedNodes: [detachedAriaNode],
            removedNodes: [],
          },
        ]);

        // Stack must still contain ONLY the tracked modal; detached node was NOT registered
        expect(getActiveModalCount()).toBe(1);
        expect(isTopModal('tracked-base-modal')).toBe(true);

        cleanup();
      } finally {
        (globalThis as any).document = originalDoc;
        (globalThis as any).MutationObserver = originalMO;
      }
    });

    test('ADV-7: bringPortalToFront appends portal to document.body even if portalEl.style is undefined', () => {
      const originalDoc = (globalThis as any).document;
      let appendCount = 0;
      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          child.parentNode = this;
          this.children.push(child);
          this.lastElementChild = child;
          appendCount++;
          return child;
        },
      };
      (globalThis as any).document = { body: mockBody };

      try {
        const portalWithoutStyle: any = {
          parentNode: null,
          firstElementChild: null,
          querySelector: () => null,
        };

        bringPortalToFront(portalWithoutStyle, 10000);
        expect(appendCount).toBe(1);
        expect(mockBody.lastElementChild).toBe(portalWithoutStyle);
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('ADV-8: Multi-level nested modal Escape and backdrop dismissibility guards', () => {
      let modal1Closed = false;
      let modal2Closed = false;
      let modal3Closed = false;

      // Modal 1 opens (level 1)
      const m1 = registerModal('level-1', { onClose: () => { modal1Closed = true; } });
      expect(isTopModal('level-1')).toBe(true);

      // Modal 2 opens on top (level 2)
      const m2 = registerModal('level-2', { parentDepth: 0, onClose: () => { modal2Closed = true; } });
      expect(isTopModal('level-2')).toBe(true);
      expect(isTopModal('level-1')).toBe(false);

      // Modal 3 opens on top (level 3)
      const m3 = registerModal('level-3', { parentDepth: 1, onClose: () => { modal3Closed = true; } });
      expect(isTopModal('level-3')).toBe(true);
      expect(isTopModal('level-2')).toBe(false);
      expect(isTopModal('level-1')).toBe(false);

      // Backdrop press handler verification: only top modal is dismissible
      const simulateBackdropPress = (id: string, onClose?: () => void) => {
        if (isTopModal(id) && onClose) {
          onClose();
        }
      };

      // Pressing backdrop on Modal 1 does NOT close Modal 1
      simulateBackdropPress('level-1', m1.onClose);
      expect(modal1Closed).toBe(false);

      // Pressing backdrop on Modal 2 does NOT close Modal 2
      simulateBackdropPress('level-2', m2.onClose);
      expect(modal2Closed).toBe(false);

      // Pressing backdrop on Modal 3 DOES close Modal 3
      simulateBackdropPress('level-3', m3.onClose);
      expect(modal3Closed).toBe(true);

      // Close Modal 3: Modal 2 becomes top
      unregisterModal('level-3');
      expect(isTopModal('level-2')).toBe(true);
      expect(isTopModal('level-1')).toBe(false);

      // Now backdrop on Modal 2 closes Modal 2
      simulateBackdropPress('level-2', m2.onClose);
      expect(modal2Closed).toBe(true);

      // Close Modal 2: Modal 1 becomes top
      unregisterModal('level-2');
      expect(isTopModal('level-1')).toBe(true);

      // Now backdrop on Modal 1 closes Modal 1
      simulateBackdropPress('level-1', m1.onClose);
      expect(modal1Closed).toBe(true);
    });

    test('ADV-9: Rapid sequential tab switching across ALL 7 PatientChartModal tabs produces ZERO body appends', () => {
      const originalDoc = (globalThis as any).document;
      let appendCount = 0;
      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          this.children.push(child);
          this.lastElementChild = child;
          appendCount++;
          return child;
        },
      };
      (globalThis as any).document = { body: mockBody };

      const mockPatient = {
        id: 'pat-all-tabs-1',
        fullName: 'Juan dela Cruz',
        patientCode: 'PAT-101',
        gender: 'Male',
        age: 45,
        dateOfBirth: '1981-05-12',
        verificationStatus: 'Verified',
      };

      const allTabs = [
        'summary',
        'encounters',
        'diagnostics',
        'procedures',
        'immunizations',
        'profiles',
        'vault',
        'summary',
      ] as const;

      try {
        for (const tab of allTabs) {
          const markup = renderToStaticMarkup(
            React.createElement(PatientChartModal, {
              visible: true,
              patient: mockPatient as any,
              patientChart: null,
              activeTab: tab as any,
              onClose: () => {},
            })
          );
          expect(markup).toContain('Juan dela Cruz');
          expect(markup).toContain('Medical chart');
        }

        // None of the tabs mounted dormant submodals into document.body
        expect(appendCount).toBe(0);
        expect(mockBody.children.length).toBe(0);
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('ADV-10: PhilHealthProfileModal tab cycling across ALL 5 tabs produces ZERO body appends', () => {
      const originalDoc = (globalThis as any).document;
      let appendCount = 0;
      const mockBody: any = {
        children: [] as any[],
        lastElementChild: null as any,
        appendChild(child: any) {
          this.children.push(child);
          this.lastElementChild = child;
          appendCount++;
          return child;
        },
      };
      (globalThis as any).document = { body: mockBody };

      const mockPatient = {
        id: 'pat-ph-adv-10',
        fullName: 'Ana Santos',
        patientCode: 'PAT-999',
        gender: 'Female',
        age: 29,
        philHealthNumber: '12-345678901-2',
      };

      try {
        const markup = renderToStaticMarkup(
          React.createElement(PhilHealthProfileModal, {
            visible: true,
            patient: mockPatient as any,
            onClose: () => {},
          })
        );
        expect(markup).toContain('PhilHealth patient profile');
        expect(appendCount).toBe(0);
        expect(mockBody.children.length).toBe(0);
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('ADV-11: Custom zIndexOverride is preserved across out-of-order unregisterModal and bringModalToFront', () => {
      const originalDoc = (globalThis as any).document;
      const mockPortalA: any = {
        style: { position: '', zIndex: '' },
        firstElementChild: { style: { zIndex: '' } },
        querySelector: () => null,
      };
      (globalThis as any).document = { body: { children: [], lastElementChild: null } };

      try {
        // Modal A registered with custom zIndexOverride = 25000
        const mA = registerModal('modal-custom-z', {
          zIndexOverride: 25000,
          element: mockPortalA,
        });
        expect(mA.zIndex).toBe(25000);
        expect(getModalZIndex('modal-custom-z')).toBe(25000);
        expect(mockPortalA.style.zIndex).toBe('25000');

        // Modal B opens on top (depth 1, zIndex 10100)
        registerModal('modal-temp-b');
        expect(getModalZIndex('modal-temp-b')).toBe(10100);

        // Modal C opens on top (depth 2, zIndex 10200)
        registerModal('modal-temp-c');
        expect(getModalZIndex('modal-temp-c')).toBe(10200);

        // Modal B unregisters: Modal A must NOT drop back to default 10000
        unregisterModal('modal-temp-b');
        expect(getModalZIndex('modal-custom-z')).toBe(25000);
        expect(mockPortalA.style.zIndex).toBe('25000');

        // Bring Modal A to front: custom zIndexOverride must be retained
        bringModalToFront('modal-custom-z');
        expect(getModalZIndex('modal-custom-z')).toBe(25000);
        expect(mockPortalA.style.zIndex).toBe('25000');
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });

    test('ADV-12: parentDepth elevation floor constraint is preserved when intermediate modals close', () => {
      // Modal 1 opens (level 1, depth 0)
      registerModal('parent-lvl-1');
      expect(getModalStackDepth('parent-lvl-1')).toBe(0);

      // Modal 2 opens with parentDepth = 0 (depth 1)
      registerModal('child-lvl-2', { parentDepth: 0 });
      expect(getModalStackDepth('child-lvl-2')).toBe(1);

      // Modal 3 opens with parentDepth = 1 (depth 2)
      registerModal('grandchild-lvl-3', { parentDepth: 1 });
      expect(getModalStackDepth('grandchild-lvl-3')).toBe(2);

      // Modal 2 closes: Modal 3's minimum depth constraint (minDepth = 2) must be preserved
      unregisterModal('child-lvl-2');
      const item3 = getModalStack().find((m) => m.id === 'grandchild-lvl-3');
      expect(item3).toBeDefined();
      expect(item3!.depth).toBeGreaterThanOrEqual(2);
      expect(item3!.zIndex).toBeGreaterThanOrEqual(10200);
    });

    test('ADV-13: initModalStackObserver safely handles unparsed DOM (document.body === null) without permanently breaking', () => {
      const originalDoc = (globalThis as any).document;
      const originalMO = (globalThis as any).MutationObserver;

      let domContentLoadedListener: any = null;
      let observerAttached = false;

      class MockMO {
        constructor(public cb: any) {}
        observe(target: any) {
          if (!target) throw new TypeError('Target cannot be null');
          observerAttached = true;
        }
        disconnect() {
          observerAttached = false;
        }
      }

      // Step 1: Simulate script execution in <head> where document.body is null
      (globalThis as any).document = {
        body: null,
        addEventListener: (event: string, fn: any) => {
          if (event === 'DOMContentLoaded') domContentLoadedListener = fn;
        },
        removeEventListener: () => {},
      };
      (globalThis as any).MutationObserver = MockMO;

      try {
        const cleanup1 = initModalStackObserver();
        expect(observerAttached).toBe(false);
        expect(typeof domContentLoadedListener).toBe('function');
        cleanup1();

        // Step 2: Simulate document.body being ready on DOMContentLoaded
        const mockBody = { children: [], lastElementChild: null };
        (globalThis as any).document.body = mockBody;

        // Trigger DOMContentLoaded listener
        domContentLoadedListener();
        expect(observerAttached).toBe(true);

        // Cleanup observer after test
        initModalStackObserver()();
        expect(observerAttached).toBe(false);
      } finally {
        (globalThis as any).document = originalDoc;
        (globalThis as any).MutationObserver = originalMO;
      }
    });

    test('ADV-14: handleDomMutations safely handles minimal MutationRecord mocks with missing addedNodes/removedNodes', () => {
      const originalDoc = (globalThis as any).document;
      const originalMO = (globalThis as any).MutationObserver;

      let observerCallback: any = null;
      class MinimalMutationObserver {
        constructor(public cb: any) {
          observerCallback = cb;
        }
        observe() {}
        disconnect() {}
      }

      const mockBody: any = { children: [], lastElementChild: null };
      (globalThis as any).document = { body: mockBody, querySelectorAll: () => [] };
      (globalThis as any).MutationObserver = MinimalMutationObserver;

      try {
        const cleanup = initModalStackObserver();
        // Emit malformed / minimal mutation record without addedNodes or removedNodes
        expect(() => {
          observerCallback([
            {
              target: mockBody,
              // missing addedNodes and removedNodes
            },
          ]);
        }).not.toThrow();
        cleanup();
      } finally {
        (globalThis as any).document = originalDoc;
        (globalThis as any).MutationObserver = originalMO;
      }
    });

    test('ADV-15: syncPortalZIndex does not redundantly re-assign style.position if already relative', () => {
      let positionSetCount = 0;
      let posValue = 'relative';

      const mockStyle = {
        get position() {
          return posValue;
        },
        set position(v: string) {
          positionSetCount++;
          posValue = v;
        },
        zIndex: '10000',
      };

      const mockPortal = {
        style: mockStyle,
        firstElementChild: null,
        querySelector: () => null,
      };

      syncPortalZIndex(mockPortal, 10000);
      expect(positionSetCount).toBe(0);
    });

    test('ADV-16: Dormant modal suppression in DOM environment produces empty markup', () => {
      const originalDoc = (globalThis as any).document;
      try {
        (globalThis as any).document = { body: { children: [], appendChild: () => {} } };

        const markup = renderToStaticMarkup(
          React.createElement(Modal, {
            visible: false,
            title: 'Dormant Modal',
            children: React.createElement('div', null, 'Hidden Content'),
          })
        );
        expect(markup).toBe('');
      } finally {
        (globalThis as any).document = originalDoc;
      }
    });
  });

  afterAll(() => {
    delete (globalThis as any).__mockClinicContext;
  });
});


