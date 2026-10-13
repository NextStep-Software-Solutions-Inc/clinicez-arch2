import React from 'react';
import {
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import { theme } from '../../../constants/theme';
import {
  ThemedText,
  Icon,
  SegmentedControl,
} from '../../ui';
import { useBreakpoint } from '../../../utils/useBreakpoint';
import PatientSummarySpine from '../PatientSummarySpine';
import ChartLayoutSwitcher from '../ChartLayoutSwitcher';
import ChartTabContentView from '../ChartTabContentView';
import { CHART_TABS, type ChartLayoutProps } from '../types';

export default function SlideOverDrawerChartLayout(props: ChartLayoutProps) {
  const {
    patient,
    patientChart,
    loadingChart,
    activeTab,
    onTabChange,
    onClose,
    onRefreshChart,
    onEditDemographics,
    currentLayout,
    onSwitchLayout,
  } = props;

  const { isCompact } = useBreakpoint();

  return (
    <View style={styles.overlayContainer}>
      {/* Backdrop Area on the left: Clicking dismisses drawer back to queue */}
      {!isCompact && (
        <Pressable
          style={styles.backdropDismiss}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss drawer and return to queue"
        >
          <View style={styles.backdropHint}>
            <Icon name="arrowRight" size={theme.sizes.iconSm} color={theme.colors.onPrimary} />
            <ThemedText variant="caption" color={theme.colors.onPrimary} style={styles.backdropHintText}>
              Click to close & return to queue
            </ThemedText>
          </View>
        </Pressable>
      )}

      {/* Right Docked Offcanvas Sheet */}
      <View
        style={[styles.drawerSheet, isCompact && styles.drawerSheetCompact]}
        aria-modal={true}
        accessibilityLabel={`Medical Chart Drawer for ${patient?.fullName || 'Patient'}`}
      >
        {/* ========================================================================= */}
        {/* DRAWER HEADER BAR                                                         */}
        {/* ========================================================================= */}
        <View style={styles.drawerHeader}>
          <View style={styles.headerLeft}>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Close Drawer"
            >
              <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
            </Pressable>

            <View style={styles.titleBlock}>
              <ThemedText variant="title">Medical chart</ThemedText>
              {patient?.fullName ? (
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  {patient.fullName} {patient.patientCode ? `• ${patient.patientCode}` : ''}
                </ThemedText>
              ) : null}
            </View>
          </View>

          {/* Header Controls */}
          <View style={styles.headerActions}>
            <ChartLayoutSwitcher
              currentLayout={currentLayout}
              onSwitchLayout={onSwitchLayout}
            />

            <Pressable
              onPress={onEditDemographics}
              hitSlop={8}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Edit Demographics"
            >
              <Icon name="edit" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
            </Pressable>

            {onRefreshChart ? (
              <Pressable
                onPress={onRefreshChart}
                hitSlop={8}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Refresh patient chart"
              >
                <Icon name="refresh" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ========================================================================= */}
        {/* COMPACT PATIENT SUMMARY SPINE                                             */}
        {/* ========================================================================= */}
        {patient ? (
          <View style={styles.spineWrapper}>
            <PatientSummarySpine
              patient={patient}
              chart={patientChart}
              vitals={patientChart?.vitalsHistory?.[0]}
              loading={loadingChart}
              onPressRefresh={onRefreshChart}
            />
          </View>
        ) : null}

        {/* ========================================================================= */}
        {/* TAB BAR                                                                   */}
        {/* ========================================================================= */}
        <View style={styles.tabBarContainer}>
          <SegmentedControl
            options={CHART_TABS}
            value={activeTab}
            onChange={onTabChange}
          />
        </View>

        {/* ========================================================================= */}
        {/* MAIN DRAWER CONTENT VIEWPORT                                              */}
        {/* ========================================================================= */}
        <View style={styles.viewport}>
          <ChartTabContentView {...props} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayContainer: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: theme.colors.overlay,
  },
  backdropDismiss: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdropHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.overlay,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.borderDark,
  },
  backdropHintText: {
    fontWeight: '600',
  },
  drawerSheet: {
    width: '75%',
    maxWidth: 1200,
    height: '100%',
    backgroundColor: theme.colors.surface,
    display: 'flex',
    flexDirection: 'column',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 16,
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
  },
  drawerSheetCompact: {
    width: '100%',
    maxWidth: '100%',
    borderLeftWidth: 0,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flex: 1,
    marginRight: theme.spacing.md,
  },
  closeBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnPressed: {
    backgroundColor: theme.colors.borderLight,
    opacity: 0.8,
  },
  titleBlock: {
    flex: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  actionBtn: {
    padding: theme.spacing.xs,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceHighlight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnPressed: {
    backgroundColor: theme.colors.borderLight,
    opacity: 0.8,
  },
  spineWrapper: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceHighlight,
  },
  tabBarContainer: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});
