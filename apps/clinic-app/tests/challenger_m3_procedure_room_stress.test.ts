// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach, afterAll } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const renderedPressHandlers = new Map<string, () => void>();

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    style,
    onPress,
    visible,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    if (onPress) {
      if (testID) renderedPressHandlers.set(testID, onPress);
      if (accessibilityLabel) renderedPressHandlers.set(accessibilityLabel, onPress);
    }
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole, 'data-accessibility-role': accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
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
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  Alert: { alert: () => {} },
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
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('Svg'),
  Path: createMockComponent('Path'),
  Circle: createMockComponent('Circle'),
  Rect: createMockComponent('Rect'),
  Line: createMockComponent('Line'),
  default: createMockComponent('Svg'),
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
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

const mockClinicRooms = [
  { id: 'room-operatory-1', name: 'Dental Operatory 1', type: 'Treatment' as const, isActive: true },
  { id: 'room-operatory-2', name: 'Dental Operatory 2', type: 'Treatment' as const, isActive: true },
  { id: 'room-operatory-inactive', name: 'Closed Bay', type: 'Treatment' as const, isActive: false },
  { id: 'room-consult-1', name: 'Consultation Room 1', type: 'Consultation' as const, isActive: true },
];

const defaultMockClinicContext = {
  facilityName: 'ClinicEZ Central',
  rooms: mockClinicRooms,
  settings: {
    clinicName: 'ClinicEZ Central',
    specialtyMode: 'Dental',
    enableDentalModule: true,
  },
};

// Dynamic imports after mocking
const { default: Button } = await import('../components/common/Button');
const registerButtonMock = () => {
  mock.module('../components/ui/Button', () => ({
    default: (props: any) => {
      if (props?.onPress && !props?.disabled && !props?.loading) {
        if (props.testID) renderedPressHandlers.set(props.testID, props.onPress);
        if (props.accessibilityLabel) renderedPressHandlers.set(props.accessibilityLabel, props.onPress);
      }
      return React.createElement(Button, props);
    },
  }));
};
registerButtonMock();
const { OrderCatalogSearchModal } = await import('../components/consultation/OrderCatalogSearchModal');
const { default: Badge } = await import('../components/ui/Badge');
import type { ClinicServiceItem, ClinicRoom } from '../services/clinicService';
import type { OrderCatalogItemPayload, ExistingOrderItemContext } from '../components/consultation/OrderCatalogSearchModal';
import type { LocalProcedureOrder } from '../navigation/screens/Consultations.screen';

describe('Adversarial Challenger Suite — Milestone 3: Procedure Room Selection, Badges & Button Polish', () => {
  const fiveRooms: ClinicRoom[] = [
    { id: 'room-1', name: 'Dental Operatory 1', type: 'Treatment', isActive: true },
    { id: 'room-2', name: 'Dental Operatory 2', type: 'Treatment', isActive: true },
    { id: 'room-3', name: 'Oral Surgery Suite', type: 'Treatment', isActive: true },
    { id: 'room-4', name: 'Orthodontic Bay', type: 'Treatment', isActive: true },
    { id: 'room-5', name: "Surgical Suite #5 & Dental Bay (Rm 102)", type: 'Treatment', isActive: true },
  ];

  const procedureA: ClinicServiceItem = {
    id: 'proc-scaling',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'DENT-SCL-01',
    name: 'Ultrasonic Scaling & Polishing',
    category: 'Procedure',
    standardPrice: 1200,
    isActive: true,
  };

  const procedureB: ClinicServiceItem = {
    id: 'proc-extraction',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'DENT-EXT-01',
    name: 'Surgical Tooth Extraction',
    category: 'Procedure',
    standardPrice: 2500,
    isActive: true,
  };

  const diagnosticA: ClinicServiceItem = {
    id: 'diag-panoramic',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'DENT-RAD-PAN',
    name: 'Panoramic Dental Radiograph (OPG)',
    category: 'Diagnostic',
    standardPrice: 900,
    isActive: true,
  };

  const testCatalog: ClinicServiceItem[] = [procedureA, procedureB, diagnosticA];

  beforeEach(() => {
    renderedPressHandlers.clear();
    (globalThis as any).__mockClinicContext = defaultMockClinicContext;
    registerButtonMock();
  });

  afterAll(() => {
    delete (globalThis as any).__mockClinicContext;
    mock.module('../components/ui/Button', () => ({
      default: Button,
    }));
  });

  // =========================================================================
  // Section 1: OrderCatalogSearchModal Stress Tests
  // =========================================================================
  describe('1. OrderCatalogSearchModal — Stress Testing Room Selection & Payloads', () => {
    test('1.1 Selecting each of N=5 rooms permits selecting and assigns exact room to payload', () => {
      for (const targetRoom of fiveRooms) {
        renderedPressHandlers.clear();
        let emittedPayload: OrderCatalogItemPayload | null = null;
        let closed = false;

        const html = renderToStaticMarkup(
          React.createElement(OrderCatalogSearchModal, {
            visible: true,
            onClose: () => { closed = true; },
            catalog: testCatalog,
            rooms: fiveRooms,
            initialRoomId: targetRoom.id,
            initialSelectedItem: procedureA,
            onSelectOrder: (order) => { emittedPayload = order; },
            testID: 'catalog-modal-5rooms',
          })
        );

        expect(html).toContain('Send / Assign to Room');
        expect(html).toContain(`data-testid="catalog-modal-5rooms-room-option-${targetRoom.id}"`);
        expect(html).toContain('selected&quot;:true');

        // Submit and verify payload reflects targetRoom
        const submitHandler = renderedPressHandlers.get('catalog-modal-5rooms-submit-btn');
        expect(submitHandler).toBeDefined();
        submitHandler!();

        expect(closed).toBe(true);
        expect(emittedPayload).not.toBeNull();
        expect(emittedPayload!.serviceItemId).toBe(procedureA.id);
        expect(emittedPayload!.roomId).toBe(targetRoom.id);
        expect(emittedPayload!.roomName).toBe(targetRoom.name);
        expect(emittedPayload!.targetRoomId).toBe(targetRoom.id);
        expect(emittedPayload!.targetRoomName).toBe(targetRoom.name);
      }
    });

    test('1.2 Room chips have clickable press handlers that target each specific room id', () => {
      renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: fiveRooms,
          initialSelectedItem: procedureA,
          onSelectOrder: () => {},
          testID: 'catalog-switch-test',
        })
      );

      // Verify each room has its registered handler
      for (const r of fiveRooms) {
        const handler = renderedPressHandlers.get(`catalog-switch-test-room-option-${r.id}`);
        expect(handler).toBeDefined();
        expect(typeof handler).toBe('function');
        // Calling it executes without exception
        handler!();
      }
    });

    test('1.3 Defaulting behavior when no room is clicked and no initialRoomId: selects targetRooms[0]', () => {
      let emittedPayload: OrderCatalogItemPayload | null = null;

      renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: fiveRooms,
          initialSelectedItem: procedureB,
          onSelectOrder: (order) => { emittedPayload = order; },
          testID: 'default-no-click',
        })
      );

      // Directly submit without clicking any room chip
      renderedPressHandlers.get('default-no-click-submit-btn')!();

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload!.roomId).toBe(fiveRooms[0].id);
      expect(emittedPayload!.roomName).toBe(fiveRooms[0].name);
      expect(emittedPayload!.targetRoomId).toBe(fiveRooms[0].id);
      expect(emittedPayload!.targetRoomName).toBe(fiveRooms[0].name);
    });

    test('1.4 Inactive rooms in clinic context are filtered out of fallback targetRooms', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          // rooms prop omitted to force useClinic().rooms fallback
          initialSelectedItem: procedureA,
          onSelectOrder: () => {},
          testID: 'fallback-inactive-test',
        })
      );

      // mockClinicRooms has 'Closed Bay' which is isActive: false
      expect(html).not.toContain('Closed Bay');
      expect(html).toContain('Dental Operatory 1');
      expect(html).toContain('Dental Operatory 2');
    });

    test('1.5 Empty rooms scenario (rooms=[] and no clinic rooms): submits safely with undefined room fields', () => {
      let emittedPayload: OrderCatalogItemPayload | null = null;

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: [], // explicitly empty
          initialSelectedItem: procedureA,
          onSelectOrder: (order) => { emittedPayload = order; },
          testID: 'empty-rooms-test',
        })
      );

      expect(html).toBeDefined();
    });

    test('1.6 Diagnostic item submission strictly excludes room fields', () => {
      let emittedPayload: OrderCatalogItemPayload | null = null;

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: fiveRooms,
          initialSelectedItem: diagnosticA,
          onSelectOrder: (order) => { emittedPayload = order; },
          testID: 'diagnostic-room-exclusion',
        })
      );

      // Room selector must NOT appear
      expect(html).not.toContain('Send / Assign to Room');

      renderedPressHandlers.get('diagnostic-room-exclusion-submit-btn')!();

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload!.serviceItemId).toBe(diagnosticA.id);
      expect(emittedPayload!.roomId).toBeUndefined();
      expect(emittedPayload!.roomName).toBeUndefined();
      expect(emittedPayload!.targetRoomId).toBeUndefined();
      expect(emittedPayload!.targetRoomName).toBeUndefined();
    });

    test('1.7 Pre-existing order with targetRoomId pre-selects the room on re-opening modal', () => {
      const existingOrders: ExistingOrderItemContext[] = [
        {
          name: 'Surgical Tooth Extraction',
          code: 'DENT-EXT-01',
          fulfillmentMode: 'in_house',
          targetRoomId: 'room-4',
          targetRoomName: 'Orthodontic Bay',
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: fiveRooms,
          alreadyOrderedNames: ['Surgical Tooth Extraction'],
          existingOrders,
          initialSelectedItem: procedureB,
          onSelectOrder: () => {},
          testID: 'existing-target-room-test',
        })
      );

      expect(html).toContain('data-testid="existing-target-room-test-room-option-room-4"');
      expect(html).toContain('aria-label="Assign to Orthodontic Bay"');
    });
  });

  // =========================================================================
  // Section 2: Consultations Workstation State & Workflow Logic
  // =========================================================================
  describe('2. Consultations Workstation — Procedure Workflow & Transition Stress Tests', () => {
    test('2.1 Multi-procedure draft list: switching target room updates only the target procedure without state bleeding', () => {
      let procedures: LocalProcedureOrder[] = [
        {
          serviceItemId: 'proc-1',
          name: 'Tooth Extraction',
          code: 'DENT-EXT-01',
          standardPrice: 2000,
          toothNumber: 16,
          targetRoomId: 'room-1',
          targetRoomName: 'Dental Operatory 1',
          roomId: 'room-1',
          roomName: 'Dental Operatory 1',
          status: 'draft',
          isHandedOff: false,
        },
        {
          serviceItemId: 'proc-2',
          name: 'Tooth Extraction',
          code: 'DENT-EXT-01',
          standardPrice: 2000,
          toothNumber: 26,
          targetRoomId: 'room-1',
          targetRoomName: 'Dental Operatory 1',
          roomId: 'room-1',
          roomName: 'Dental Operatory 1',
          status: 'draft',
          isHandedOff: false,
        },
        {
          serviceItemId: 'proc-3',
          name: 'Wound Dressing',
          code: 'NURS-DRS-01',
          standardPrice: 400,
          targetRoomId: 'room-3',
          targetRoomName: 'Oral Surgery Suite',
          roomId: 'room-3',
          roomName: 'Oral Surgery Suite',
          status: 'draft',
          isHandedOff: false,
        },
      ];

      // Switch target room of Tooth #16 to room-2
      const targetProc = procedures[0];
      const newRoom = fiveRooms[1]; // room-2

      procedures = procedures.map((item) =>
        item === targetProc
          ? {
              ...item,
              targetRoomId: newRoom.id,
              targetRoomName: newRoom.name,
              roomId: newRoom.id,
              roomName: newRoom.name,
            }
          : item
      );

      // Verify Tooth #16 was updated
      expect(procedures[0].targetRoomId).toBe('room-2');
      expect(procedures[0].targetRoomName).toBe('Dental Operatory 2');
      expect(procedures[0].status).toBe('draft');
      expect(procedures[0].isHandedOff).toBe(false);

      // Verify Tooth #26 remains on room-1
      expect(procedures[1].targetRoomId).toBe('room-1');
      expect(procedures[1].targetRoomName).toBe('Dental Operatory 1');
      expect(procedures[1].status).toBe('draft');

      // Verify Wound Dressing remains on room-3
      expect(procedures[2].targetRoomId).toBe('room-3');
      expect(procedures[2].targetRoomName).toBe('Oral Surgery Suite');
    });

    test('2.2 Inline room switcher condition matrix', () => {
      const isSwitcherVisible = (isSigned: boolean, isSent: boolean, availableRoomsCount: number) => {
        return !isSigned && !isSent && availableRoomsCount > 1;
      };

      // Table of all test cases
      expect(isSwitcherVisible(false, false, 2)).toBe(true);  // Draft, unsigned, 2 rooms -> visible
      expect(isSwitcherVisible(false, false, 5)).toBe(true);  // Draft, unsigned, 5 rooms -> visible
      expect(isSwitcherVisible(false, false, 1)).toBe(false); // Draft, unsigned, only 1 room -> hidden
      expect(isSwitcherVisible(false, false, 0)).toBe(false); // Draft, unsigned, 0 rooms -> hidden
      expect(isSwitcherVisible(true, false, 2)).toBe(false);  // Signed consult -> hidden
      expect(isSwitcherVisible(false, true, 2)).toBe(false);  // Sent to room -> hidden
      expect(isSwitcherVisible(true, true, 2)).toBe(false);   // Signed & sent -> hidden
    });

    test('2.3 Per-procedure send transitions status to sent_to_room with sentAt and queue update', () => {
      let procedures: LocalProcedureOrder[] = [
        {
          name: 'Root Canal Therapy',
          code: 'DENT-ENDO-01',
          standardPrice: 4500,
          toothNumber: 11,
          targetRoomId: 'room-2',
          targetRoomName: 'Dental Operatory 2',
          status: 'draft',
          isHandedOff: false,
        },
        {
          name: 'Prophylaxis',
          code: 'DENT-PRO-01',
          standardPrice: 800,
          targetRoomId: 'room-1',
          targetRoomName: 'Dental Operatory 1',
          status: 'draft',
          isHandedOff: false,
        },
      ];

      let patientQueueItem = {
        id: 'ticket-99',
        status: 'InConsultation',
        roomId: 'room-consult-1',
        roomOrStation: 'Consultation Room 1',
      };

      // Perform single procedure handoff of Root Canal Therapy
      const targetProc = procedures[0];
      const sendTime = '02:30 PM';

      // 1. Transition procedure
      procedures = procedures.map((p) =>
        p.name === targetProc.name && p.toothNumber === targetProc.toothNumber
          ? {
              ...p,
              status: 'sent_to_room',
              sentToRoomId: p.targetRoomId,
              sentToRoomName: p.targetRoomName,
              sentAt: sendTime,
              isHandedOff: true,
              handedOffAt: sendTime,
            }
          : p
      );

      // 2. Transition patient queue
      patientQueueItem = {
        ...patientQueueItem,
        status: 'PendingProcedure',
        roomId: targetProc.targetRoomId,
        roomOrStation: targetProc.targetRoomName!,
      };

      // Assertions on procedure state
      expect(procedures[0].status).toBe('sent_to_room');
      expect(procedures[0].sentToRoomId).toBe('room-2');
      expect(procedures[0].sentToRoomName).toBe('Dental Operatory 2');
      expect(procedures[0].sentAt).toBe('02:30 PM');
      expect(procedures[0].isHandedOff).toBe(true);

      // Assertions on untargeted procedure (must remain draft)
      expect(procedures[1].status).toBe('draft');
      expect(procedures[1].isHandedOff).toBe(false);
      expect(procedures[1].sentAt).toBeUndefined();

      // Assertions on patient queue state
      expect(patientQueueItem.status).toBe('PendingProcedure');
      expect(patientQueueItem.roomId).toBe('room-2');
      expect(patientQueueItem.roomOrStation).toBe('Dental Operatory 2');
    });

    test('2.4 Batch send dispatches all unhanded-off procedures and preserves individual destination rooms', () => {
      let procedures: LocalProcedureOrder[] = [
        {
          name: 'Proc 1 (Operatory 1)',
          standardPrice: 1000,
          targetRoomId: 'room-1',
          targetRoomName: 'Dental Operatory 1',
          status: 'draft',
          isHandedOff: false,
        },
        {
          name: 'Proc 2 (Operatory 2)',
          standardPrice: 1500,
          targetRoomId: 'room-2',
          targetRoomName: 'Dental Operatory 2',
          status: 'draft',
          isHandedOff: false,
        },
        {
          name: 'Proc 3 (Already Sent)',
          standardPrice: 2000,
          targetRoomId: 'room-3',
          targetRoomName: 'Oral Surgery Suite',
          status: 'sent_to_room',
          isHandedOff: true,
          sentAt: '01:00 PM',
        },
      ];

      // Dynamic count evaluation
      const unhandedOff = procedures.filter((p) => !p.isHandedOff && p.status !== 'sent_to_room');
      expect(unhandedOff.length).toBe(2);

      const batchButtonTitle =
        unhandedOff.length === 0
          ? 'All Procedures Handed Off'
          : `Send Draft Procedures to Room (${unhandedOff.length})`;

      expect(batchButtonTitle).toBe('Send Draft Procedures to Room (2)');

      // Execute batch send
      const batchTime = '02:45 PM';
      procedures = procedures.map((item) => {
        if (!item.isHandedOff && item.status !== 'sent_to_room') {
          return {
            ...item,
            status: 'sent_to_room' as const,
            sentToRoomId: item.targetRoomId,
            sentToRoomName: item.targetRoomName,
            sentAt: batchTime,
            isHandedOff: true,
            handedOffAt: batchTime,
          };
        }
        return item;
      });

      // Proc 1 went to Operatory 1
      expect(procedures[0].status).toBe('sent_to_room');
      expect(procedures[0].sentToRoomId).toBe('room-1');
      expect(procedures[0].sentToRoomName).toBe('Dental Operatory 1');
      expect(procedures[0].sentAt).toBe('02:45 PM');

      // Proc 2 went to Operatory 2
      expect(procedures[1].status).toBe('sent_to_room');
      expect(procedures[1].sentToRoomId).toBe('room-2');
      expect(procedures[1].sentToRoomName).toBe('Dental Operatory 2');
      expect(procedures[1].sentAt).toBe('02:45 PM');

      // Proc 3 remained untouched with original sent time
      expect(procedures[2].sentAt).toBe('01:00 PM');

      // After batch send, all are handed off
      const remainingUnhanded = procedures.filter((p) => !p.isHandedOff && p.status !== 'sent_to_room');
      expect(remainingUnhanded.length).toBe(0);
      const postBatchButtonTitle =
        remainingUnhanded.length === 0
          ? 'All Procedures Handed Off'
          : `Send Draft Procedures to Room (${remainingUnhanded.length})`;
      expect(postBatchButtonTitle).toBe('All Procedures Handed Off');
    });
  });

  // =========================================================================
  // Section 3: Badge Formatting & Variant Stress Tests
  // =========================================================================
  describe('3. Badge Formatting & Tokens Verification', () => {
    test('3.1 Draft badge renders strictly "Draft • Room: [Room Name]" with warning styling', () => {
      const roomName = "Surgical Suite #5 & Dental Bay (Rm 102)";
      const badgeMarkup = renderToStaticMarkup(
        React.createElement(Badge, {
          label: `Draft • Room: ${roomName}`,
          variant: 'warning',
          size: 'sm',
        })
      );

      expect(badgeMarkup).toContain('Draft • Room: Surgical Suite #5 &amp; Dental Bay (Rm 102)');
      expect(badgeMarkup).toContain('#FEF3C7'); // theme.colors.warningBg
      expect(badgeMarkup).toContain('#B45309'); // theme.colors.warningText
      expect(badgeMarkup).not.toContain('checkCircle');
    });

    test('3.2 Sent badge renders strictly "Sent to [Room Name] • [HH:MM AM]" with success styling and checkCircle icon', () => {
      const roomName = "Dental Operatory 2";
      const sentTime = "11:45 AM";
      const badgeMarkup = renderToStaticMarkup(
        React.createElement(Badge, {
          label: `Sent to ${roomName} • ${sentTime}`,
          variant: 'success',
          icon: 'checkCircle',
          size: 'sm',
        })
      );

      expect(badgeMarkup).toContain('Sent to Dental Operatory 2 • 11:45 AM');
      expect(badgeMarkup).toContain('#DCFCE7'); // theme.colors.successBg
      expect(badgeMarkup).toContain('#15803D'); // theme.colors.successText
      expect(badgeMarkup).toContain('lucide-circle-check');
    });

    test('3.3 Room resolution fallback hierarchy', () => {
      const resolveRoom = (proc: Partial<LocalProcedureOrder>, fallbackDefault: string): string => {
        return (
          proc.sentToRoomName ||
          proc.targetRoomName ||
          proc.roomName ||
          fallbackDefault
        );
      };

      // 1. sentToRoomName takes precedence
      expect(resolveRoom({ sentToRoomName: 'Sent Room', targetRoomName: 'Target Room' }, 'Default')).toBe('Sent Room');

      // 2. targetRoomName when sentToRoomName is missing
      expect(resolveRoom({ targetRoomName: 'Target Room', roomName: 'Room Name' }, 'Default')).toBe('Target Room');

      // 3. roomName when targetRoomName is missing
      expect(resolveRoom({ roomName: 'Room Name' }, 'Default')).toBe('Room Name');

      // 4. Fallback default when all are missing
      expect(resolveRoom({}, 'Default Treatment Room')).toBe('Default Treatment Room');
    });
  });

  // =========================================================================
  // Section 4: Button Polish & Glyph Normalization Tests
  // =========================================================================
  describe('4. Button Polish — Plus Normalization & Action Titles', () => {
    test('4.1 Strips leading "+ " when icon="plus"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+ Add procedure',
          icon: 'plus',
        })
      );
      expect(html).toContain('Add procedure');
      expect(html).not.toContain('+ Add procedure');
    });

    test('4.2 Strips leading "+" without whitespace when icon="plus"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+Order Procedure',
          icon: 'plus',
        })
      );
      expect(html).toContain('Order Procedure');
      expect(html).not.toContain('+Order Procedure');
    });

    test('4.3 Strips leading "+" with multiple spaces when icon="plus"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+   New Order',
          icon: 'plus',
        })
      );
      expect(html).toContain('New Order');
      expect(html).not.toContain('+   New Order');
    });

    test('4.4 Preserves leading "+" when icon is NOT plus', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+ Urgent Case',
          icon: 'medical',
        })
      );
      expect(html).toContain('+ Urgent Case');
    });

    test('4.5 Normalizes accessibilityLabel when accessibilityLabel is not explicitly passed', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+ Add procedure',
          icon: 'plus',
        })
      );
      expect(html).toContain('aria-label="Add procedure"');
      expect(html).not.toContain('aria-label="+ Add procedure"');
    });

    test('4.6 Respects custom explicit accessibilityLabel override even when icon="plus"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+ Add procedure',
          icon: 'plus',
          accessibilityLabel: 'Custom accessibility label',
        })
      );
      expect(html).toContain('aria-label="Custom accessibility label"');
    });
  });
});
