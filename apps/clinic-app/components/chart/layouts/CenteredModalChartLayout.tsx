import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { theme } from '../../../constants/theme';
import {
  ThemedText,
  Badge,
  SegmentedControl,
  Button,
} from '../../ui';
import { useBreakpoint } from '../../../utils/useBreakpoint';
import { formatLongAge } from '../../../utils/age';
import PatientSummarySpine, { formatBloodTypeLabel } from '../PatientSummarySpine';
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
                    ? `${formatLongAge(patient.dateOfBirth)}, ${patient.sex}`
                    : `${patient.age ? `${patient.age} yrs, ` : ''}${patient.sex}`}
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
                {formatBloodTypeLabel(patient.bloodType) ? (
                  <Badge label={formatBloodTypeLabel(patient.bloodType)!} variant="neutral" size="sm" icon="droplet" />
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

            <Button
              variant="subtle"
              size="sm"
              icon="edit"
              iconOnly
              accessibilityLabel="Edit Demographics"
              onPress={onEditDemographics}
            />

            {onRefreshChart ? (
              <Button
                variant="subtle"
                size="sm"
                icon="refresh"
                iconOnly
                accessibilityLabel="Refresh patient chart"
                loading={loadingChart}
                disabled={loadingChart}
                onPress={onRefreshChart}
              />
            ) : null}

            {!isCompact ? (
              <Button
                variant="subtle"
                size="sm"
                icon={isMaximized ? 'minimize' : 'maximize'}
                iconOnly
                accessibilityLabel={isMaximized ? 'Restore chart window' : 'Maximize chart window'}
                onPress={() => setIsMaximized(!isMaximized)}
              />
            ) : null}

            <Button
              variant="subtle"
              size="sm"
              icon="close"
              iconOnly
              accessibilityLabel="Close medical chart"
              onPress={onClose}
            />
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
          {props.canGoBackTab && props.onBackTab ? (
            <Button
              variant="subtle"
              size="sm"
              icon="arrowLeft"
              iconOnly
              accessibilityLabel={
                props.previousTabLabel
                  ? `Back to ${props.previousTabLabel}`
                  : 'Back to previous section'
              }
              onPress={props.onBackTab}
            />
          ) : null}
          <View style={styles.tabBarScrollWrap}>
            <SegmentedControl
              options={props.availableTabs || CHART_TABS}
              value={activeTab}
              onChange={onTabChange}
            />
          </View>
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
  spineWrapper: {
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  tabBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  tabBarScrollWrap: {
    flex: 1,
    minWidth: 0,
  },
  viewport: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});
