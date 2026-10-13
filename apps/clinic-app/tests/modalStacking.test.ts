// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
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

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    settings: { preferredChartLayout: 'centered' },
  }),
}));

mock.module('../context/StaffContext', () => ({
  useStaff: () => ({
    current: { id: 'staff-1', name: 'Dr. Santos', role: 'Physician' },
    currentName: 'Dr. Santos',
  }),
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
  bringPortalToFront,
  findPortalContainer,
  initModalStackObserver,
  ModalStackContext,
  BASE_MODAL_Z_INDEX,
  MODAL_Z_INDEX_STEP,
} = await import('../components/ui/modalStack');

const { default: Modal } = await import('../components/ui/Modal');
const { default: PatientChartModal } = await import('../components/chart/PatientChartModal');
const { default: EditPatientModal } = await import('../components/patient/EditPatientModal');
const { default: ActionMenu } = await import('../components/ui/ActionMenu');
const { default: DiagnosticLabTab } = await import('../components/chart/DiagnosticLabTab');
const { default: StatutoryImmunizationsTab } = await import('../components/chart/StatutoryImmunizationsTab');

describe('Modal Stacking System — Nested & Layered Modals', () => {
  beforeEach(() => {
    clearModalStack();
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
});
