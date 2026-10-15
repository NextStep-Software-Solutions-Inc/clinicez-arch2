// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';

(globalThis as any).__DEV__ = true;

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s },
  View: 'View',
  Pressable: 'Pressable',
  ScrollView: 'ScrollView',
  TextInput: 'TextInput',
  Text: 'Text',
  ActivityIndicator: 'ActivityIndicator',
  Modal: 'Modal',
  KeyboardAvoidingView: 'KeyboardAvoidingView',
  FlatList: 'FlatList',
  SectionList: 'SectionList',
  Switch: 'Switch',
  TouchableOpacity: 'TouchableOpacity',
  TouchableHighlight: 'TouchableOpacity',
  Image: 'Image',
  RefreshControl: 'RefreshControl',
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { addEventListener: () => ({ remove: () => {} }) },
  Platform: { OS: 'web', select: (obj: any) => obj.web || obj.default },
  Touchable: { Mixin: {} },
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
    View: 'Animated.View',
    Text: 'Animated.Text',
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
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { clinicService } = await import('../services/clinicService');
const { clinicApiClient } = await import('../services/apiClient');
const { default: PatientDirectoryCard } = await import('../components/patient/PatientDirectoryCard');
const { calculateVirtualWindow } = await import('../utils/useVirtualList');

describe('Patient Directory Scalability & Infinite Scroll Contract', () => {
  test('1. clinicService.getPatients serializes page, pageSize=50 default, filterMode, and search correctly', async () => {
    let capturedUrl = '';
    const originalGet = clinicApiClient.get;
    (clinicApiClient as any).get = async (url: string) => {
      capturedUrl = url;
      return [[], null];
    };

    try {
      // Default parameters: page=1, pageSize=50
      await clinicService.getPatients();
      expect(capturedUrl).toBe('/patients?page=1&pageSize=50');

      // Search term
      await clinicService.getPatients('Santos');
      expect(capturedUrl).toBe('/patients?search=Santos&page=1&pageSize=50');

      // hasAlerts flag
      await clinicService.getPatients('Santos', true);
      expect(capturedUrl).toBe('/patients?search=Santos&hasAlerts=true&page=1&pageSize=50');

      // filterMode: ALERTS
      await clinicService.getPatients(undefined, undefined, 1, 50, 'ALERTS');
      expect(capturedUrl).toBe('/patients?filterMode=ALERTS&page=1&pageSize=50');

      // filterMode: SENIOR_PWD
      await clinicService.getPatients(undefined, undefined, 2, 50, 'SENIOR_PWD');
      expect(capturedUrl).toBe('/patients?filterMode=SENIOR_PWD&page=2&pageSize=50');

      // Next page loading in batches of 50
      await clinicService.getPatients('Dela Cruz', false, 5, 50);
      expect(capturedUrl).toBe('/patients?search=Dela+Cruz&hasAlerts=false&page=5&pageSize=50');
    } finally {
      (clinicApiClient as any).get = originalGet;
    }
  });

  test('2. PatientDirectoryCard is wrapped in React.memo for high-density 10,000-record render optimization', () => {
    // React.memo components have $$typeof === Symbol.for('react.memo')
    expect((PatientDirectoryCard as any).$$typeof).toBe(Symbol.for('react.memo'));
  });

  test('3. Patients.screen.tsx strictly adheres to infinite scroll requirements', () => {
    const screenCode = readFileSync(join(__dirname, '../navigation/screens/Patients.screen.tsx'), 'utf-8');

    // 3.1 Hardcoded PAGE_SIZE = 50 items at a time
    expect(screenCode).toContain('const PAGE_SIZE = 50;');

    // 3.2 Page size selector buttons [50, 250, 500, 1000] are completely removed
    expect(screenCode).not.toContain('setPageSize');
    expect(screenCode).not.toContain('PAGE_SIZES = [50, 250, 500, 1000]');
    expect(screenCode).not.toContain('styles.pageSizeSelector');

    // 3.3 Near-bottom detection and loadMorePatients trigger
    expect(screenCode).toContain('contentOffset.y >= contentSize.height - 350');
    expect(screenCode).toContain('loadMorePatients()');

    // 3.4 Server-side filter mode integration
    expect(screenCode).toContain("const serverFilterMode = (activeFilter === 'ALERTS' || activeFilter === 'SENIOR_PWD') ? activeFilter : undefined;");

    // 3.5 Infinite scroll bottom indicator & load button
    expect(screenCode).toContain('Loading more patients (50 at a time)...');
    expect(screenCode).toContain('Load more patients');
    expect(screenCode).toContain("All {filteredPatients.length} {filteredPatients.length === 1 ? 'patient' : 'patients'} loaded");
  });

  test('4. calculateVirtualWindow windows 10,000 items in Card mode (itemsPerRow=2) with constant DOM footprint', () => {
    // Top of list: scrollY = 0
    const topWindow = calculateVirtualWindow({
      totalCount: 10000,
      itemHeight: 270,
      viewportHeight: 800,
      scrollY: 0,
      listTopOffset: 180,
      itemsPerRow: 2,
      overscan: 4,
    });

    expect(topWindow.isVirtualizing).toBe(true);
    expect(topWindow.startIndex).toBe(0);
    expect(topWindow.endIndex).toBe(14); // 7 rows * 2 = 14 items
    expect(topWindow.visibleCount).toBe(14);
    expect(topWindow.paddingTop).toBe(0);
    expect(topWindow.totalRows).toBe(5000);
    expect(topWindow.totalHeight).toBe(5000 * 270);
    // Height invariant: paddingTop + visibleRows * itemHeight + paddingBottom === totalHeight
    expect(topWindow.paddingTop + (topWindow.visibleCount / 2) * 270 + topWindow.paddingBottom).toBe(topWindow.totalHeight);

    // Deep scroll: scrollY = 50,000
    const deepWindow = calculateVirtualWindow({
      totalCount: 10000,
      itemHeight: 270,
      viewportHeight: 800,
      scrollY: 50000,
      listTopOffset: 180,
      itemsPerRow: 2,
      overscan: 4,
    });

    expect(deepWindow.isVirtualizing).toBe(true);
    expect(deepWindow.startIndex).toBeGreaterThan(0);
    // Even with 10,000 records, only ~20-24 items are mounted in DOM!
    expect(deepWindow.visibleCount).toBeLessThanOrEqual(30);
    expect(deepWindow.paddingTop).toBeGreaterThan(0);
    expect(deepWindow.paddingBottom).toBeGreaterThan(0);
    expect(deepWindow.paddingTop + (deepWindow.visibleCount / 2) * 270 + deepWindow.paddingBottom).toBe(deepWindow.totalHeight);
  });

  test('5. calculateVirtualWindow windows 10,000 items in Table mode (itemsPerRow=1) with exact row heights', () => {
    const tableWindow = calculateVirtualWindow({
      totalCount: 10000,
      itemHeight: 64,
      viewportHeight: 800,
      scrollY: 10000,
      listTopOffset: 180,
      itemsPerRow: 1,
      overscan: 8,
    });

    expect(tableWindow.isVirtualizing).toBe(true);
    expect(tableWindow.startIndex).toBeGreaterThan(0);
    // Only ~30 rows in DOM instead of 10,000!
    expect(tableWindow.visibleCount).toBeLessThanOrEqual(40);
    expect(tableWindow.paddingTop + tableWindow.visibleCount * 64 + tableWindow.paddingBottom).toBe(tableWindow.totalHeight);
    expect(tableWindow.totalHeight).toBe(640000);
  });

  test('6. Patients.screen.tsx integrates list virtualization into both Table and Card render trees', () => {
    const screenCode = readFileSync(join(__dirname, '../navigation/screens/Patients.screen.tsx'), 'utf-8');

    // 6.1 Virtualization hook import and usage
    expect(screenCode).toContain("import { useVirtualList } from '../../utils/useVirtualList';");
    expect(screenCode).toContain('const virtualWindow = useVirtualList({');
    expect(screenCode).toContain('items: filteredPatients,');

    // 6.2 Virtual spacers for Card mode
    expect(screenCode).toContain('styles.virtualListContainer');
    expect(screenCode).toContain('virtualWindow.paddingTop > 0');
    expect(screenCode).toContain('virtualWindow.paddingBottom > 0');
    expect(screenCode).toContain('visibleCardRows.map');

    // 6.3 Virtual spacers for Table mode
    expect(screenCode).toContain('virtualWindow.visibleItems.map');

    // 6.4 Dynamic offset measurement via onLayout
    expect(screenCode).toContain('setListTopOffset(layoutY)');

    // 6.5 Throttled scroll tracking
    expect(screenCode).toContain('setScrollY(currentY)');
  });
});
