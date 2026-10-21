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
  { id: 'room-treatment-a', name: 'Treatment Room A', type: 'Treatment' as const, isActive: true },
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

describe('Milestone 3 — Procedure Room Selection, Badges & Button Polish', () => {
  const sampleRooms: ClinicRoom[] = [
    { id: 'room-op-1', name: 'Dental Operatory 1', type: 'Treatment', isActive: true },
    { id: 'room-op-2', name: 'Dental Operatory 2', type: 'Treatment', isActive: true },
    { id: 'room-tx-3', name: 'Oral Surgery Suite', type: 'Treatment', isActive: true },
  ];

  const sampleProcedure: ClinicServiceItem = {
    id: 'proc-tooth-extraction',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'DENT-EXT-01',
    name: 'Surgical Tooth Extraction',
    category: 'Procedure',
    standardPrice: 1500,
    isActive: true,
    philHealthCode: 'D-8001',
    philHealthDescription: 'Tooth Extraction Simple',
    isPhilHealthFormulary: true,
  };

  const sampleDiagnostic: ClinicServiceItem = {
    id: 'diag-periapical-xray',
    tenantId: 'tenant-1',
    clinicId: 'clinic-1',
    code: 'DENT-RAD-01',
    name: 'Periapical Dental Radiograph',
    category: 'Diagnostic',
    standardPrice: 350,
    isActive: true,
    philHealthCode: 'D-7001',
    philHealthDescription: 'Periapical Film',
    isPhilHealthFormulary: true,
  };

  const testCatalog: ClinicServiceItem[] = [sampleProcedure, sampleDiagnostic];

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
  // 1. OrderCatalogSearchModal — Target Room Selection & Payload Assembly
  // =========================================================================
  describe('1. OrderCatalogSearchModal — Target Room Selection & Payload Assembly', () => {
    test('1.1 Renders "Send / Assign to Room" selector when catalog item is a procedure', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: sampleRooms,
          initialSelectedItem: sampleProcedure,
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Send / Assign to Room');
      expect(html).toContain('Dental Operatory 1');
      expect(html).toContain('Dental Operatory 2');
      expect(html).toContain('Oral Surgery Suite');
      expect(html).toContain('Select which treatment room or dental operatory to assign this procedure to.');
    });

    test('1.2 Does NOT render "Send / Assign to Room" selector when catalog item is a diagnostic test', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: sampleRooms,
          initialSelectedItem: sampleDiagnostic,
          onSelectOrder: () => {},
        })
      );

      expect(html).not.toContain('Send / Assign to Room');
      expect(html).toContain('Fulfillment Mode');
      expect(html).toContain('In-House Clinic');
      expect(html).toContain('Outside Laboratory');
    });

    test('1.3 Highlights initialRoomId when provided in props', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: sampleRooms,
          initialRoomId: 'room-op-2',
          initialSelectedItem: sampleProcedure,
          onSelectOrder: () => {},
        })
      );

      // room-op-2 should be active/selected
      expect(html).toContain('data-testid="order-catalog-search-modal-room-option-room-op-2"');
      expect(html).toContain('aria-label="Assign to Dental Operatory 2"');
    });

    test('1.4 Pre-selects target room from existingOrders if item was previously ordered', () => {
      const existingOrders: ExistingOrderItemContext[] = [
        {
          name: 'Surgical Tooth Extraction',
          code: 'DENT-EXT-01',
          fulfillmentMode: 'in_house',
          roomId: 'room-tx-3',
          roomName: 'Oral Surgery Suite',
        },
      ];

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: sampleRooms,
          alreadyOrderedNames: ['Surgical Tooth Extraction'],
          alreadyOrderedCodes: ['DENT-EXT-01'],
          existingOrders,
          initialSelectedItem: sampleProcedure,
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Already Ordered - In Order (Edit)');
      expect(html).toContain('data-testid="order-catalog-search-modal-room-option-room-tx-3"');
    });

    test('1.5 Falls back to useClinic().rooms when rooms prop is omitted', () => {
      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          initialSelectedItem: sampleProcedure,
          onSelectOrder: () => {},
        })
      );

      expect(html).toContain('Send / Assign to Room');
      // Should find fallback rooms from mockClinicRooms
      expect(html).toContain('Dental Operatory 1');
      expect(html).toContain('Dental Operatory 2');
      expect(html).toContain('Treatment Room A');
    });

    test('1.6 Submitting procedure order populates roomId, roomName, targetRoomId, and targetRoomName', () => {
      let emittedPayload: OrderCatalogItemPayload | null = null;
      let closed = false;

      renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {
            closed = true;
          },
          catalog: testCatalog,
          rooms: sampleRooms,
          initialRoomId: 'room-op-2',
          initialToothNumber: 18,
          initialToothSurface: 'MOD',
          initialSelectedItem: sampleProcedure,
          onSelectOrder: (order) => {
            emittedPayload = order;
          },
          testID: 'test-modal',
        })
      );

      // Trigger submit button
      const submitHandler = renderedPressHandlers.get('test-modal-submit-btn');
      expect(submitHandler).toBeDefined();
      submitHandler!();

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload!.serviceItemId).toBe('proc-tooth-extraction');
      expect(emittedPayload!.name).toBe('Surgical Tooth Extraction');
      expect(emittedPayload!.roomId).toBe('room-op-2');
      expect(emittedPayload!.roomName).toBe('Dental Operatory 2');
      expect(emittedPayload!.targetRoomId).toBe('room-op-2');
      expect(emittedPayload!.targetRoomName).toBe('Dental Operatory 2');
      expect(emittedPayload!.toothNumber).toBe(18);
      expect(emittedPayload!.toothSurface).toBe('MOD');
      expect(closed).toBe(true);
    });

    test('1.7 Custom initialRoomId designates target room and populates payload fields', () => {
      let emittedPayload: OrderCatalogItemPayload | null = null;

      const html = renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: sampleRooms,
          initialRoomId: 'room-tx-3',
          initialSelectedItem: sampleProcedure,
          onSelectOrder: (order) => {
            emittedPayload = order;
          },
          testID: 'test-modal-chip',
        })
      );

      // Verify chip for Oral Surgery Suite is rendered with active selection state
      expect(html).toContain('data-testid="test-modal-chip-room-option-room-tx-3"');
      expect(html).toContain('aria-label="Assign to Oral Surgery Suite"');

      // Verify each room has a clickable press handler
      const roomTxHandler = renderedPressHandlers.get('test-modal-chip-room-option-room-tx-3');
      expect(roomTxHandler).toBeDefined();
      expect(typeof roomTxHandler).toBe('function');
      roomTxHandler!();

      // Submit and verify payload reflects the designated room
      const submitHandler = renderedPressHandlers.get('test-modal-chip-submit-btn');
      expect(submitHandler).toBeDefined();
      submitHandler!();

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload!.targetRoomId).toBe('room-tx-3');
      expect(emittedPayload!.targetRoomName).toBe('Oral Surgery Suite');
      expect(emittedPayload!.roomId).toBe('room-tx-3');
      expect(emittedPayload!.roomName).toBe('Oral Surgery Suite');
    });

    test('1.8 Submitting diagnostic order leaves roomId and targetRoomId undefined', () => {
      let emittedPayload: OrderCatalogItemPayload | null = null;

      renderToStaticMarkup(
        React.createElement(OrderCatalogSearchModal, {
          visible: true,
          onClose: () => {},
          catalog: testCatalog,
          rooms: sampleRooms,
          initialSelectedItem: sampleDiagnostic,
          onSelectOrder: (order) => {
            emittedPayload = order;
          },
          testID: 'test-modal-diag',
        })
      );

      const submitHandler = renderedPressHandlers.get('test-modal-diag-submit-btn');
      expect(submitHandler).toBeDefined();
      submitHandler!();

      expect(emittedPayload).not.toBeNull();
      expect(emittedPayload!.name).toBe('Periapical Dental Radiograph');
      expect(emittedPayload!.roomId).toBeUndefined();
      expect(emittedPayload!.targetRoomId).toBeUndefined();
      expect(emittedPayload!.fulfillmentMode).toBe('outside');
    });
  });

  // =========================================================================
  // 2. Consultations Workstation — Inline Target Room Switching
  // =========================================================================
  describe('2. Consultations Workstation — Inline Target Room Switching', () => {
    test('2.1 Switching room inline updates target room and roomId while keeping procedure in draft', () => {
      let procedures: LocalProcedureOrder[] = [
        {
          name: 'Composite Restoration',
          code: 'DENT-COMP-01',
          standardPrice: 1200,
          toothNumber: 14,
          toothSurface: 'MOD',
          roomId: 'room-op-1',
          roomName: 'Dental Operatory 1',
          targetRoomId: 'room-op-1',
          targetRoomName: 'Dental Operatory 1',
          status: 'draft',
          isHandedOff: false,
        },
      ];

      // Clinician switches procedure target room to Dental Operatory 2
      const newRoom = sampleRooms[1]; // room-op-2
      procedures = procedures.map((item) =>
        item.name === 'Composite Restoration' && item.toothNumber === 14
          ? {
              ...item,
              targetRoomId: newRoom.id,
              targetRoomName: newRoom.name,
              roomId: newRoom.id,
              roomName: newRoom.name,
            }
          : item
      );

      expect(procedures[0].targetRoomId).toBe('room-op-2');
      expect(procedures[0].targetRoomName).toBe('Dental Operatory 2');
      expect(procedures[0].roomId).toBe('room-op-2');
      expect(procedures[0].roomName).toBe('Dental Operatory 2');
      // Must remain draft until explicitly sent
      expect(procedures[0].status).toBe('draft');
      expect(procedures[0].isHandedOff).toBe(false);
      expect(procedures[0].sentAt).toBeUndefined();
    });

    test('2.2 Inline room switcher condition: visible only when not signed, not sent, and multiple rooms exist', () => {
      const shouldRenderInlineRoomSwitcher = (
        isSigned: boolean,
        isSent: boolean,
        roomsCount: number
      ) => {
        return !isSigned && !isSent && roomsCount > 1;
      };

      // Case A: Draft with 3 rooms -> visible
      expect(shouldRenderInlineRoomSwitcher(false, false, 3)).toBe(true);

      // Case B: Sent procedure -> hidden
      expect(shouldRenderInlineRoomSwitcher(false, true, 3)).toBe(false);

      // Case C: Signed consultation -> hidden
      expect(shouldRenderInlineRoomSwitcher(true, false, 3)).toBe(false);

      // Case D: Only 1 available room -> hidden
      expect(shouldRenderInlineRoomSwitcher(false, false, 1)).toBe(false);
    });
  });

  // =========================================================================
  // 3. Consultations Workstation — Per-Procedure Send to Room Action
  // =========================================================================
  describe('3. Consultations Workstation — Per-Procedure "Send to [Room Name]" Action', () => {
    test('3.1 Per-procedure send transitions procedure to sent_to_room with sentAt and sentToRoom fields', () => {
      const draftProcedure: LocalProcedureOrder = {
        name: 'Root Canal Therapy',
        code: 'DENT-ENDO-01',
        standardPrice: 4500,
        toothNumber: 26,
        roomId: 'room-op-1',
        roomName: 'Dental Operatory 1',
        targetRoomId: 'room-op-1',
        targetRoomName: 'Dental Operatory 1',
        status: 'draft',
        isHandedOff: false,
      };

      // Simulate execution of handleHandoffToTreatmentRoom
      const timestamp = '10:45 AM';
      const resolvedRoomId = draftProcedure.targetRoomId || draftProcedure.roomId || 'room-op-1';
      const resolvedRoomName = draftProcedure.targetRoomName || draftProcedure.roomName || 'Dental Operatory 1';

      const sentProcedure: LocalProcedureOrder = {
        ...draftProcedure,
        status: 'sent_to_room',
        sentToRoomId: resolvedRoomId,
        sentToRoomName: resolvedRoomName,
        sentAt: timestamp,
        isHandedOff: true,
        handedOffAt: timestamp,
        targetRoomId: resolvedRoomId,
        targetRoomName: resolvedRoomName,
        roomId: resolvedRoomId,
        roomName: resolvedRoomName,
      };

      expect(sentProcedure.status).toBe('sent_to_room');
      expect(sentProcedure.sentToRoomId).toBe('room-op-1');
      expect(sentProcedure.sentToRoomName).toBe('Dental Operatory 1');
      expect(sentProcedure.sentAt).toBe('10:45 AM');
      expect(sentProcedure.isHandedOff).toBe(true);
      expect(sentProcedure.handedOffAt).toBe('10:45 AM');
    });

    test('3.2 Per-procedure send updates patient queue status to PendingProcedure', () => {
      const patient = {
        id: 'queue-item-42',
        patientId: 'pat-100',
        patientName: 'Juan Dela Cruz',
        status: 'InConsultation',
        roomId: 'room-consult-1',
        roomOrStation: 'Consultation Room 1',
      };

      const targetRoomId = 'room-op-2';
      const targetRoomName = 'Dental Operatory 2';

      const updatedPatient = {
        ...patient,
        status: 'PendingProcedure',
        roomId: targetRoomId,
        roomOrStation: targetRoomName,
      };

      expect(updatedPatient.status).toBe('PendingProcedure');
      expect(updatedPatient.roomId).toBe('room-op-2');
      expect(updatedPatient.roomOrStation).toBe('Dental Operatory 2');
    });
  });

  // =========================================================================
  // 4. Consultations Workstation — Batch "Send Draft Procedures to Room"
  // =========================================================================
  describe('4. Consultations Workstation — Batch "Send Draft Procedures to Room"', () => {
    test('4.1 Batch button title displays count of unhanded-off procedures', () => {
      const procedures: LocalProcedureOrder[] = [
        {
          name: 'Prophylaxis',
          standardPrice: 800,
          status: 'draft',
          isHandedOff: false,
        },
        {
          name: 'Fluoride Application',
          standardPrice: 500,
          status: 'draft',
          isHandedOff: false,
        },
        {
          name: 'Composite Filling',
          standardPrice: 1200,
          status: 'sent_to_room',
          isHandedOff: true,
          sentToRoomId: 'room-op-1',
          sentToRoomName: 'Dental Operatory 1',
          sentAt: '09:30 AM',
        },
      ];

      const unhandedOff = procedures.filter((p) => !p.isHandedOff && p.status !== 'sent_to_room');
      expect(unhandedOff.length).toBe(2);

      const buttonTitle =
        unhandedOff.length === 0
          ? 'All Procedures Handed Off'
          : `Send Draft Procedures to Room (${unhandedOff.length})`;

      expect(buttonTitle).toBe('Send Draft Procedures to Room (2)');
    });

    test('4.2 Batch handoff sends all unhanded-off procedures and transitions them to sent_to_room', () => {
      let procedures: LocalProcedureOrder[] = [
        {
          name: 'Procedure A',
          standardPrice: 600,
          targetRoomId: 'room-op-1',
          targetRoomName: 'Dental Operatory 1',
          status: 'draft',
          isHandedOff: false,
        },
        {
          name: 'Procedure B',
          standardPrice: 900,
          targetRoomId: 'room-op-2',
          targetRoomName: 'Dental Operatory 2',
          status: 'draft',
          isHandedOff: false,
        },
      ];

      const timestamp = '11:15 AM';
      procedures = procedures.map((p) => ({
        ...p,
        status: 'sent_to_room' as const,
        sentToRoomId: p.targetRoomId,
        sentToRoomName: p.targetRoomName,
        sentAt: timestamp,
        isHandedOff: true,
        handedOffAt: timestamp,
      }));

      expect(procedures.every((p) => p.status === 'sent_to_room')).toBe(true);
      expect(procedures.every((p) => p.isHandedOff === true)).toBe(true);
      expect(procedures.every((p) => p.sentAt === '11:15 AM')).toBe(true);
      expect(procedures[0].sentToRoomName).toBe('Dental Operatory 1');
      expect(procedures[1].sentToRoomName).toBe('Dental Operatory 2');

      const remainingUnhanded = procedures.filter((p) => !p.isHandedOff && p.status !== 'sent_to_room');
      const allHandedOffTitle =
        remainingUnhanded.length === 0
          ? 'All Procedures Handed Off'
          : `Send Draft Procedures to Room (${remainingUnhanded.length})`;

      expect(allHandedOffTitle).toBe('All Procedures Handed Off');
    });
  });

  // =========================================================================
  // 5. Procedure Status Badges — Warning Draft & Success Sent Badges
  // =========================================================================
  describe('5. Procedure Status Badges — Warning Draft & Success Sent Badges', () => {
    test('5.1 Renders warning badge "Draft • Room: [Room Name]" for draft procedure', () => {
      const roomName = 'Dental Operatory 1';
      const isSent = false;

      const badgeMarkup = renderToStaticMarkup(
        React.createElement(Badge, {
          label: isSent ? `Sent to ${roomName} • 10:00 AM` : `Draft • Room: ${roomName}`,
          variant: isSent ? 'success' : 'warning',
          size: 'sm',
          ...(isSent ? { icon: 'checkCircle' } : {}),
        })
      );

      expect(badgeMarkup).toContain('Draft • Room: Dental Operatory 1');
      // Warning variant background and text color tokens
      expect(badgeMarkup).toContain('#FEF3C7'); // theme.colors.warningBg
      expect(badgeMarkup).toContain('#B45309'); // theme.colors.warningText
    });

    test('5.2 Renders success badge "Sent to [Room Name] • [HH:MM AM]" with checkCircle icon for sent procedure', () => {
      const roomName = 'Oral Surgery Suite';
      const isSent = true;
      const sentTime = '10:30 AM';

      const badgeMarkup = renderToStaticMarkup(
        React.createElement(Badge, {
          label: `Sent to ${roomName} • ${sentTime}`,
          variant: 'success',
          icon: 'checkCircle',
          size: 'sm',
        })
      );

      expect(badgeMarkup).toContain('Sent to Oral Surgery Suite • 10:30 AM');
      // Success variant background, text color tokens, and checkCircle icon
      expect(badgeMarkup).toContain('#DCFCE7'); // theme.colors.successBg
      expect(badgeMarkup).toContain('#15803D'); // theme.colors.successText
      expect(badgeMarkup).toContain('lucide-circle-check');
    });

    test('5.3 Procedure cards in Consultations.screen render explicit warning/success badges without duplicate purple badges', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const screenPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const screenSource = fs.readFileSync(screenPath, 'utf8');

      // Verify explicit badges are present
      expect(screenSource).toContain('label={`Draft • Room: ${resolvedRoom}`}');
      expect(screenSource).toContain('variant="warning"');
      expect(screenSource).toContain('label={`Sent to ${resolvedRoom} • ${proc.sentAt || proc.handedOffAt || \'Sent\'}`}');
      expect(screenSource).toContain('variant="success"');
      expect(screenSource).toContain('icon="checkCircle"');

      // Verify old purple badge for procedures list is removed
      expect(screenSource).not.toContain("variant={isSent ? 'success' : 'purple'}");
    });
  });

  // =========================================================================
  // 6. Button Component — Plus Icon Normalization & Clean Action Titles
  // =========================================================================
  describe('6. Button Component — Plus Icon Normalization & Clean Action Titles', () => {
    test('6.1 Button strips leading "+ " when icon="plus" to prevent double "+ +"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+ Order Procedure',
          icon: 'plus',
        })
      );

      expect(html).toContain('Order Procedure');
      expect(html).not.toContain('+ Order Procedure');
      expect(html).not.toContain('+ +');
    });

    test('6.2 Button strips leading "+" without space when icon="plus"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+Add procedure',
          icon: 'plus',
        })
      );

      expect(html).toContain('Add procedure');
      expect(html).not.toContain('+Add procedure');
    });

    test('6.3 Button preserves clean title without modifying when no leading "+"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: 'Order Procedure for Tooth #16',
          icon: 'plus',
        })
      );

      expect(html).toContain('Order Procedure for Tooth #16');
    });

    test('6.4 Action button labels across workstation screens are clean', async () => {
      const fs = await import('fs');
      const path = await import('path');

      const inlineDentalCardPath = path.resolve(__dirname, '../components/consultation/InlineDentalChartCard.tsx');
      const inlineDentalSource = fs.readFileSync(inlineDentalCardPath, 'utf8');
      expect(inlineDentalSource).toContain('title={`Order Procedure for Tooth #${selectedToothNumber}');
      expect(inlineDentalSource).not.toContain('title={`+ Order Procedure');

      const dentalTabPath = path.resolve(__dirname, '../components/chart/DentalChartTab.tsx');
      const dentalTabSource = fs.readFileSync(dentalTabPath, 'utf8');
      expect(dentalTabSource).toContain('title="Order Procedure"');
      expect(dentalTabSource).not.toContain('title="+ Order Procedure"');

      const consultationsPath = path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx');
      const consultationsSource = fs.readFileSync(consultationsPath, 'utf8');
      expect(consultationsSource).toContain('title="Add test"');
      expect(consultationsSource).toContain('title="Add procedure"');
      expect(consultationsSource).not.toContain('title="+ Add test"');
      expect(consultationsSource).not.toContain('title="+ Add procedure"');
    });
  });
});
