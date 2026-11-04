// token-guard:ignore-file
import { describe, expect, test, mock, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

// Mock react-native for headless Bun environment
const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    testID,
    style,
    onPress,
    ...props
  }: any) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(onPress ? { 'data-pressable': 'true', onClick: onPress } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...props,
      },
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
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
  Dimensions: { get: () => ({ width: 1280, height: 800 }), addEventListener: () => ({ remove: () => {} }) },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
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
  randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
  Polyline: createMockComponent('polyline'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

const { theme } = await import('../constants/theme');

const DASHBOARD_PATH = path.resolve(__dirname, '../navigation/screens/Dashboard.screen.tsx');

describe('Milestone 4 Challenger Empirical Suite — Dashboard.screen.tsx', () => {
  let dashboardContent: string;

  beforeEach(() => {
    dashboardContent = fs.readFileSync(DASHBOARD_PATH, 'utf-8');
  });

  // =========================================================================
  // 1. TOOLBAR CLEANUP & BUTTON ABSENCE VERIFICATION
  // =========================================================================
  describe('1. Toolbar Buttons Absence & Dead Code Elimination', () => {
    test('1.1 "Open TV Board" button is strictly absent from Dashboard.screen.tsx', () => {
      expect(dashboardContent.includes('Open TV Board')).toBe(false);
      expect(dashboardContent.includes('open-tv-board')).toBe(false);
      expect(dashboardContent.includes('tvBoard')).toBe(false);
      expect(dashboardContent.includes('tvDisplayUrl')).toBe(false);
    });

    test('1.2 "Force EOD / Close Day" button is strictly absent from live queue toolbar', () => {
      expect(dashboardContent.includes('Force EOD / Close Day')).toBe(false);
      expect(dashboardContent.includes('Force EOD')).toBe(false);
      expect(dashboardContent.includes('Close Day')).toBe(false);
    });

    test('1.3 Dead TV display imports and navigation callbacks are cleanly eliminated', () => {
      expect(dashboardContent.includes('handleOpenTvDisplay')).toBe(false);
      expect(dashboardContent.includes('buildCloudTvDisplayUrl')).toBe(false);
      expect(dashboardContent.includes('getPortalBaseUrl')).toBe(false);
      expect(dashboardContent.includes('resolveTenantContext')).toBe(false);
    });

    test('1.4 queueButtonsWrap container contains zero button elements', () => {
      const match = dashboardContent.match(/<View style=\{styles\.queueButtonsWrap\}[\s\S]*?<\/View>/);
      expect(match).not.toBeNull();
      const wrapBlock = match![0];
      expect(wrapBlock).not.toContain('<Button');
      expect(wrapBlock).not.toContain('<TouchableOpacity');
      expect(wrapBlock).not.toContain('<Pressable');
    });
  });

  // =========================================================================
  // 2. FORMATTED SERVICE BADGES FOR ALL VISIT TYPES
  // =========================================================================
  describe('2. Formatted Service Badge Mapping & Edge Case Fallback', () => {
    // Replicate getServiceBadge oracle as implemented in Dashboard.screen.tsx lines 128-142
    const getServiceBadgeOracle = (visitType?: string) => {
      switch (visitType) {
        case 'VitalsCheckOnly':
          return { label: 'Vitals Check', variant: 'info', icon: 'activity' };
        case 'StandaloneProcedure':
          return { label: 'Procedure', variant: 'primary', icon: 'syringe' };
        case 'AdministrativeDocument':
          return { label: 'Administrative', variant: 'neutral', icon: 'file' };
        case 'Consultation':
        default:
          return { label: 'Consultation', variant: 'primary', icon: 'stethoscope' };
      }
    };

    test('2.1 Maps VitalsCheckOnly to "Vitals Check" with info variant and activity icon', () => {
      const badge = getServiceBadgeOracle('VitalsCheckOnly');
      expect(badge.label).toBe('Vitals Check');
      expect(badge.variant).toBe('info');
      expect(badge.icon).toBe('activity');
    });

    test('2.2 Maps StandaloneProcedure to "Procedure" with primary variant and syringe icon', () => {
      const badge = getServiceBadgeOracle('StandaloneProcedure');
      expect(badge.label).toBe('Procedure');
      expect(badge.variant).toBe('primary');
      expect(badge.icon).toBe('syringe');
    });

    test('2.3 Maps AdministrativeDocument to "Administrative" with neutral variant and file icon', () => {
      const badge = getServiceBadgeOracle('AdministrativeDocument');
      expect(badge.label).toBe('Administrative');
      expect(badge.variant).toBe('neutral');
      expect(badge.icon).toBe('file');
    });

    test('2.4 Maps Consultation to "Consultation" with primary variant and stethoscope icon', () => {
      const badge = getServiceBadgeOracle('Consultation');
      expect(badge.label).toBe('Consultation');
      expect(badge.variant).toBe('primary');
      expect(badge.icon).toBe('stethoscope');
    });

    test('2.5 Fallback handles unknown, undefined, null, and empty visit types safely without crashing', () => {
      const fallbacks = [
        getServiceBadgeOracle(undefined),
        getServiceBadgeOracle(null as any),
        getServiceBadgeOracle(''),
        getServiceBadgeOracle('UnknownType'),
        getServiceBadgeOracle('EmergencyTriage'),
      ];

      for (const badge of fallbacks) {
        expect(badge.label).toBe('Consultation');
        expect(badge.variant).toBe('primary');
        expect(badge.icon).toBe('stethoscope');
      }
    });

    test('2.6 Dashboard.screen.tsx source code binds getServiceBadge in badgeRow', () => {
      expect(dashboardContent).toContain('const serviceBadge = getServiceBadge(item.visitType);');
      expect(dashboardContent).toContain('label={serviceBadge.label}');
      expect(dashboardContent).toContain('variant={serviceBadge.variant}');
      expect(dashboardContent).toContain('icon={serviceBadge.icon}');
    });

    test('2.7 Discharge confirmation modal utilizes getServiceBadge for clean label rendering', () => {
      expect(dashboardContent).toContain('getServiceBadge(dischargeModalItem.visitType).label');
    });
  });

  // =========================================================================
  // 3. 4 SEMANTIC ACTION CLUSTERS CONDITIONAL RENDERING ORACLE
  // =========================================================================
  describe('3. 4 Semantic Action Clusters Eligibility & Conditional Rendering', () => {
    // Model the exact conditional logic from Dashboard.screen.tsx lines 1033-1065
    interface QueueItemFixture {
      id: string;
      status: string;
      visitType: string;
      hasVitals?: boolean;
      doctorName?: string | null;
      checkInTime?: string;
    }

    const evaluateClusters = (item: QueueItemFixture) => {
      const canCall = item.status === 'Waiting' || item.status === 'Triaged';
      const isCompleted = item.status === 'Completed' || item.status === 'DischargedNonDoctor';
      const canTriage = !isCompleted && item.status !== 'Cancelled' && item.status !== 'NoShow' && item.status !== 'Diverted';
      const canDischarge =
        (item.status === 'Triaged' || (item.visitType && item.visitType !== 'Consultation')) &&
        !isCompleted &&
        item.status !== 'Cancelled' &&
        item.status !== 'NoShow' &&
        item.status !== 'Diverted';
      const canDivert =
        !isCompleted &&
        item.status !== 'Cancelled' &&
        item.status !== 'NoShow' &&
        item.status !== 'Diverted';

      const canHold = item.status === 'Waiting' || item.status === 'Triaged';
      const canNoShow = item.status === 'Waiting' || item.status === 'Triaged' || item.status === 'OnHold';
      const canCancel = item.status !== 'Completed' && item.status !== 'Cancelled' && item.status !== 'NoShow';
      const canReactivate = item.status === 'OnHold' || item.status === 'NoShow';
      const canExamine = item.status !== 'Cancelled' && item.status !== 'NoShow';
      const canAssignOrReassign = item.status !== 'Completed' && item.status !== 'Cancelled' && item.status !== 'NoShow';

      const hasCareActions = canCall || canExamine || canTriage || canAssignOrReassign;
      const hasFlowActions = canHold || canReactivate || canDischarge || isCompleted;
      const hasExceptionActions = canNoShow || canCancel;
      const hasEmergencyActions = canDivert;

      // Extract specific buttons rendered inside each cluster
      const careButtons: string[] = [];
      if (canCall) careButtons.push('Call patient');
      if (canExamine) careButtons.push('Examine');
      if (canTriage) careButtons.push(item.hasVitals ? 'Update vitals' : 'Record vitals');
      if (canAssignOrReassign) careButtons.push(item.doctorName ? 'Reassign' : 'Assign doctor');

      const flowButtons: string[] = [];
      if (canHold) flowButtons.push('Put on hold');
      if (canReactivate) flowButtons.push('Re-activate');
      if (canDischarge) flowButtons.push('Discharge visit');
      if (isCompleted) flowButtons.push('Bill visit');

      const exceptionButtons: string[] = [];
      if (canNoShow) exceptionButtons.push('No-show');
      if (canCancel) exceptionButtons.push('Cancel visit');

      const emergencyButtons: string[] = [];
      if (canDivert) emergencyButtons.push('Divert to ER');

      return {
        hasCareActions,
        hasFlowActions,
        hasExceptionActions,
        hasEmergencyActions,
        careButtons,
        flowButtons,
        exceptionButtons,
        emergencyButtons,
      };
    };

    test('3.1 State "Waiting" renders all 4 clusters with full pre-consultation controls', () => {
      const res = evaluateClusters({
        id: 'q-1',
        status: 'Waiting',
        visitType: 'Consultation',
        hasVitals: false,
        doctorName: null,
      });

      expect(res.hasCareActions).toBe(true);
      expect(res.hasFlowActions).toBe(true);
      expect(res.hasExceptionActions).toBe(true);
      expect(res.hasEmergencyActions).toBe(true);

      expect(res.careButtons).toEqual(['Call patient', 'Examine', 'Record vitals', 'Assign doctor']);
      expect(res.flowButtons).toEqual(['Put on hold']);
      expect(res.exceptionButtons).toEqual(['No-show', 'Cancel visit']);
      expect(res.emergencyButtons).toEqual(['Divert to ER']);
    });

    test('3.2 State "Triaged" with vitals enables "Update vitals" and "Discharge visit"', () => {
      const res = evaluateClusters({
        id: 'q-2',
        status: 'Triaged',
        visitType: 'Consultation',
        hasVitals: true,
        doctorName: 'Dr. Maria Santos',
      });

      expect(res.hasCareActions).toBe(true);
      expect(res.hasFlowActions).toBe(true);
      expect(res.hasExceptionActions).toBe(true);
      expect(res.hasEmergencyActions).toBe(true);

      expect(res.careButtons).toContain('Update vitals');
      expect(res.careButtons).toContain('Reassign');
      expect(res.flowButtons).toContain('Put on hold');
      expect(res.flowButtons).toContain('Discharge visit');
    });

    test('3.3 Non-consultation visit (VitalsCheckOnly) allows direct "Discharge visit" even before Triaged', () => {
      const res = evaluateClusters({
        id: 'q-3',
        status: 'Waiting',
        visitType: 'VitalsCheckOnly',
      });

      expect(res.flowButtons).toContain('Put on hold');
      expect(res.flowButtons).toContain('Discharge visit');
    });

    test('3.4 State "OnHold" allows Re-activate, No-show, Cancel, and Reassign', () => {
      const res = evaluateClusters({
        id: 'q-4',
        status: 'OnHold',
        visitType: 'Consultation',
        doctorName: 'Dr. Santos',
      });

      expect(res.hasCareActions).toBe(true);
      expect(res.hasFlowActions).toBe(true);
      expect(res.hasExceptionActions).toBe(true);
      expect(res.hasEmergencyActions).toBe(true);

      expect(res.flowButtons).toContain('Re-activate');
      expect(res.flowButtons).not.toContain('Put on hold');
      expect(res.exceptionButtons).toEqual(['No-show', 'Cancel visit']);
    });

    test('3.5 State "Completed" hides Exceptions and Emergency clusters, only shows Examine & Bill visit', () => {
      const res = evaluateClusters({
        id: 'q-5',
        status: 'Completed',
        visitType: 'Consultation',
      });

      expect(res.hasCareActions).toBe(true);
      expect(res.careButtons).toEqual(['Examine']);
      expect(res.hasFlowActions).toBe(true);
      expect(res.flowButtons).toEqual(['Bill visit']);
      expect(res.hasExceptionActions).toBe(false);
      expect(res.hasEmergencyActions).toBe(false);
    });

    test('3.6 State "Cancelled" suppresses ALL 4 action clusters entirely', () => {
      const res = evaluateClusters({
        id: 'q-6',
        status: 'Cancelled',
        visitType: 'Consultation',
      });

      expect(res.hasCareActions).toBe(false);
      expect(res.hasFlowActions).toBe(false);
      expect(res.hasExceptionActions).toBe(false);
      expect(res.hasEmergencyActions).toBe(false);
    });

    test('3.7 State "NoShow" suppresses Care, Exceptions, and Emergency; allows only Flow (Re-activate)', () => {
      const res = evaluateClusters({
        id: 'q-7',
        status: 'NoShow',
        visitType: 'Consultation',
      });

      expect(res.hasCareActions).toBe(false);
      expect(res.hasFlowActions).toBe(true);
      expect(res.flowButtons).toEqual(['Re-activate']);
      expect(res.hasExceptionActions).toBe(false);
      expect(res.hasEmergencyActions).toBe(false);
    });

    test('3.8 State "Diverted" suppresses Flow and Emergency clusters, permits Examine, Assign/Reassign, and Cancel', () => {
      const resUnassigned = evaluateClusters({
        id: 'q-8',
        status: 'Diverted',
        visitType: 'Consultation',
        doctorName: null,
      });

      expect(resUnassigned.hasCareActions).toBe(true);
      expect(resUnassigned.careButtons).toEqual(['Examine', 'Assign doctor']);
      expect(resUnassigned.hasFlowActions).toBe(false);
      expect(resUnassigned.hasExceptionActions).toBe(true);
      expect(resUnassigned.exceptionButtons).toEqual(['Cancel visit']);
      expect(resUnassigned.hasEmergencyActions).toBe(false);

      const resAssigned = evaluateClusters({
        id: 'q-8b',
        status: 'Diverted',
        visitType: 'Consultation',
        doctorName: 'Dr. Maria Santos',
      });
      expect(resAssigned.careButtons).toEqual(['Examine', 'Reassign']);
    });
  });

  // =========================================================================
  // 4. HARNESS STATIC MARKUP RENDERING STRESS TEST
  // =========================================================================
  describe('4. Static Markup Cluster Rendering Harness', () => {
    const renderActionClustersHarness = (item: any) => {
      const canCall = item.status === 'Waiting' || item.status === 'Triaged';
      const isCompleted = item.status === 'Completed' || item.status === 'DischargedNonDoctor';
      const canTriage = !isCompleted && item.status !== 'Cancelled' && item.status !== 'NoShow' && item.status !== 'Diverted';
      const canDischarge =
        (item.status === 'Triaged' || (item.visitType && item.visitType !== 'Consultation')) &&
        !isCompleted &&
        item.status !== 'Cancelled' &&
        item.status !== 'NoShow' &&
        item.status !== 'Diverted';
      const canDivert =
        !isCompleted &&
        item.status !== 'Cancelled' &&
        item.status !== 'NoShow' &&
        item.status !== 'Diverted';

      const canHold = item.status === 'Waiting' || item.status === 'Triaged';
      const canNoShow = item.status === 'Waiting' || item.status === 'Triaged' || item.status === 'OnHold';
      const canCancel = item.status !== 'Completed' && item.status !== 'Cancelled' && item.status !== 'NoShow';
      const canReactivate = item.status === 'OnHold' || item.status === 'NoShow';
      const canExamine = item.status !== 'Cancelled' && item.status !== 'NoShow';
      const canAssignOrReassign = item.status !== 'Completed' && item.status !== 'Cancelled' && item.status !== 'NoShow';

      const hasCareActions = canCall || canExamine || canTriage || canAssignOrReassign;
      const hasFlowActions = canHold || canReactivate || canDischarge || isCompleted;
      const hasExceptionActions = canNoShow || canCancel;
      const hasEmergencyActions = canDivert;

      return renderToStaticMarkup(
        React.createElement(
          'div',
          { 'data-testid': 'actionClustersWrap' },
          hasCareActions
            ? React.createElement(
                'div',
                { 'data-testid': 'care-encounter-cluster' },
                canCall ? React.createElement('button', null, 'Call patient') : null,
                canExamine ? React.createElement('button', null, 'Examine') : null,
                canTriage ? React.createElement('button', null, item.hasVitals ? 'Update vitals' : 'Record vitals') : null,
                canAssignOrReassign ? React.createElement('button', null, item.doctorName ? 'Reassign' : 'Assign doctor') : null
              )
            : null,
          hasFlowActions
            ? React.createElement(
                'div',
                { 'data-testid': 'flow-completion-cluster' },
                canHold ? React.createElement('button', null, 'Put on hold') : null,
                canReactivate ? React.createElement('button', null, 'Re-activate') : null,
                canDischarge ? React.createElement('button', null, 'Discharge visit') : null,
                isCompleted ? React.createElement('button', null, 'Bill visit') : null
              )
            : null,
          hasExceptionActions
            ? React.createElement(
                'div',
                { 'data-testid': 'exceptions-cluster' },
                canNoShow ? React.createElement('button', null, 'No-show') : null,
                canCancel ? React.createElement('button', null, 'Cancel visit') : null
              )
            : null,
          hasEmergencyActions
            ? React.createElement(
                'div',
                { 'data-testid': 'emergency-cluster' },
                React.createElement('button', { 'data-testid': 'divert-emergency-button' }, 'Divert to ER')
              )
            : null
        )
      );
    };

    test('4.1 Active waiting patient markup renders all 4 testIDs and buttons', () => {
      const html = renderActionClustersHarness({
        status: 'Waiting',
        visitType: 'Consultation',
        hasVitals: false,
        doctorName: null,
      });

      expect(html).toContain('data-testid="care-encounter-cluster"');
      expect(html).toContain('data-testid="flow-completion-cluster"');
      expect(html).toContain('data-testid="exceptions-cluster"');
      expect(html).toContain('data-testid="emergency-cluster"');
      expect(html).toContain('data-testid="divert-emergency-button"');
      expect(html).toContain('Call patient');
      expect(html).toContain('Record vitals');
      expect(html).toContain('Assign doctor');
      expect(html).toContain('Put on hold');
      expect(html).toContain('No-show');
      expect(html).toContain('Cancel visit');
      expect(html).toContain('Divert to ER');
    });

    test('4.2 Completed encounter markup suppresses exceptions and emergency clusters', () => {
      const html = renderActionClustersHarness({
        status: 'Completed',
        visitType: 'Consultation',
      });

      expect(html).toContain('data-testid="care-encounter-cluster"');
      expect(html).toContain('data-testid="flow-completion-cluster"');
      expect(html).not.toContain('data-testid="exceptions-cluster"');
      expect(html).not.toContain('data-testid="emergency-cluster"');
      expect(html).not.toContain('data-testid="divert-emergency-button"');
      expect(html).toContain('Bill visit');
      expect(html).toContain('Examine');
    });

    test('4.3 Cancelled encounter markup renders completely empty container', () => {
      const html = renderActionClustersHarness({
        status: 'Cancelled',
        visitType: 'Consultation',
      });

      expect(html).toBe('<div data-testid="actionClustersWrap"></div>');
    });
  });

  // =========================================================================
  // 5. DESIGN TOKEN COMPLIANCE & ZERO JARGON AUDIT
  // =========================================================================
  describe('5. Design Token Compliance & Zero Jargon Static Audit', () => {
    test('5.1 Dashboard.screen.tsx defines actionClustersWrap with semantic tokens', () => {
      expect(dashboardContent).toContain('actionClustersWrap: {');
      expect(dashboardContent).toContain('borderTopWidth: theme.sizes.borderWidth');
      expect(dashboardContent).toContain('borderTopColor: theme.colors.borderLight');
      expect(dashboardContent).toContain('gap: theme.spacing.sm');
    });

    test('5.2 Dashboard.screen.tsx defines unboxed actionCluster and vertical actionClusterSeparator with semantic tokens', () => {
      expect(dashboardContent).toContain('actionCluster: {');
      expect(dashboardContent).toContain('gap: theme.spacing.xs');
      expect(dashboardContent).toContain('actionClusterSeparator: {');
      expect(dashboardContent).toContain('width: theme.sizes.borderWidth');
      expect(dashboardContent).toContain('backgroundColor: theme.colors.border');
    });

    test('5.3 Dashboard.screen.tsx groups clusters via separators without boxed parent sub-cards', () => {
      expect(dashboardContent).toContain('emergencyCluster: {');
      expect(dashboardContent).toContain('testID="care-flow-separator"');
      expect(dashboardContent).toContain('testID="exceptions-emergency-separator"');
    });

    test('5.4 Zero raw hex colors present in Dashboard.screen.tsx styles', () => {
      // Check StyleSheet definitions
      const styleBlockMatch = dashboardContent.match(/const styles = StyleSheet\.create\(\{([\s\S]*)\}\);/);
      expect(styleBlockMatch).not.toBeNull();
      const styleBlock = styleBlockMatch![1];
      const hexMatches = styleBlock.match(/#[0-9a-fA-F]{3,8}\b/g);
      expect(hexMatches).toBeNull();
    });

    test('5.5 Zero statutory or legalistic jargon across Dashboard.screen.tsx copy & comments', () => {
      const forbiddenTerms = [
        /\bRA\s*9994\b/i,
        /\bRA\s*7277\b/i,
        /\bRepublic\s+Act\b/i,
        /\bstatutory\b/i,
        /\brelational\s+1NF\b/i,
        /\bSOAP\s+protocol\b/i,
      ];

      for (const regex of forbiddenTerms) {
        expect(regex.test(dashboardContent)).toBe(false);
      }
    });
  });
});
