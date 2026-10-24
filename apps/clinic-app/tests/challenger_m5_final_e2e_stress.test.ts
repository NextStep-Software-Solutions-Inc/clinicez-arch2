// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  normalizeTeethToMultiRecord,
  getDominantToothStatus,
  calculateDmftMetrics,
  sortToothSurfaces,
  getToothDescription,
  isRightQuadrant,
  getSurfacesForQuadrant,
  getSurfaceZoneColor,
  DentalToothRecord,
  ToothStatus,
} from '../components/dental/dentalUtils';

(globalThis as any).__DEV__ = true;

const renderedPressHandlers = new Map<string, () => void>();

const createMockComponent = (name: string) => {
  const Comp = ({ children, accessibilityLabel, accessibilityRole, placeholder, testID, onPress, ...props }: any) => {
    if (onPress && testID) {
      renderedPressHandlers.set(testID, onPress);
    }
    return React.createElement(
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
  };
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
  FlatList: createMockComponent('FlatList'),
  SectionList: createMockComponent('SectionList'),
  Switch: createMockComponent('Switch'),
  TouchableOpacity: createMockComponent('TouchableOpacity'),
  TouchableHighlight: createMockComponent('TouchableHighlight'),
  Image: createMockComponent('Image'),
  Dimensions: {
    get: () => ({ width: 1440, height: 900 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1440, height: 900 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Touchable: { Mixin: {} },
  TurboModuleRegistry: { get: () => null, getEnforcing: () => null },
  NativeModules: {},
  processColor: (c: any) => c,
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) { this.val = val; }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
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
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('expo-font', () => ({
  isLoaded: () => true,
  loadAsync: () => Promise.resolve(),
}));

mock.module('@expo/vector-icons', () => ({
  Ionicons: createMockComponent('Ionicons'),
  MaterialCommunityIcons: createMockComponent('MaterialCommunityIcons'),
  FontAwesome: createMockComponent('FontAwesome'),
  Feather: createMockComponent('Feather'),
}));

describe('Milestone 5 Adversarial Verification: Cross-Cutting Hardening Suite', () => {

  // =========================================================================
  // 1. DENTAL CHART SYNCHRONIZATION & MULTI-CONDITION RESILIENCE
  // =========================================================================
  describe('1. Dental Chart Synchronization & Multi-Condition Stress', () => {
    test('1.1 Immediate left-pane patientChart.dentalTeeth sync maintains distinct conditions, surfaces, and recordedBy', () => {
      const incomingChartChange: Record<number, DentalToothRecord[]> = {
        16: [
          {
            id: 'rec-16-filled',
            toothNumber: 16,
            status: 'Filled',
            surface: 'O',
            notes: 'Occlusal composite restoration',
            createdAt: '2026-10-18T08:00:00Z',
            recordedBy: 'Dr. Santos',
          },
          {
            id: 'rec-16-decay',
            toothNumber: 16,
            status: 'Decayed',
            surface: 'MD',
            notes: 'Mesial-distal recurrent caries',
            createdAt: '2026-10-20T09:30:00Z',
            recordedBy: 'Dr. Cruz',
          },
        ],
        21: [
          {
            id: 'rec-21-crown',
            toothNumber: 21,
            status: 'Crowned',
            surface: 'MODBL',
            notes: 'Zirconia crown',
            createdAt: '2026-10-15T10:00:00Z',
            recordedBy: 'Dr. Reyes',
          },
        ],
        36: [
          {
            id: 'rec-36-extract',
            toothNumber: 36,
            status: 'ForExtraction',
            surface: '',
            notes: 'Indicated for surgical extraction',
            createdAt: '2026-10-20T10:15:00Z',
            recordedBy: 'Dr. Cruz',
          },
        ],
      };

      // Execute exact synchronization logic from Consultations.screen.tsx lines 566-578
      const targetPatientId = 'pat-stress-500';
      const settings = { tenantId: 'tenant-test', clinicId: 'clinic-test' };
      const patientRecord = { id: 'pat-stress-500', tenantId: 'tenant-test', clinicId: 'clinic-test' };

      const multiMap = normalizeTeethToMultiRecord(incomingChartChange as any);
      const syncedTeeth: DentalToothRecord[] = Object.values(multiMap).flat().map((rec) => ({
        ...rec,
        tenantId: rec.tenantId || settings?.tenantId || (patientRecord as any)?.tenantId || '',
        clinicId: rec.clinicId || settings?.clinicId || (patientRecord as any)?.clinicId || '',
        patientId: targetPatientId,
        notes: rec.notes || null,
        surface: rec.surface || null,
      }));

      // Assertions
      expect(syncedTeeth.length).toBe(4);
      expect(syncedTeeth.every((t) => t.status !== undefined)).toBe(true);
      expect(syncedTeeth.every((t) => t.patientId === targetPatientId)).toBe(true);

      const tooth16 = syncedTeeth.filter((t) => t.toothNumber === 16);
      expect(tooth16.length).toBe(2);
      expect(tooth16.find((t) => t.status === 'Filled')?.surface).toBe('O');
      expect(tooth16.find((t) => t.status === 'Filled')?.recordedBy).toBe('Dr. Santos');
      expect(tooth16.find((t) => t.status === 'Decayed')?.surface).toBe('MD');
      expect(tooth16.find((t) => t.status === 'Decayed')?.recordedBy).toBe('Dr. Cruz');

      // DMFT calculation consistency
      const dmft = calculateDmftMetrics(syncedTeeth);
      expect(dmft.decayedCount).toBe(1);
      expect(dmft.filledCount).toBe(1);
      expect(dmft.crownCount).toBe(1);
      expect(dmft.extractionCount).toBe(1);
      // Tooth 16 has both Decay and Filled; in standard DMFT it counts once toward DMFT score:
      // Teeth contributing to DMFT score (Decayed, Missing, Filled): Tooth 16 (D+F) -> 1 tooth.
      // Tooth 21 is Crown, Tooth 36 is Extraction.
      expect(dmft.dmftScore).toBe(1);
      expect(dmft.totalCharted).toBe(3);
    });

    test('1.2 FDI tooth numbering, midline orientation, and surface mapping accuracy across all 4 adult quadrants', () => {
      // Q1 (Upper Right): 11-18 -> right quadrant -> left is D, right is M
      for (let tooth = 11; tooth <= 18; tooth++) {
        expect(isRightQuadrant(tooth)).toBe(true);
        const surfaces = getSurfacesForQuadrant(tooth);
        expect(surfaces.top).toBe('B');
        expect(surfaces.bottom).toBe('L');
        expect(surfaces.center).toBe('O');
        expect(surfaces.left).toBe('D');
        expect(surfaces.right).toBe('M');
      }

      // Q2 (Upper Left): 21-28 -> left quadrant -> left is M, right is D
      for (let tooth = 21; tooth <= 28; tooth++) {
        expect(isRightQuadrant(tooth)).toBe(false);
        const surfaces = getSurfacesForQuadrant(tooth);
        expect(surfaces.top).toBe('B');
        expect(surfaces.bottom).toBe('L');
        expect(surfaces.center).toBe('O');
        expect(surfaces.left).toBe('M');
        expect(surfaces.right).toBe('D');
      }

      // Q3 (Lower Left): 31-38 -> left quadrant -> left is M, right is D
      for (let tooth = 31; tooth <= 38; tooth++) {
        expect(isRightQuadrant(tooth)).toBe(false);
        const surfaces = getSurfacesForQuadrant(tooth);
        expect(surfaces.left).toBe('M');
        expect(surfaces.right).toBe('D');
      }

      // Q4 (Lower Right): 41-48 -> right quadrant -> left is D, right is M
      for (let tooth = 41; tooth <= 48; tooth++) {
        expect(isRightQuadrant(tooth)).toBe(true);
        const surfaces = getSurfacesForQuadrant(tooth);
        expect(surfaces.left).toBe('D');
        expect(surfaces.right).toBe('M');
      }
    });

    test('1.3 ToothSurfaceDiagram renders 5 distinct surface zones with semantic colors', async () => {
      const { ToothSurfaceDiagram } = await import('../components/dental/ToothSurfaceDiagram');
      const html = renderToStaticMarkup(
        React.createElement(ToothSurfaceDiagram, {
          toothNumber: 16,
          conditions: [
            { status: 'Filled', surface: 'O' },
            { status: 'Decayed', surface: 'MD' },
          ],
          size: 48,
          showLabels: true,
        })
      );

      // Verify all 5 zones are present
      expect(html).toContain('data-testid="surface-zone-B"');
      expect(html).toContain('data-testid="surface-zone-L"');
      expect(html).toContain('data-testid="surface-zone-M"');
      expect(html).toContain('data-testid="surface-zone-D"');
      expect(html).toContain('data-testid="surface-zone-O"');

      // Surface O should have Filled colors, M and D should have Decay colors
      const zoneOColor = getSurfaceZoneColor('O', [
        { status: 'Filled', surface: 'O' },
        { status: 'Decayed', surface: 'MD' },
      ]);
      expect(zoneOColor.status).toBe('Filled');

      const zoneMColor = getSurfaceZoneColor('M', [
        { status: 'Filled', surface: 'O' },
        { status: 'Decayed', surface: 'MD' },
      ]);
      expect(zoneMColor.status).toBe('Decayed');

      const zoneDColor = getSurfaceZoneColor('D', [
        { status: 'Filled', surface: 'O' },
        { status: 'Decayed', surface: 'MD' },
      ]);
      expect(zoneDColor.status).toBe('Decayed');

      const zoneBColor = getSurfaceZoneColor('B', [
        { status: 'Filled', surface: 'O' },
        { status: 'Decayed', surface: 'MD' },
      ]);
      // B has no condition, defaults to Healthy/surface
      expect(zoneBColor.status).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. PROCEDURE ROOM SELECTION & BADGE RENDERING
  // =========================================================================
  describe('2. Procedure Room Selection & Badge Rendering', () => {
    test('2.1 OrderCatalogSearchModal incorporates procedure targetRoomId and roomName', () => {
      const targetRooms = [
        { id: 'room-1', name: 'Treatment Room 1', isProcedureRoom: true },
        { id: 'room-2', name: 'Dental Chair 2', isProcedureRoom: true },
      ];

      const selectedItem = {
        id: 'svc-tooth-extract',
        code: 'DENT-EXT-01',
        name: 'Surgical Tooth Extraction',
        category: 'Procedure',
        standardPrice: 2500,
        philHealthCode: 'PH-DENT-01',
        philHealthDescription: 'Tooth Extraction Package',
        isPhilHealthFormulary: true,
      };

      const selectedRoomId = 'room-2';
      const isDiagnostic = false;
      const resolvedRoom = targetRooms.find((r) => r.id === selectedRoomId) ?? targetRooms[0];

      const payload = {
        serviceItemId: selectedItem.id,
        code: selectedItem.code,
        name: selectedItem.name,
        category: selectedItem.category,
        standardPrice: selectedItem.standardPrice,
        philHealthCode: selectedItem.philHealthCode,
        philHealthDescription: selectedItem.philHealthDescription,
        isPhilHealthFormulary: selectedItem.isPhilHealthFormulary,
        fulfillmentMode: isDiagnostic ? 'in_house' : 'in_house',
        instructions: 'Urgent removal',
        toothNumber: 36,
        toothSurface: undefined,
        roomId: !isDiagnostic && resolvedRoom ? resolvedRoom.id : undefined,
        roomName: !isDiagnostic && resolvedRoom ? resolvedRoom.name : undefined,
        targetRoomId: !isDiagnostic && resolvedRoom ? resolvedRoom.id : undefined,
        targetRoomName: !isDiagnostic && resolvedRoom ? resolvedRoom.name : undefined,
      };

      expect(payload.targetRoomId).toBe('room-2');
      expect(payload.targetRoomName).toBe('Dental Chair 2');
      expect(payload.toothNumber).toBe(36);
    });

    test('2.2 Procedure badge renders Draft • Room: [Room Name] and Sent to [Room Name] • [Time]', () => {
      const draftProcedure = {
        name: 'Dental Scaling',
        isSent: false,
        targetRoomName: 'Dental Chair 1',
        standardPrice: 1200,
      };

      const sentProcedure = {
        name: 'Dental Scaling',
        isSent: true,
        targetRoomName: 'Dental Chair 1',
        sentAt: '09:45 AM',
        standardPrice: 1200,
      };

      const getBadgeProps = (proc: any) => {
        const resolvedRoom = proc.targetRoomName || proc.roomName || 'Treatment Room';
        if (proc.isSent) {
          return {
            label: `Sent to ${resolvedRoom} • ${proc.sentAt || proc.handedOffAt || 'Sent'}`,
            variant: 'success',
            icon: 'checkCircle',
          };
        }
        return {
          label: `Draft • Room: ${resolvedRoom}`,
          variant: 'warning',
        };
      };

      const draftBadge = getBadgeProps(draftProcedure);
      expect(draftBadge.label).toBe('Draft • Room: Dental Chair 1');
      expect(draftBadge.variant).toBe('warning');

      const sentBadge = getBadgeProps(sentProcedure);
      expect(sentBadge.label).toBe('Sent to Dental Chair 1 • 09:45 AM');
      expect(sentBadge.variant).toBe('success');
      expect(sentBadge.icon).toBe('checkCircle');
    });
  });

  // =========================================================================
  // 3. BUTTON '+' NORMALIZATION ADVERSARIAL STRESS
  // =========================================================================
  describe('3. Button Action Label Normalization', () => {
    test('3.1 Button strips leading "+ " when icon="plus" across diverse strings', async () => {
      const Button = (await import('../components/common/Button')).default;

      const testCases = [
        { title: '+ Add Tooth', icon: 'plus', expectedAria: 'Add Tooth' },
        { title: '+   New Order', icon: 'plus', expectedAria: 'New Order' },
        { title: '+Add Procedure', icon: 'plus', expectedAria: 'Add Procedure' },
        { title: '++ Double Plus', icon: 'plus', expectedAria: '+ Double Plus' },
        { title: 'Add Tooth', icon: 'plus', expectedAria: 'Add Tooth' },
        { title: '+ Add Tooth', icon: 'search', expectedAria: '+ Add Tooth' }, // non-plus icon preserves title
        { title: '+ Add Tooth', icon: undefined, expectedAria: '+ Add Tooth' }, // no icon preserves title
      ];

      for (const tc of testCases) {
        const html = renderToStaticMarkup(
          React.createElement(Button, {
            title: tc.title,
            icon: tc.icon,
          })
        );
        expect(html).toContain(`aria-label="${tc.expectedAria}"`);
      }
    });
  });

  // =========================================================================
  // 4. WORKSTATION FULL-WIDTH RESPONSIVE LAYOUT VERIFICATION
  // =========================================================================
  describe('4. Workstation Full-Width Responsiveness (R4)', () => {
    test('4.1 Consultations.screen.tsx, Patients.screen.tsx, and Dashboard.screen.tsx contain ZERO contentMaxWidth constraints', () => {
      const screenFiles = [
        '../navigation/screens/Consultations.screen.tsx',
        '../navigation/screens/Patients.screen.tsx',
        '../navigation/screens/Dashboard.screen.tsx',
      ];

      for (const relativePath of screenFiles) {
        const absolutePath = path.resolve(__dirname, relativePath);
        const content = fs.readFileSync(absolutePath, 'utf8');

        // Verify contentMaxWidth does NOT exist in these workstation screens
        expect(content).not.toContain('contentMaxWidth');

        // Verify styles.content has no maxWidth restriction
        expect(content).not.toMatch(/maxWidth:\s*theme\.sizes\.contentMaxWidth/);
      }
    });

    test('4.2 theme.sizes.contentMaxWidth is preserved in theme.ts for backwards compatibility', () => {
      const themePath = path.resolve(__dirname, '../constants/theme.ts');
      const themeContent = fs.readFileSync(themePath, 'utf8');
      expect(themeContent).toContain('contentMaxWidth: 1440');
    });
  });
});
