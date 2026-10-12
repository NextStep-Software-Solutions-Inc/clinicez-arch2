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
              <ThemedText variant="title">Medical chart</ThemedText>
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
              >
                <Icon name="refresh" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
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
              patientChart={patientChart}
              onTabSelect={onTabChange}
            />
          </View>
        ) : null}

        {/* ========================================================================= */}
        {/* TAB NAVIGATION BAR                                                        */}
        {/* ========================================================================= */}
        <View style={styles.tabBarContainer}>
          <SegmentedControl
            options={CHART_TABS}
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
    maxWidth: 1440,
    height: '92%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.xl,
    overflow: 'hidden',
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    display: 'flex',
    flexDirection: 'column',
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
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
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
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceHighlight,
  },
  tabBarContainer: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.background,
  },
});
