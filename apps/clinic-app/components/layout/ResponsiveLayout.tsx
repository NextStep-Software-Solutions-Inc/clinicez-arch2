import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import WorkstationSidebar from './WorkstationSidebar';
import ClinicHeaderBar from './ClinicHeaderBar';
import { theme } from '../../constants/theme';
import { useWorkstationShortcuts } from '../../utils/workstationShortcuts';
import { useBreakpoint } from '../../utils/useBreakpoint';

export interface ResponsiveLayoutProps {
  children: React.ReactNode;
  headerTitle?: string;
  headerSubtitle?: string;
  rightAction?: React.ReactNode;
  hideHeader?: boolean;
  style?: ViewStyle;
}

export default function ResponsiveLayout({
  children,
  headerTitle,
  headerSubtitle,
  rightAction,
  hideHeader = false,
  style,
}: ResponsiveLayoutProps) {
  const { isWorkstation: isDesktop } = useBreakpoint();
  const navigation = useNavigation<any>();
  const route = useRoute();

  const currentRouteName = route?.name ?? 'Dashboard';

  const handleNavigate = (targetRoute: string) => {
    if (targetRoute !== currentRouteName) {
      navigation.navigate(targetRoute);
    }
  };

  useWorkstationShortcuts({
    onNavigate: handleNavigate,
  });

  if (!isDesktop) {
    // Mobile View: Plain container (bottom tab bar is rendered by React Navigation)
    return (
      <View style={[styles.mobileContainer, style]}>
        {!hideHeader && (headerTitle || rightAction) ? (
          <ClinicHeaderBar
            title={headerTitle}
            subtitle={headerSubtitle}
            rightAction={rightAction}
          />
        ) : null}
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  // Desktop / Tablet Workstation View: 2-column layout with sidebar and header
  return (
    <View style={styles.desktopContainer}>
      <WorkstationSidebar
        currentRoute={currentRouteName}
        onNavigate={handleNavigate}
        width={theme.sizes.sidebarWidth}
      />
      <View style={[styles.mainColumn, style]}>
        {!hideHeader && (
          <ClinicHeaderBar
            title={headerTitle}
            subtitle={headerSubtitle}
            rightAction={rightAction}
          />
        )}
        <View style={styles.content}>{children}</View>
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
  },
  content: {
    flex: 1,
  },
});
