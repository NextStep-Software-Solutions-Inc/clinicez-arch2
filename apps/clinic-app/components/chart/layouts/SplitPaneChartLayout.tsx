import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { theme } from '../../../constants/theme';
import {
  ThemedText,
  Badge,
  Icon,
} from '../../ui';
import type { IconName } from '../../ui/Icon';
import { useBreakpoint } from '../../../utils/useBreakpoint';
import { formatLongAge } from '../../../utils/age';
import { formatPhilHealthPin } from '../PatientSummarySpine';
import ChartLayoutSwitcher from '../ChartLayoutSwitcher';
import ChartTabContentView from '../ChartTabContentView';
import type { ChartLayoutProps, ChartTab } from '../types';

interface NavItemMeta {
  tab: ChartTab;
  label: string;
  icon: IconName;
  getCount?: (chart: any, attachments?: any[]) => number | undefined;
}

const SPLIT_NAV_ITEMS: readonly NavItemMeta[] = [
  { tab: 'summary', label: 'Executive Summary', icon: 'dashboard' },
  {
    tab: 'encounters',
    label: 'Encounters Timeline',
    icon: 'consultations',
    getCount: (chart) => chart?.consultations?.length,
  },
  {
    tab: 'diagnostics',
    label: 'Diagnostic Labs',
    icon: 'lab',
    getCount: (chart) => chart?.labOrdersHistory?.length,
  },
  {
    tab: 'procedures',
    label: 'Nursing Procedures',
    icon: 'activity',
    getCount: (chart) => chart?.proceduresHistory?.length,
  },
  {
    tab: 'immunizations',
    label: 'Vaccines & Immunization',
    icon: 'syringe',
    getCount: (chart) => chart?.immunizations?.length,
  },
  { tab: 'profiles', label: 'Health Profiles', icon: 'clipboard' },
  {
    tab: 'vault',
    label: 'Document Vault',
    icon: 'folder',
    getCount: (_, attachments) => attachments?.length,
  },
] as const;

export default function SplitPaneChartLayout(props: ChartLayoutProps) {
  const {
    patient,
    patientChart,
    patientAttachments = [],
    activeTab,
    onTabChange,
    onClose,
    onRefreshChart,
    onEditDemographics,
    currentLayout,
    onSwitchLayout,
  } = props;

  const { isCompact } = useBreakpoint();

  const formattedPin = patient ? formatPhilHealthPin(patient.philHealthNumber) : null;
  const activeNavItem = SPLIT_NAV_ITEMS.find((item) => item.tab === activeTab);
  const allergies = patientChart?.allergies || [];
  const latestVitals = patientChart?.vitalsHistory?.[0];

  return (
    <View style={styles.overlay}>
      <View
        style={styles.workstation}
        aria-modal={true}
        accessibilityLabel={`Clinical Workstation for ${patient?.fullName || 'Patient'}`}
      >
        {/* ========================================================================= */}
        {/* LEFT COLUMN: PERSISTENT CLINICAL SIDEBAR RAIL                             */}
        {/* ========================================================================= */}
        <View style={[styles.sidebarRail, isCompact && styles.sidebarRailCompact]}>
          <ScrollView
            style={styles.sidebarScroll}
            contentContainerStyle={styles.sidebarContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Patient Profile Card */}
            {patient ? (
              <View style={styles.patientProfileCard}>
                <View style={styles.avatarContainer}>
                  <ThemedText variant="title" color={theme.colors.onPrimary}>
                    {(patient.firstName?.[0] || 'P') + (patient.lastName?.[0] || '')}
                  </ThemedText>
                </View>

                <ThemedText variant="bodyBold" color={theme.colors.text} numberOfLines={2}>
                  {patient.fullName}
                </ThemedText>

                <View style={styles.identityDetails}>
                  <View style={styles.identityRow}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      MRN:
                    </ThemedText>
                    <ThemedText
                      variant="captionBold"
                      color={theme.colors.text}
                      numberOfLines={1}
                      style={styles.identityValue}
                    >
                      {patient.patientCode || '—'}
                    </ThemedText>
                  </View>

                  <View style={styles.identityRow}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>
                      Demographics:
                    </ThemedText>
                    <ThemedText
                      variant="caption"
                      color={theme.colors.text}
                      numberOfLines={1}
                      style={styles.identityValue}
                    >
                      {patient.dateOfBirth
                        ? `${formatLongAge(patient.dateOfBirth)}, ${patient.gender}`
                        : `${patient.age ? `${patient.age} yrs, ` : ''}${patient.gender}`}
                    </ThemedText>
                  </View>

                  {formattedPin ? (
                    <View style={styles.identityRow}>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        PHIC:
                      </ThemedText>
                      <ThemedText
                        variant="caption"
                        color={theme.colors.text}
                        numberOfLines={1}
                        style={styles.identityValue}
                      >
                        {formattedPin}
                      </ThemedText>
                    </View>
                  ) : null}
                </View>

                <View style={styles.badgeRow}>
                  {patient.verificationStatus === 'Verified' ? (
                    <Badge label="Verified" variant="success" size="sm" icon="checkCircle" />
                  ) : (
                    <Badge label="Unverified" variant="warning" size="sm" icon="alert" />
                  )}
                  {patient.bloodType ? (
                    <Badge label={`Type ${patient.bloodType}`} variant="neutral" size="sm" icon="droplet" />
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Critical Allergy & Alert Banner */}
            <View style={styles.sectionHeader}>
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.sectionTitle}>
                CLINICAL ALERTS
              </ThemedText>
            </View>
            <View style={styles.alertBox}>
              {allergies.length > 0 ? (
                allergies.map((all, i) => (
                  <View key={i} style={styles.allergyItem}>
                    <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergencyText} />
                    <ThemedText variant="caption" color={theme.colors.emergencyText} style={styles.allergyText}>
                      ALLERGY: {all.allergen}
                    </ThemedText>
                  </View>
                ))
              ) : (
                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  No known drug allergies (NKDA)
                </ThemedText>
              )}
            </View>

            {/* Latest Vitals Snapshot */}
            {latestVitals ? (
              <>
                <View style={styles.sectionHeader}>
                  <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.sectionTitle}>
                    LATEST VITALS
                  </ThemedText>
                </View>
                <View style={styles.vitalsBox}>
                  <View style={styles.vitalMetric}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>BP</ThemedText>
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      {latestVitals.systolicBp && latestVitals.diastolicBp
                        ? `${latestVitals.systolicBp}/${latestVitals.diastolicBp}`
                        : '—'}
                    </ThemedText>
                  </View>
                  <View style={styles.vitalMetric}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>HR</ThemedText>
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      {latestVitals.heartRateBpm ? `${latestVitals.heartRateBpm} bpm` : '—'}
                    </ThemedText>
                  </View>
                  <View style={styles.vitalMetric}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>Temp</ThemedText>
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      {latestVitals.temperatureCelsius ? `${latestVitals.temperatureCelsius}°C` : '—'}
                    </ThemedText>
                  </View>
                  <View style={styles.vitalMetric}>
                    <ThemedText variant="caption" color={theme.colors.textSecondary}>SpO2</ThemedText>
                    <ThemedText variant="smallBold" color={theme.colors.text}>
                      {latestVitals.oxygenSaturationPercent ? `${latestVitals.oxygenSaturationPercent}%` : '—'}
                    </ThemedText>
                  </View>
                </View>
              </>
            ) : null}

            {/* Vertical Tab Navigation Rail */}
            <View style={styles.sectionHeader}>
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.sectionTitle}>
                CHART NAVIGATION
              </ThemedText>
            </View>
            <View style={styles.navList}>
              {SPLIT_NAV_ITEMS.map((item) => {
                const isSelected = activeTab === item.tab;
                const count = item.getCount?.(patientChart, patientAttachments);
                return (
                  <Pressable
                    key={item.tab}
                    onPress={() => onTabChange(item.tab)}
                    style={({ pressed }) => [
                      styles.navItem,
                      isSelected && styles.navItemActive,
                      pressed && styles.navItemPressed,
                    ]}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={item.label}
                  >
                    <View style={styles.navItemLeft}>
                      <Icon
                        name={item.icon}
                        size={theme.sizes.iconMd}
                        color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                      />
                      <ThemedText
                        variant={isSelected ? 'bodyBold' : 'body'}
                        color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                        style={styles.navLabel}
                      >
                        {item.label}
                      </ThemedText>
                    </View>

                    {count !== undefined && count > 0 ? (
                      <View style={[styles.navBadge, isSelected && styles.navBadgeActive]}>
                        <ThemedText
                          variant="caption"
                          color={isSelected ? theme.colors.primaryDark : theme.colors.textSecondary}
                          style={styles.navBadgeText}
                        >
                          {count}
                        </ThemedText>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          {/* Quick Action Footer in Sidebar */}
          <View style={styles.sidebarFooter}>
            <Pressable
              onPress={onEditDemographics}
              style={({ pressed }) => [styles.footerBtn, pressed && styles.footerBtnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Edit Patient Information"
            >
              <Icon name="edit" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
              <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.footerBtnText}>
                Edit Demographics
              </ThemedText>
            </Pressable>

            {onRefreshChart ? (
              <Pressable
                onPress={onRefreshChart}
                style={({ pressed }) => [styles.footerBtn, pressed && styles.footerBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Refresh Chart"
              >
                <Icon name="refresh" size={theme.sizes.iconSm} color={theme.colors.textSecondary} />
                <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.footerBtnText}>
                  Refresh
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        </View>

        {/* ========================================================================= */}
        {/* RIGHT COLUMN: EXPANSIVE CLINICAL WORKSPACE CANVAS                         */}
        {/* ========================================================================= */}
        <View style={styles.canvasContainer}>
          {/* Workstation Top Bar */}
          <View style={styles.canvasHeader}>
            <View style={styles.canvasHeaderTitle}>
              <ThemedText variant="title" color={theme.colors.text}>
                {activeNavItem?.label || 'Clinical View'}
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                {patient?.fullName || 'Patient'} • Code: {patient?.patientCode || '—'}
              </ThemedText>
            </View>

            <View style={styles.canvasHeaderActions}>
              <ChartLayoutSwitcher
                currentLayout={currentLayout}
                onSwitchLayout={onSwitchLayout}
              />

              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Close Medical Workstation"
              >
                <Icon name="close" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          {/* Active Tab Viewport */}
          <View style={styles.canvasViewport}>
            <ChartTabContentView {...props} />
          </View>
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
  },
  workstation: {
    width: '100%',
    height: '100%',
    backgroundColor: theme.colors.surface,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  sidebarRail: {
    width: 290,
    backgroundColor: theme.colors.surfaceHighlight,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarRailCompact: {
    width: 240,
  },
  sidebarScroll: {
    flex: 1,
  },
  sidebarContent: {
    padding: theme.spacing.md,
  },
  patientProfileCard: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    marginBottom: theme.spacing.sm,
  },
  avatarContainer: {
    width: 52,
    height: 52,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  identityDetails: {
    width: '100%',
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  identityValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.sm,
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  sectionHeader: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  sectionTitle: {
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  alertBox: {
    backgroundColor: theme.colors.emergencyBg,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.emergencyBorder,
    padding: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  allergyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  allergyText: {
    fontWeight: '600',
  },
  vitalsBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: theme.spacing.sm,
  },
  vitalMetric: {
    alignItems: 'center',
  },
  navList: {
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  navItemActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primaryBorder,
  },
  navItemPressed: {
    backgroundColor: theme.colors.borderLight,
    opacity: 0.8,
  },
  navItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
  },
  navLabel: {
    flexShrink: 1,
  },
  navBadge: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 2,
    borderRadius: theme.radii.full,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  navBadgeActive: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.primaryBorder,
  },
  navBadgeText: {
    fontWeight: '700',
  },
  sidebarFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.xs,
  },
  footerBtnPressed: {
    opacity: 0.7,
  },
  footerBtnText: {
    fontWeight: '600',
  },
  canvasContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: theme.colors.background,
  },
  canvasHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  canvasHeaderTitle: {
    flex: 1,
  },
  canvasHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
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
  canvasViewport: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
});
