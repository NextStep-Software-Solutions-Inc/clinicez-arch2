import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../../constants/theme';
import {
  ThemedText,
  Badge,
  Icon,
  SegmentedControl,
} from '../../ui';
import { useBreakpoint } from '../../../utils/useBreakpoint';
import { formatLongAge } from '../../../utils/age';
import PatientSummarySpine from '../PatientSummarySpine';
import ChartLayoutSwitcher from '../ChartLayoutSwitcher';
import ChartTabContentView from '../ChartTabContentView';
import { CHART_TABS, type ChartLayoutProps } from '../types';

export default function CenteredModalChartLayout(props: ChartLayoutProps) {
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

  const [isMaximized, setIsMaximized] = useState(false);
  const { isCompact } = useBreakpoint();
  const isFullScreen = isMaximized || isCompact;

  return (
    <View style={[styles.overlay, isFullScreen && styles.overlayFullScreen]}>
      <View
        style={[styles.modalCard, isFullScreen && styles.modalCardFullScreen]}
        aria-modal={true}
        accessibilityLabel={`Medical Chart for ${patient?.fullName || 'Patient'}`}
      >
        {/* ========================================================================= */}
        {/* WORKSTATION MODAL HEADER BAR                                              */}
        {/* ========================================================================= */}
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <View style={styles.titleRow}>
              <ThemedText variant="title">Patient Chart</ThemedText>
              {patient?.fullName ? (
                <ThemedText variant="bodyBold" color={theme.colors.primaryDark}>
                  {patient.fullName}
                </ThemedText>
              ) : null}
            </View>

            {patient ? (
              <View style={styles.headerMetaRow}>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  Code: <ThemedText variant="caption" color={theme.colors.text}>{patient.patientCode || '—'}</ThemedText>
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.borderDark}>•</ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary}>
                  {patient.dateOfBirth
                    ? `${formatLongAge(patient.dateOfBirth)}, ${patient.gender}`
                    : `${patient.age ? `${patient.age} yrs, ` : ''}${patient.gender}`}
                </ThemedText>
                {patient.dateOfBirth ? (
                  <>
                    <ThemedText variant="caption" color={theme.colors.borderDark}>•</ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      DOB: {patient.dateOfBirth}
                    </ThemedText>
                  </>
                ) : null}
                {patient.verificationStatus === 'Verified' ? (
                  <Badge label="Verified" variant="success" size="sm" icon="checkCircle" />
                ) : (
                  <Badge label="Unverified" variant="warning" size="sm" icon="alert" />
                )}
                {patient.bloodType ? (
                  <Badge label={patient.bloodType} variant="neutral" size="sm" icon="droplet" />
                ) : null}
              </View>
            ) : null}
          </View>

          {/* Header Action Controls */}
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
                disabled={loadingChart}
              >
                <Icon
                  name="refresh"
                  size={theme.sizes.iconMd}
                  color={theme.colors.textSecondary}
                  spin={loadingChart}
                />
              </Pressable>
            ) : null}

            {!isCompact ? (
              <Pressable
                onPress={() => setIsMaximized(!isMaximized)}
                hitSlop={8}
                style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel={isMaximized ? 'Restore chart window' : 'Maximize chart window'}
              >
                <Icon
                  name={isMaximized ? 'minimize' : 'maximize'}
                  size={theme.sizes.iconMd}
                  color={theme.colors.textSecondary}
                />
              </Pressable>
            ) : null}

            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Close medical chart"
            >
              <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
            </Pressable>
          </View>
        </View>

        {/* ========================================================================= */}
        {/* PATIENT SUMMARY SPINE (GLANCEABLE 6-ZONE HEADER)                          */}
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
        {/* TAB NAVIGATION BAR                                                        */}
        {/* ========================================================================= */}
        <View style={styles.tabBarContainer}>
          <SegmentedControl
            options={props.availableTabs || CHART_TABS}
            value={activeTab}
            onChange={onTabChange}
          />
        </View>

        {/* ========================================================================= */}
        {/* MAIN VIEWPORT: ACTIVE TAB CONTENT                                         */}
        {/* ========================================================================= */}
        <View style={styles.viewport}>
          <ChartTabContentView {...props} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  overlayFullScreen: {
    padding: 0,
  },
  modalCard: {
    width: '95%',
    maxWidth: 1400,
    height: '92%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    display: 'flex',
    flexDirection: 'column',
    ...theme.shadows.lg,
  },
  modalCardFullScreen: {
    width: '100%',
    maxWidth: '100%',
    height: '100%',
    borderRadius: 0,
    borderWidth: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  headerTitleContainer: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
    flexWrap: 'wrap',
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
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  tabBarContainer: {
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});
