import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Icon, ThemedText } from '@ui';
import { ResponsiveLayout } from '@layout';
import { theme } from '@constants/theme';
import { PERMISSIONS } from '@constants/permissions';
import { useAuth } from '../../context/AuthContext';
import { usePersistedTab } from '../../hooks/usePersistedTab';
import ToolsDirectoryView from '../../components/tools/ToolsDirectoryView';
import PhilHealthYakapToolsSection from '../../components/tools/PhilHealthYakapToolsSection';
import ClinicalCalculatorsSection from '../../components/tools/ClinicalCalculatorsSection';
import MedicalLookupsSection from '../../components/tools/MedicalLookupsSection';
import OperationsUtilitiesSection from '../../components/tools/OperationsUtilitiesSection';
import {
  ALL_TOOL_IDS,
  ALL_TOOLS_TABS,
  canAccessTool,
  findToolById,
  getAccessibleTools,
  getDefaultToolForTab,
  getVisibleToolTabs,
  resolveToolsRouteIntent,
  type CalculatorSubTool,
  type ClinicToolDefinition,
  type ClinicToolId,
  type ClinicToolsTab,
  type LookupSubTool,
  type OperationsSubTool,
  type YakapSubTool,
} from '../../components/tools/toolsCatalog';

export interface ToolsScreenProps {
  route?: {
    params?: {
      tab?: string;
      tool?: string;
    };
  };
}

const LEGACY_TAB_VALUE_ALIASES: Record<string, ClinicToolsTab> = {
  'pin-checker': 'yakap',
  gamot: 'yakap',
  masterlist: 'yakap',
};

const TOOLS_QUERY_PARAM_ALIASES = ['section'] as const;

const TOOLS_CLEANUP_PARAMS_BY_VALUE: Partial<Record<ClinicToolsTab, readonly string[]>> = {
  directory: ['tool'],
};

const toolsPathnameMatcher = (p: string) => {
  const lower = (p || '').toLowerCase();
  return lower.includes('tools') || lower.includes('yakap');
};

export default function ToolsScreen({ route: routeProp }: ToolsScreenProps = {}) {
  const navigation = useNavigation<any>();
  let hookRoute: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    hookRoute = useRoute<any>();
  } catch {
    // ignore outside NavigationContainer (e.g. unit SSR tests)
  }
  const routeParams = routeProp?.params ?? hookRoute?.params;

  const { user, permissions, can } = useAuth();
  const authSubject = useMemo(
    () => ({ user, permissions, can }),
    [user, permissions, can],
  );

  const accessibleTools = useMemo(() => getAccessibleTools(authSubject), [authSubject]);
  const visibleTabs = useMemo(() => getVisibleToolTabs(authSubject), [authSubject]);

  const canAccessYakap = useMemo(
    () => canAccessTool({ permission: PERMISSIONS.yakapRead, roles: ['Doctor', 'Admin'] }, authSubject),
    [authSubject],
  );
  const canAccessPediatricZScore = useMemo(
    () =>
      canAccessTool(
        { permission: PERMISSIONS.patientsRead, roles: ['Doctor', 'Nurse', 'Receptionist', 'Admin'] },
        authSubject,
      ),
    [authSubject],
  );
  const canAccessIcd10 = useMemo(
    () =>
      canAccessTool(
        { permission: PERMISSIONS.consultationsRead, roles: ['Doctor', 'Nurse', 'Admin'] },
        authSubject,
      ),
    [authSubject],
  );
  const canAccessServices = useMemo(
    () =>
      canAccessTool(
        {
          permission: PERMISSIONS.servicesRead,
          roles: ['Doctor', 'Nurse', 'Cashier', 'Receptionist', 'Admin'],
        },
        authSubject,
      ),
    [authSubject],
  );
  const canImportPatient = useMemo(
    () =>
      canAccessTool(
        { permission: PERMISSIONS.patientsWrite, roles: ['Doctor', 'Nurse', 'Receptionist', 'Admin'] },
        authSubject,
      ),
    [authSubject],
  );
  const canViewSettings = useMemo(
    () => canAccessTool({ permission: PERMISSIONS.settingsRead, roles: ['Admin'] }, authSubject),
    [authSubject],
  );

  const initialPathname =
    Platform.OS === 'web' && typeof window !== 'undefined' ? window.location?.pathname : '';
  const resolvedIntent = useMemo(
    () =>
      resolveToolsRouteIntent({
        tab: routeParams?.tab,
        tool: routeParams?.tool,
        pathname: initialPathname,
      }),
    [routeParams?.tab, routeParams?.tool, initialPathname],
  );

  const [activeTab, setActiveTab] = usePersistedTab<ClinicToolsTab>({
    storageKey: 'clinicez_tools_active_tab',
    allowedValues: ALL_TOOLS_TABS,
    defaultValue: resolvedIntent.tab ?? 'directory',
    routeParam: routeParams?.tab ?? resolvedIntent.tab,
    queryParam: 'tab',
    queryParamAliases: TOOLS_QUERY_PARAM_ALIASES,
    valueAliases: LEGACY_TAB_VALUE_ALIASES,
    cleanupParamsByValue: TOOLS_CLEANUP_PARAMS_BY_VALUE,
    navigation,
    pathnameMatcher: toolsPathnameMatcher,
  });

  const [activeTool, setActiveTool] = usePersistedTab<ClinicToolId>({
    storageKey: 'clinicez_tools_active_tool',
    allowedValues: ALL_TOOL_IDS,
    defaultValue: resolvedIntent.tool ?? 'pin-checker',
    routeParam: resolvedIntent.tool ?? routeParams?.tool,
    queryParam: 'tool',
    syncUrl: activeTab !== 'directory',
    clearUrlOnInactive: true,
    navigation,
    pathnameMatcher: toolsPathnameMatcher,
  });

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);

  // Align activeTool with the active category tab when navigating directly to a tab without ?tool=
  useEffect(() => {
    if (activeTab === 'directory') return;
    const currentDef = findToolById(activeTool);
    if (currentDef?.tab === activeTab) return;
    const fallbackTool = getDefaultToolForTab(activeTab, accessibleTools);
    if (fallbackTool !== activeTool) {
      setActiveTool(fallbackTool);
    }
  }, [activeTab, activeTool, accessibleTools, setActiveTool]);

  const handleSelectTab = useCallback(
    (nextTab: ClinicToolsTab) => {
      setActiveTab(nextTab);
      if (nextTab !== 'directory') {
        const currentToolDef = findToolById(activeTool);
        const belongsToTab = currentToolDef?.tab === nextTab;
        const allowed = currentToolDef ? canAccessTool(currentToolDef, authSubject) : false;
        if (!belongsToTab || !allowed) {
          setActiveTool(getDefaultToolForTab(nextTab, accessibleTools));
        }
      }
    },
    [activeTool, authSubject, accessibleTools, setActiveTab, setActiveTool],
  );

  const handleOpenTool = useCallback(
    (tool: ClinicToolDefinition) => {
      setActiveTab(tool.tab);
      setActiveTool(tool.id);
    },
    [setActiveTab, setActiveTool],
  );

  const handleOpenShareImport = useCallback(
    (initialToken?: string) => {
      if (initialToken) {
        navigation?.navigate?.('ShareImport', { initialToken });
      } else {
        navigation?.navigate?.('ShareImport');
      }
    },
    [navigation],
  );

  const handleOpenSettingsTab = useCallback(
    (settingsTab: string) => {
      navigation?.navigate?.('Settings', { tab: settingsTab });
    },
    [navigation],
  );

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setRefreshSignal((n) => n + 1);
    setTimeout(() => setIsRefreshing(false), 350);
  }, []);

  // Resolve effective sub-tool for each category section so switching tabs never passes a mismatched ID
  const resolvedYakapTool: YakapSubTool =
    findToolById(activeTool)?.tab === 'yakap'
      ? (activeTool as YakapSubTool)
      : (getDefaultToolForTab('yakap', accessibleTools) as YakapSubTool);

  const resolvedCalculatorTool: CalculatorSubTool =
    findToolById(activeTool)?.tab === 'calculators'
      ? (activeTool as CalculatorSubTool)
      : (getDefaultToolForTab('calculators', accessibleTools) as CalculatorSubTool);

  const resolvedLookupTool: LookupSubTool =
    findToolById(activeTool)?.tab === 'lookups' &&
    canAccessTool(findToolById(activeTool)!, authSubject)
      ? (activeTool as LookupSubTool)
      : (getDefaultToolForTab('lookups', accessibleTools) as LookupSubTool);

  const resolvedOperationsTool: OperationsSubTool =
    findToolById(activeTool)?.tab === 'operations' &&
    canAccessTool(findToolById(activeTool)!, authSubject)
      ? (activeTool as OperationsSubTool)
      : (getDefaultToolForTab('operations', accessibleTools) as OperationsSubTool);

  return (
    <ResponsiveLayout
      headerTitle="Tools"
      headerSubtitle="Clinic utility directory, calculators, lookups & PhilHealth Yakap"
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
      >
        {/* Top-Level Horizontal Category Tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabScroll}
          contentContainerStyle={styles.tabNavContainer}
        >
          {visibleTabs.map(({ key, label, icon }) => {
            const isActive = activeTab === key;
            return (
              <Pressable
                key={key}
                testID={`tools-tab-${key}`}
                onPress={() => handleSelectTab(key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                style={[styles.tabButton, isActive && styles.tabButtonActive]}
              >
                <Icon
                  name={icon}
                  size={theme.sizes.iconSm}
                  color={isActive ? theme.colors.primary : theme.colors.textMuted}
                />
                <ThemedText
                  variant={isActive ? 'bodyBold' : 'body'}
                  color={isActive ? theme.colors.primary : theme.colors.textMuted}
                >
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        {activeTab === 'directory' ? (
          <ToolsDirectoryView tools={accessibleTools} onOpenTool={handleOpenTool} />
        ) : null}

        {activeTab === 'yakap' ? (
          <PhilHealthYakapToolsSection
            activeTool={resolvedYakapTool}
            onSelectTool={(t) => setActiveTool(t)}
            canAccess={canAccessYakap}
            refreshSignal={refreshSignal}
          />
        ) : null}

        {activeTab === 'calculators' ? (
          <ClinicalCalculatorsSection
            activeTool={resolvedCalculatorTool}
            onSelectTool={(t) => setActiveTool(t)}
            canAccessPediatricZScore={canAccessPediatricZScore}
          />
        ) : null}

        {activeTab === 'lookups' ? (
          <MedicalLookupsSection
            activeTool={resolvedLookupTool}
            onSelectTool={(t) => setActiveTool(t)}
            canAccessIcd10={canAccessIcd10}
            canAccessServices={canAccessServices}
            refreshSignal={refreshSignal}
          />
        ) : null}

        {activeTab === 'operations' ? (
          <OperationsUtilitiesSection
            activeTool={resolvedOperationsTool}
            onSelectTool={(t) => setActiveTool(t)}
            canImportPatient={canImportPatient}
            canViewSettings={canViewSettings}
            onOpenShareImport={handleOpenShareImport}
            onOpenSettingsTab={handleOpenSettingsTab}
          />
        ) : null}
      </ScrollView>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: theme.spacing.xl,
    paddingBottom: theme.spacing['4xl'],
    gap: theme.spacing.lg,
  },
  tabScroll: {
    flexGrow: 0,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  tabNavContainer: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs + 2,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderBottomWidth: theme.spacing.xs / 2,
    borderBottomColor: theme.colors.transparent,
  },
  tabButtonActive: {
    borderBottomColor: theme.colors.primary,
    ...theme.shadows.brandSubtle,
  },
});
