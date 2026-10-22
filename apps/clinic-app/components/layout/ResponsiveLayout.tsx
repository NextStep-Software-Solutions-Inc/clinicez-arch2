import React, { useEffect } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import WorkstationSidebar from './WorkstationSidebar';
import ClinicHeaderBar, { HeaderAction } from './ClinicHeaderBar';
import { theme } from '../../constants/theme';
import { useWorkstationShortcuts } from '../../utils/workstationShortcuts';
import { useBreakpoint } from '../../utils/useBreakpoint';
import { useSidebar } from '../../context/SidebarContext';
import { useSafeInsets } from '../../utils/useSafeInsets';
import { useUiDensity } from '../../context/UiDensityContext';
import { useGlobalSearch } from '../search/GlobalSearchProvider';

export interface ResponsiveLayoutProps {
  children: React.ReactNode;
  headerTitle?: string;
  headerSubtitle?: string;
  actions?: HeaderAction[];
  rightAction?: React.ReactNode;
  hideHeader?: boolean;
  style?: ViewStyle;
}

export default function ResponsiveLayout({
  children,
  headerTitle,
  headerSubtitle,
  actions,
  rightAction,
  hideHeader = false,
  style,
}: ResponsiveLayoutProps) {
  const insets = useSafeInsets();
  const { isWorkstation } = useBreakpoint();
  const navigation = useNavigation<any>();
  const route = useRoute();
  const { mode, cycleMode } = useSidebar();

  let openSearch: (() => void) | undefined;
  let registerNavigator: (((fn: (targetRoute: string, params?: any) => void) => () => void)) | undefined;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const searchCtx = useGlobalSearch();
    openSearch = searchCtx.openSearch;
    registerNavigator = searchCtx.registerNavigator;
  } catch {
    openSearch = undefined;
    registerNavigator = undefined;
  }

  useEffect(() => {
    if (registerNavigator) {
      return registerNavigator((targetRoute, params) => {
        navigation.navigate(targetRoute, params);
      });
    }
  }, [navigation, registerNavigator]);

  const currentRouteName = route?.name ?? 'Dashboard';

  const handleNavigate = (targetRoute: string) => {
    if (targetRoute !== currentRouteName) {
      navigation.navigate(targetRoute);
    }
  };

  const handleOpenSearch = React.useCallback(() => {
    if (openSearch) {
      openSearch();
    }
  }, [openSearch]);

  useWorkstationShortcuts({
    onNavigate: handleNavigate,
    onToggleSidebar: cycleMode,
    onOpenSearch: openSearch ? handleOpenSearch : undefined,
  });

  if (!isWorkstation) {
    // Mobile View: Plain container (bottom tab bar is rendered by React Navigation)
    return (
      <View
        style={[
          styles.mobileContainer,
          hideHeader && insets.top > 0 && { paddingTop: insets.top },
          style,
        ]}
      >
        {!hideHeader && (headerTitle || rightAction || (actions && actions.length > 0) || openSearch) ? (
          <ClinicHeaderBar
            title={headerTitle}
            subtitle={headerSubtitle}
            actions={actions}
            rightAction={rightAction}
            onOpenSearch={openSearch ? handleOpenSearch : undefined}
          />
        ) : null}
        <View style={[styles.content, insets.bottom > 0 && { paddingBottom: insets.bottom }]}>{children}</View>
      </View>
    );
  }

  // Workstation View (Tablet / Desktop):
  // WorkstationSidebar is always rendered in either 'open' or 'icon' mode
  const { sidebarWidth: densitySidebarWidth } = useUiDensity();
  const sidebarWidth =
    mode === 'icon' ? theme.sizes.sidebarCollapsedWidth : densitySidebarWidth;

  return (
    <View style={styles.desktopContainer}>
      <WorkstationSidebar
        currentRoute={currentRouteName}
        onNavigate={handleNavigate}
        width={sidebarWidth}
        mode={mode}
        onToggleMode={cycleMode}
      />
      <View
        style={[
          styles.mainColumn,
          hideHeader && insets.top > 0 && { paddingTop: insets.top },
          style,
        ]}
      >
        {!hideHeader && (
          <ClinicHeaderBar
            title={headerTitle}
            subtitle={headerSubtitle}
            actions={actions}
            rightAction={rightAction}
            onOpenSearch={openSearch ? handleOpenSearch : undefined}
          />
        )}
        <View style={[styles.content, insets.bottom > 0 && { paddingBottom: insets.bottom }]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  mobileContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  desktopContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    height: '100%',
  },
  mainColumn: {
    flex: 1,
    flexDirection: 'column',
    height: '100%',
    overflow: 'hidden',
    zIndex: 0,
  },
  content: {
    flex: 1,
  },
});
