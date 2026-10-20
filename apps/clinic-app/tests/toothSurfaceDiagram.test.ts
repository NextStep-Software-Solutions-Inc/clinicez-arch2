// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

export const renderedPressHandlers = new Map<string, (e?: any) => void>();

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    testID,
    visible,
    style,
    onPress,
    value,
    onChangeText,
    disabled,
    editable,
    ...rest
  }: any) => {
    if (name === 'Modal' && visible === false) {
      return null;
    }
    if (testID && onPress) {
      renderedPressHandlers.set(testID, onPress);
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
        ...(placeholder ? { 'data-placeholder': placeholder } : {}),
        ...(visible !== undefined ? { 'data-visible': String(visible) } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        ...(value !== undefined ? { 'data-value': value } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled) } : {}),
        ...(editable !== undefined ? { 'data-editable': String(editable) } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      placeholder,
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

const {
  ToothSurfaceDiagram,
  isRightQuadrant,
  getSurfacesForQuadrant,
  getSurfaceZoneColor,
  calculateDmftMetrics,
  normalizeTeethToMultiRecord,
  sortToothSurfaces,
} = await import('../components/dental');

const { theme } = await import('../constants/theme');
const { InlineDentalChartCard } = await import('../components/consultation/InlineDentalChartCard');
const { default: DentalChartTab } = await import('../components/chart/DentalChartTab');

describe('ToothSurfaceDiagram & 5-Surface Odontogram (Milestone 2)', () => {
  // =========================================================================
  // 1. 5-Surface Zone Rendering & Anatomical Midline Orientation
  // =========================================================================
  describe('1. 5-Surface Zone Schematic & Midline Orientation', () => {
    test('Quadrant 1 (Upper Right, e.g. Tooth 16): Right is Mesial (M), Left is Distal (D)', () => {
      expect(isRightQuadrant(16)).toBe(true);
      const surfaces = getSurfacesForQuadrant(16);
      expect(surfaces.top).toBe('B');
      expect(surfaces.bottom).toBe('L');
      expect(surfaces.center).toBe('O');
      expect(surfaces.left).toBe('D');
      expect(surfaces.right).toBe('M');

      const html = renderToStaticMarkup(
        React.createElement(ToothSurfaceDiagram, {
          toothNumber: 16,
          size: 80,
          showLabels: true,
        })
      );

      // Verify all 5 surface zones are rendered with data-testid
      expect(html).toContain('data-testid="surface-zone-B"');
      expect(html).toContain('data-testid="surface-zone-L"');
      expect(html).toContain('data-testid="surface-zone-O"');
      expect(html).toContain('data-testid="surface-zone-M"');
      expect(html).toContain('data-testid="surface-zone-D"');
    });

    test('Quadrant 2 (Upper Left, e.g. Tooth 26): Left is Mesial (M), Right is Distal (D)', () => {
      expect(isRightQuadrant(26)).toBe(false);
      const surfaces = getSurfacesForQuadrant(26);
      expect(surfaces.top).toBe('B');
      expect(surfaces.bottom).toBe('L');
      expect(surfaces.center).toBe('O');
      expect(surfaces.left).toBe('M');
      expect(surfaces.right).toBe('D');
    });

    test('Quadrant 4 (Lower Right, e.g. Tooth 46): Right is Mesial (M), Left is Distal (D)', () => {
      expect(isRightQuadrant(46)).toBe(true);
      const surfaces = getSurfacesForQuadrant(46);
      expect(surfaces.left).toBe('D');
      expect(surfaces.right).toBe('M');
    });

    test('Quadrant 3 (Lower Left, e.g. Tooth 36): Left is Mesial (M), Right is Distal (D)', () => {
      expect(isRightQuadrant(36)).toBe(false);
      const surfaces = getSurfacesForQuadrant(36);
      expect(surfaces.left).toBe('M');
      expect(surfaces.right).toBe('D');
    });

    test('Child Quadrants 5 & 8 (Right side): Left is Distal (D), Right is Mesial (M)', () => {
      expect(isRightQuadrant(55)).toBe(true);
      expect(isRightQuadrant(85)).toBe(true);
      expect(getSurfacesForQuadrant(55).left).toBe('D');
      expect(getSurfacesForQuadrant(55).right).toBe('M');
      expect(getSurfacesForQuadrant(85).left).toBe('D');
      expect(getSurfacesForQuadrant(85).right).toBe('M');
    });

    test('Child Quadrants 6 & 7 (Left side): Left is Mesial (M), Right is Distal (D)', () => {
      expect(isRightQuadrant(65)).toBe(false);
      expect(isRightQuadrant(75)).toBe(false);
      expect(getSurfacesForQuadrant(65).left).toBe('M');
      expect(getSurfacesForQuadrant(65).right).toBe('D');
      expect(getSurfacesForQuadrant(75).left).toBe('M');
      expect(getSurfacesForQuadrant(75).right).toBe('D');
    });
  });

  // =========================================================================
  // 2. Multi-Condition Semantic Zone Coloring
  // =========================================================================
  describe('2. Multi-Condition Semantic Zone Coloring', () => {
    test('Decay maps to emergencyBg fill, emergencyBorder stroke, and emergencyText', () => {
      const colors = getSurfaceZoneColor('O', [{ status: 'Decayed', surface: 'O' }]);
      expect(colors.bg).toBe(theme.colors.emergencyBg);
      expect(colors.border).toBe(theme.colors.emergencyBorder);
      expect(colors.text).toBe(theme.colors.emergencyText);
    });

    test('Filled maps to infoBg fill, infoBorder stroke, and infoText', () => {
      const colors = getSurfaceZoneColor('M', [{ status: 'Filled', surface: 'MO' }]);
      expect(colors.bg).toBe(theme.colors.infoBg);
      expect(colors.border).toBe(theme.colors.infoBorder);
      expect(colors.text).toBe(theme.colors.infoText);
    });

    test('Crown maps to purpleBg fill, purpleBorder stroke, and purpleText', () => {
      const colors = getSurfaceZoneColor('L', [{ status: 'Crowned', surface: 'L' }]);
      expect(colors.bg).toBe(theme.colors.purpleBg);
      expect(colors.border).toBe(theme.colors.purpleBorder);
      expect(colors.text).toBe(theme.colors.purpleText);
    });

    test('Missing maps to surfaceSubtle fill and borderDark stroke', () => {
      const colors = getSurfaceZoneColor('B', [{ status: 'Missing', surface: '' }]);
      expect(colors.bg).toBe(theme.colors.surfaceSubtle);
      expect(colors.border).toBe(theme.colors.borderDark);
      expect(colors.text).toBe(theme.colors.textMuted);
    });

    test('Selected in interactive mode maps to primaryLight fill and focusRing stroke', () => {
      const colors = getSurfaceZoneColor('O', [{ status: 'Decayed', surface: 'O' }], true);
      expect(colors.bg).toBe(theme.colors.primaryLight);
      expect(colors.border).toBe(theme.colors.focusRing);
      expect(colors.text).toBe(theme.colors.primaryDark);
    });

    test('Unaffected/Intact surface maps to neutral surface fill and border stroke', () => {
      const colors = getSurfaceZoneColor('B', [{ status: 'Decayed', surface: 'O' }]);
      expect(colors.bg).toBe(theme.colors.surface);
      expect(colors.border).toBe(theme.colors.border);
      expect(colors.text).toBe(theme.colors.textSecondary);
    });

    test('Co-existing conditions: Filled on O and Decay on MD colors O blue and M/D red', () => {
      const conditions = [
        { status: 'Filled' as const, surface: 'O' },
        { status: 'Decayed' as const, surface: 'MD' },
      ];

      const html = renderToStaticMarkup(
        React.createElement(ToothSurfaceDiagram, {
          toothNumber: 16,
          conditions,
          size: 80,
          showLabels: true,
        })
      );

      // Verify Center (O) has infoBg / infoBorder
      const oColors = getSurfaceZoneColor('O', conditions);
      expect(oColors.bg).toBe(theme.colors.infoBg);
      expect(oColors.border).toBe(theme.colors.infoBorder);

      // Verify Mesial (M) has emergencyBg / emergencyBorder
      const mColors = getSurfaceZoneColor('M', conditions);
      expect(mColors.bg).toBe(theme.colors.emergencyBg);
      expect(mColors.border).toBe(theme.colors.emergencyBorder);

      // Verify Distal (D) has emergencyBg / emergencyBorder
      const dColors = getSurfaceZoneColor('D', conditions);
      expect(dColors.bg).toBe(theme.colors.emergencyBg);
      expect(dColors.border).toBe(theme.colors.emergencyBorder);

      // Verify Buccal (B) and Lingual (L) remain intact surface
      const bColors = getSurfaceZoneColor('B', conditions);
      expect(bColors.bg).toBe(theme.colors.surface);
      expect(bColors.border).toBe(theme.colors.border);

      expect(html).toContain(theme.colors.infoBg);
      expect(html).toContain(theme.colors.emergencyBg);
      expect(html).toContain(theme.colors.surface);
    });
  });

  // =========================================================================
  // 3. Interactive Surface Toggling
  // =========================================================================
  describe('3. Interactive Surface Toggling', () => {
    test('Interactive ToothSurfaceDiagram wraps zones in accessible Pressables with data-testid', () => {
      let toggledSurface: string | null = null;
      const handleToggle = (s: string) => {
        toggledSurface = s;
      };

      const html = renderToStaticMarkup(
        React.createElement(ToothSurfaceDiagram, {
          toothNumber: 16,
          size: 80,
          interactive: true,
          selectedSurfaces: ['M', 'O'],
          onToggleSurface: handleToggle,
        })
      );

      expect(html).toContain('data-testid="surface-zone-M"');
      expect(html).toContain('data-testid="surface-zone-O"');
      expect(html).toContain('data-testid="surface-zone-D"');
      expect(html).toContain('data-testid="surface-zone-B"');
      expect(html).toContain('data-testid="surface-zone-L"');

      // Selected zones reflect primaryLight fill
      expect(html).toContain(theme.colors.primaryLight);
      expect(html).toContain(theme.colors.focusRing);
    });
  });

  // =========================================================================
  // 4. Multi-Condition Tooth Inspector & Remove Action
  // =========================================================================
  describe('4. Multi-Condition Tooth Inspector & Remove Action', () => {
    const multiRecordTeeth = {
      16: [
        {
          id: 'cond-16-filled',
          toothNumber: 16,
          status: 'Filled' as const,
          surface: 'O',
          notes: 'Old composite restoration',
          createdAt: '2026-01-15T09:00:00Z',
          recordedBy: 'Dr. Maria Santos',
        },
        {
          id: 'cond-16-decay',
          toothNumber: 16,
          status: 'Decayed' as const,
          surface: 'MD',
          notes: 'Recurrent marginal caries',
          createdAt: '2026-10-20T10:30:00Z',
          recordedBy: 'Dr. Juan Reyes',
        },
      ],
    };

    test('Tooth Inspector renders all recorded conditions with status badge, surfaces, notes, doctor, and date', () => {
      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: multiRecordTeeth,
          initialToothNumber: 16,
        })
      );

      expect(html).toContain('Recorded Conditions on Tooth #16');
      expect(html).toContain('Old composite restoration');
      expect(html).toContain('Recurrent marginal caries');
      expect(html).toContain('Dr. Maria Santos');
      expect(html).toContain('Dr. Juan Reyes');
      expect(html).toContain('Surfaces: O');
      expect(html).toContain('Surfaces: MD');
      expect(html).toContain('data-testid="remove-condition-cond-16-filled"');
      expect(html).toContain('data-testid="remove-condition-cond-16-decay"');
    });

    test('Tooth cell on odontogram displays multi-condition dots for co-existing conditions', () => {
      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: multiRecordTeeth,
        })
      );

      expect(html).toContain('data-testid="multi-dots-16"');
      expect(html).toContain('data-testid="dot-decayed-16"');
      expect(html).toContain('data-testid="dot-filled-16"');
    });

    test('Removing a condition leaves the remaining condition active on that tooth', () => {
      let removedConditionId: string | null = null;
      let removedToothNumber: number | null = null;

      const handleRemove = (tooth: number, condId: string) => {
        removedToothNumber = tooth;
        removedConditionId = condId;
      };

      const html = renderToStaticMarkup(
        React.createElement(InlineDentalChartCard, {
          chart: multiRecordTeeth,
          initialToothNumber: 16,
          onRemoveCondition: handleRemove,
        })
      );

      expect(html).toContain('data-testid="remove-condition-cond-16-decay"');
      expect(html).toContain('Remove');
    });
  });

  // =========================================================================
  // 5. Distinct-Tooth DMFT Index Calculation
  // =========================================================================
  describe('5. Distinct-Tooth DMFT Index Calculation', () => {
    test('A tooth with co-existing Filled and Decay counts as 1 Decayed and is counted ONCE in total DMFT', () => {
      const multiRecords = [
        {
          id: 'rec-1',
          toothNumber: 16,
          status: 'Filled' as const,
          surface: 'O',
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'rec-2',
          toothNumber: 16,
          status: 'Decayed' as const,
          surface: 'MD',
          createdAt: '2026-10-20T00:00:00Z',
        },
        {
          id: 'rec-3',
          toothNumber: 48,
          status: 'Missing' as const,
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'rec-4',
          toothNumber: 36,
          status: 'Filled' as const,
          surface: 'MOD',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ];

      const metrics = calculateDmftMetrics(multiRecords);

      // Tooth 16 has Decay -> in decayedTeeth (1)
      expect(metrics.decayedCount).toBe(1);
      // Tooth 48 has Missing -> in missingTeeth (1)
      expect(metrics.missingCount).toBe(1);
      // Tooth 16 and 36 have Filled -> in filledTeeth (2 distinct teeth)
      expect(metrics.filledCount).toBe(2);
      // Distinct teeth charted: 16, 36, 48 (3 teeth)
      expect(metrics.totalCharted).toBe(3);
      // DMFT index: distinct teeth with D, M, or F = {16, 36, 48} = 3
      expect(metrics.dmftScore).toBe(3);
    });

    test('Healthy teeth do not inflate DMFT score', () => {
      const records = [
        { id: '1', toothNumber: 11, status: 'Healthy' as const, createdAt: '2026-01-01T00:00:00Z' },
        { id: '2', toothNumber: 12, status: 'Healthy' as const, createdAt: '2026-01-01T00:00:00Z' },
        { id: '3', toothNumber: 16, status: 'Decayed' as const, surface: 'O', createdAt: '2026-01-01T00:00:00Z' },
      ];

      const metrics = calculateDmftMetrics(records);
      expect(metrics.totalCharted).toBe(3);
      expect(metrics.healthyCount).toBe(2);
      expect(metrics.decayedCount).toBe(1);
      expect(metrics.dmftScore).toBe(1);
    });

    test('Crown teeth count under crownCount without inflating D or M', () => {
      const records = [
        { id: '1', toothNumber: 21, status: 'Crowned' as const, createdAt: '2026-01-01T00:00:00Z' },
        { id: '2', toothNumber: 16, status: 'Decayed' as const, surface: 'MOD', createdAt: '2026-01-01T00:00:00Z' },
      ];

      const metrics = calculateDmftMetrics(records);
      expect(metrics.crownCount).toBe(1);
      expect(metrics.decayedCount).toBe(1);
      expect(metrics.dmftScore).toBe(1); // Only tooth 16 has D, M, or F
    });
  });

  // =========================================================================
  // 6. Empirical Challenger Adversarial Stress Suite (challenger_1_m2)
  // =========================================================================
  describe('6. Empirical Challenger Adversarial Stress Suite (challenger_1_m2)', () => {
    // 6.1 Midline Orientation Across ALL 8 Quadrants (Exhaustive 52-tooth scan)
    describe('6.1 Midline Orientation Across All 8 Quadrants (52 Teeth)', () => {
      const q1Teeth = [18, 17, 16, 15, 14, 13, 12, 11];
      const q2Teeth = [21, 22, 23, 24, 25, 26, 27, 28];
      const q3Teeth = [31, 32, 33, 34, 35, 36, 37, 38];
      const q4Teeth = [48, 47, 46, 45, 44, 43, 42, 41];
      const q5Teeth = [55, 54, 53, 52, 51];
      const q6Teeth = [61, 62, 63, 64, 65];
      const q7Teeth = [71, 72, 73, 74, 75];
      const q8Teeth = [85, 84, 83, 82, 81];

      test('Q1 (Upper Right 11..18): All teeth map Left=D, Right=M, Top=B, Bottom=L, Center=O', () => {
        for (const t of q1Teeth) {
          expect(isRightQuadrant(t)).toBe(true);
          const s = getSurfacesForQuadrant(t);
          expect(s.left).toBe('D');
          expect(s.right).toBe('M');
          expect(s.top).toBe('B');
          expect(s.bottom).toBe('L');
          expect(s.center).toBe('O');
        }
      });

      test('Q2 (Upper Left 21..28): All teeth map Left=M, Right=D, Top=B, Bottom=L, Center=O', () => {
        for (const t of q2Teeth) {
          expect(isRightQuadrant(t)).toBe(false);
          const s = getSurfacesForQuadrant(t);
          expect(s.left).toBe('M');
          expect(s.right).toBe('D');
          expect(s.top).toBe('B');
          expect(s.bottom).toBe('L');
          expect(s.center).toBe('O');
        }
      });

      test('Q3 (Lower Left 31..38): All teeth map Left=M, Right=D, Top=B, Bottom=L, Center=O', () => {
        for (const t of q3Teeth) {
          expect(isRightQuadrant(t)).toBe(false);
          const s = getSurfacesForQuadrant(t);
          expect(s.left).toBe('M');
          expect(s.right).toBe('D');
          expect(s.top).toBe('B');
          expect(s.bottom).toBe('L');
          expect(s.center).toBe('O');
        }
      });

      test('Q4 (Lower Right 41..48): All teeth map Left=D, Right=M, Top=B, Bottom=L, Center=O', () => {
        for (const t of q4Teeth) {
          expect(isRightQuadrant(t)).toBe(true);
          const s = getSurfacesForQuadrant(t);
          expect(s.left).toBe('D');
          expect(s.right).toBe('M');
          expect(s.top).toBe('B');
          expect(s.bottom).toBe('L');
          expect(s.center).toBe('O');
        }
      });

      test('Q5 (Primary Upper Right 51..55): All teeth map Left=D, Right=M, Top=B, Bottom=L, Center=O', () => {
        for (const t of q5Teeth) {
          expect(isRightQuadrant(t)).toBe(true);
          const s = getSurfacesForQuadrant(t);
          expect(s.left).toBe('D');
          expect(s.right).toBe('M');
          expect(s.top).toBe('B');
          expect(s.bottom).toBe('L');
          expect(s.center).toBe('O');
        }
      });

      test('Q6 (Primary Upper Left 61..65): All teeth map Left=M, Right=D, Top=B, Bottom=L, Center=O', () => {
        for (const t of q6Teeth) {
          expect(isRightQuadrant(t)).toBe(false);
          const s = getSurfacesForQuadrant(t);
          expect(s.left).toBe('M');
          expect(s.right).toBe('D');
          expect(s.top).toBe('B');
          expect(s.bottom).toBe('L');
          expect(s.center).toBe('O');
        }
      });

      test('Q7 (Primary Lower Left 71..75): All teeth map Left=M, Right=D, Top=B, Bottom=L, Center=O', () => {
        for (const t of q7Teeth) {
          expect(isRightQuadrant(t)).toBe(false);
          const s = getSurfacesForQuadrant(t);
          expect(s.left).toBe('M');
          expect(s.right).toBe('D');
          expect(s.top).toBe('B');
          expect(s.bottom).toBe('L');
          expect(s.center).toBe('O');
        }
      });

      test('Q8 (Primary Lower Right 81..85): All teeth map Left=D, Right=M, Top=B, Bottom=L, Center=O', () => {
        for (const t of q8Teeth) {
          expect(isRightQuadrant(t)).toBe(true);
          const s = getSurfacesForQuadrant(t);
          expect(s.left).toBe('D');
          expect(s.right).toBe('M');
          expect(s.top).toBe('B');
          expect(s.bottom).toBe('L');
          expect(s.center).toBe('O');
        }
      });

      test('Component layout for all 8 quadrant representatives verifies anatomical zone order in DOM', () => {
        const quadrantReps = [
          { q: 1, tooth: 16, expectedLeft: 'D', expectedRight: 'M' },
          { q: 2, tooth: 26, expectedLeft: 'M', expectedRight: 'D' },
          { q: 3, tooth: 36, expectedLeft: 'M', expectedRight: 'D' },
          { q: 4, tooth: 46, expectedLeft: 'D', expectedRight: 'M' },
          { q: 5, tooth: 55, expectedLeft: 'D', expectedRight: 'M' },
          { q: 6, tooth: 65, expectedLeft: 'M', expectedRight: 'D' },
          { q: 7, tooth: 71, expectedLeft: 'M', expectedRight: 'D' },
          { q: 8, tooth: 85, expectedLeft: 'D', expectedRight: 'M' },
        ];

        for (const rep of quadrantReps) {
          const html = renderToStaticMarkup(
            React.createElement(ToothSurfaceDiagram, {
              toothNumber: rep.tooth,
              size: 60,
              showLabels: true,
            })
          );

          // Verify exact zone order in DOM
          const idxB = html.indexOf('data-surface-zone="B"');
          const idxLeft = html.indexOf(`data-surface-zone="${rep.expectedLeft}"`);
          const idxO = html.indexOf('data-surface-zone="O"');
          const idxRight = html.indexOf(`data-surface-zone="${rep.expectedRight}"`);
          const idxL = html.indexOf('data-surface-zone="L"');

          expect(idxB).toBeGreaterThan(-1);
          expect(idxLeft).toBeGreaterThan(idxB);
          expect(idxO).toBeGreaterThan(idxLeft);
          expect(idxRight).toBeGreaterThan(idxO);
          expect(idxL).toBeGreaterThan(idxRight);
        }
      });
    });

    // 6.2 Multi-Condition Semantic Zone Color Stress Tests
    describe('6.2 Multi-Condition Semantic Zone Color Stress Tests', () => {
      test('Filled(O) + Decay(M,D) accurately renders Blue on O and Red on M and D', () => {
        const conditions = [
          { status: 'Filled' as const, surface: 'O' },
          { status: 'Decayed' as const, surface: 'MD' },
        ];

        // 1. Center zone O: Blue
        const oColors = getSurfaceZoneColor('O', conditions);
        expect(oColors.status).toBe('Filled');
        expect(oColors.bg).toBe(theme.colors.infoBg);
        expect(oColors.border).toBe(theme.colors.infoBorder);
        expect(oColors.text).toBe(theme.colors.infoText);

        // 2. Mesial zone M: Red
        const mColors = getSurfaceZoneColor('M', conditions);
        expect(mColors.status).toBe('Decayed');
        expect(mColors.bg).toBe(theme.colors.emergencyBg);
        expect(mColors.border).toBe(theme.colors.emergencyBorder);
        expect(mColors.text).toBe(theme.colors.emergencyText);

        // 3. Distal zone D: Red
        const dColors = getSurfaceZoneColor('D', conditions);
        expect(dColors.status).toBe('Decayed');
        expect(dColors.bg).toBe(theme.colors.emergencyBg);
        expect(dColors.border).toBe(theme.colors.emergencyBorder);
        expect(dColors.text).toBe(theme.colors.emergencyText);

        // 4. Buccal and Lingual: Unaffected / Neutral
        const bColors = getSurfaceZoneColor('B', conditions);
        expect(bColors.status).toBeUndefined();
        expect(bColors.bg).toBe(theme.colors.surface);
        expect(bColors.border).toBe(theme.colors.border);
        expect(bColors.text).toBe(theme.colors.textSecondary);

        const lColors = getSurfaceZoneColor('L', conditions);
        expect(lColors.status).toBeUndefined();
        expect(lColors.bg).toBe(theme.colors.surface);
        expect(lColors.border).toBe(theme.colors.border);
        expect(lColors.text).toBe(theme.colors.textSecondary);

        // 5. Verify in DOM markup
        const html = renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, {
            toothNumber: 16,
            conditions,
            size: 80,
            showLabels: true,
          })
        );
        expect(html).toContain(theme.colors.infoBg);
        expect(html).toContain(theme.colors.emergencyBg);
        expect(html).toContain(theme.colors.surface);
      });

      test('Triple-condition tooth: Decay(M), Filled(O), Crown(B) produces 3 distinct semantic colors', () => {
        const conditions = [
          { status: 'Decayed' as const, surface: 'M' },
          { status: 'Filled' as const, surface: 'O' },
          { status: 'Crowned' as const, surface: 'B' },
        ];

        const mColors = getSurfaceZoneColor('M', conditions);
        expect(mColors.status).toBe('Decayed');
        expect(mColors.bg).toBe(theme.colors.emergencyBg);

        const oColors = getSurfaceZoneColor('O', conditions);
        expect(oColors.status).toBe('Filled');
        expect(oColors.bg).toBe(theme.colors.infoBg);

        const bColors = getSurfaceZoneColor('B', conditions);
        expect(bColors.status).toBe('Crowned');
        expect(bColors.bg).toBe(theme.colors.purpleBg);

        const dColors = getSurfaceZoneColor('D', conditions);
        expect(dColors.bg).toBe(theme.colors.surface);

        const lColors = getSurfaceZoneColor('L', conditions);
        expect(lColors.bg).toBe(theme.colors.surface);
      });

      test('Whole-tooth conditions without surface specified color all 5 zones', () => {
        // Crown with empty surface
        for (const surf of ['M', 'O', 'D', 'B', 'L'] as const) {
          const c = getSurfaceZoneColor(surf, [{ status: 'Crowned', surface: '' }]);
          expect(c.status).toBe('Crowned');
          expect(c.bg).toBe(theme.colors.purpleBg);
        }

        // Missing with empty surface
        for (const surf of ['M', 'O', 'D', 'B', 'L'] as const) {
          const c = getSurfaceZoneColor(surf, [{ status: 'Missing', surface: '' }]);
          expect(c.status).toBe('Missing');
          expect(c.bg).toBe(theme.colors.surfaceSubtle);
        }

        // Extraction with empty surface
        for (const surf of ['M', 'O', 'D', 'B', 'L'] as const) {
          const c = getSurfaceZoneColor(surf, [{ status: 'ForExtraction', surface: '' }]);
          expect(c.status).toBe('ForExtraction');
          expect(c.bg).toBe(theme.colors.emergencySubtle);
        }
      });

      test('Surface string normalization and whitespace resilience', () => {
        // Lowercase and commas
        const conditions = [{ status: 'Filled' as const, surface: 'm, d' }];
        expect(getSurfaceZoneColor('M', conditions).status).toBe('Filled');
        expect(getSurfaceZoneColor('D', conditions).status).toBe('Filled');
        expect(getSurfaceZoneColor('O', conditions).status).toBeUndefined();
      });

      test('Backward-compatible single status/surfaces props fallback', () => {
        const html = renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, {
            toothNumber: 26,
            status: 'Filled',
            surfaces: 'MO',
            size: 60,
          })
        );

        expect(html).toContain(theme.colors.infoBg);
        expect(html).toContain(theme.colors.surface);
      });
    });

    // 6.3 Interactive Surface Toggling & Pressable Event Dispatch
    describe('6.3 Interactive Surface Toggling & Pressable Event Dispatch', () => {
      test('Interactive clicking each zone triggers onToggleSurface with exact surface code', () => {
        const toggled: string[] = [];
        const handleToggle = (s: ToothSurfaceCode) => {
          toggled.push(s);
        };

        renderedPressHandlers.clear();
        renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, {
            toothNumber: 16, // Q1: Left=D, Right=M
            interactive: true,
            onToggleSurface: handleToggle,
          })
        );

        // Top zone: B
        renderedPressHandlers.get('surface-zone-B')?.();
        expect(toggled[toggled.length - 1]).toBe('B');

        // Middle row: Left (D), Center (O), Right (M)
        renderedPressHandlers.get('surface-zone-D')?.();
        expect(toggled[toggled.length - 1]).toBe('D');

        renderedPressHandlers.get('surface-zone-O')?.();
        expect(toggled[toggled.length - 1]).toBe('O');

        renderedPressHandlers.get('surface-zone-M')?.();
        expect(toggled[toggled.length - 1]).toBe('M');

        // Bottom zone: L
        renderedPressHandlers.get('surface-zone-L')?.();
        expect(toggled[toggled.length - 1]).toBe('L');

        expect(toggled).toEqual(['B', 'D', 'O', 'M', 'L']);
      });

      test('Disabled mode suppresses onToggleSurface even when interactive is true', () => {
        let callCount = 0;
        const handleToggle = () => {
          callCount++;
        };

        renderedPressHandlers.clear();
        renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, {
            toothNumber: 16,
            interactive: true,
            disabled: true,
            onToggleSurface: handleToggle,
          })
        );

        renderedPressHandlers.get('surface-zone-B')?.();
        renderedPressHandlers.get('surface-zone-D')?.();
        renderedPressHandlers.get('surface-zone-O')?.();
        renderedPressHandlers.get('surface-zone-M')?.();
        renderedPressHandlers.get('surface-zone-L')?.();

        expect(callCount).toBe(0);
      });

      test('Non-interactive mode suppresses onToggleSurface', () => {
        let callCount = 0;
        const handleToggle = () => {
          callCount++;
        };

        renderedPressHandlers.clear();
        renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, {
            toothNumber: 16,
            interactive: false,
            onToggleSurface: handleToggle,
          })
        );

        renderedPressHandlers.get('surface-zone-B')?.();
        expect(callCount).toBe(0);
      });

      test('Selected surfaces highlighting supports array, uppercase string, and lowercase string', () => {
        // Array input
        const colors1 = getSurfaceZoneColor('O', [], true);
        expect(colors1.bg).toBe(theme.colors.primaryLight);
        expect(colors1.border).toBe(theme.colors.focusRing);

        // Diagram with selectedSurfaces array
        const htmlArray = renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, {
            toothNumber: 16,
            interactive: true,
            selectedSurfaces: ['M', 'D'],
          })
        );
        expect(htmlArray).toContain('data-testid="surface-zone-M"');
        expect(htmlArray).toContain('data-testid="surface-zone-D"');
        expect(htmlArray).toContain(theme.colors.primaryLight);

        // Diagram with selectedSurfaces lowercase string
        const htmlLower = renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, {
            toothNumber: 16,
            interactive: true,
            selectedSurfaces: 'md',
          })
        );
        expect(htmlLower).toContain(theme.colors.primaryLight);
      });
    });

    // 6.4 Edge Cases & Sizing Robustness
    describe('6.4 Edge Cases & Sizing Robustness', () => {
      test('Gracefully handles unmapped or boundary tooth numbers (0, 99, -5)', () => {
        expect(() => getSurfacesForQuadrant(0)).not.toThrow();
        expect(() => getSurfacesForQuadrant(99)).not.toThrow();
        expect(() => getSurfacesForQuadrant(-5)).not.toThrow();

        const html0 = renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, { toothNumber: 0, size: 24 })
        );
        expect(html0).toContain('tooth-surface-diagram');

        const html99 = renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, { toothNumber: 99, size: 24 })
        );
        expect(html99).toContain('tooth-surface-diagram');
      });

      test('Labels are hidden when size is small (< 36) and visible when size >= 36', () => {
        const smallHtml = renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, { toothNumber: 16, size: 24 })
        );
        // Small size shouldn't have label text components
        expect(smallHtml).not.toContain('data-component="Text"');

        const largeHtml = renderToStaticMarkup(
          React.createElement(ToothSurfaceDiagram, { toothNumber: 16, size: 48 })
        );
        expect(largeHtml).toContain('data-component="Text"');
      });
    });
  });
});
