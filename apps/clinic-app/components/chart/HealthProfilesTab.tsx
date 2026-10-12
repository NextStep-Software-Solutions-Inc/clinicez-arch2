import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Icon } from '../ui';
import type {
  ClinicPatient,
  PatientSurgicalHistory,
  PatientSocialHistory,
  PatientReproductiveHistory,
  NcdRiskAssessment,
} from '../../services/clinicService';

import ClinicalHistoryTab from './ClinicalHistoryTab';
import LifestyleSocialTab from './LifestyleSocialTab';
import ReproductiveHealthTab from './ReproductiveHealthTab';
import CardiometabolicRiskTab from './CardiometabolicRiskTab';

export type ProfileSubTab = 'surgical' | 'lifestyle' | 'reproductive' | 'cardiometabolic';

export interface HealthProfilesTabProps {
  patient: ClinicPatient;
  surgicalHistories?: PatientSurgicalHistory[];
  initialSurgicalHistories?: PatientSurgicalHistory[];
  socialHistory?: PatientSocialHistory;
  initialSocialHistory?: PatientSocialHistory;
  reproductiveHistory?: PatientReproductiveHistory;
  initialReproductiveHistory?: PatientReproductiveHistory;
  latestNcdAssessment?: NcdRiskAssessment;
  initialLatestAssessment?: NcdRiskAssessment;
  onRefreshChart?: () => void;
}

export default function HealthProfilesTab({
  patient,
  surgicalHistories,
  initialSurgicalHistories,
  socialHistory,
  initialSocialHistory,
  reproductiveHistory,
  initialReproductiveHistory,
  latestNcdAssessment,
  initialLatestAssessment,
  onRefreshChart,
}: HealthProfilesTabProps) {
  const [activeSubTab, setActiveSubTab] = useState<ProfileSubTab>('surgical');

  const surg = surgicalHistories || initialSurgicalHistories;
  const soc = socialHistory || initialSocialHistory;
  const rep = reproductiveHistory || initialReproductiveHistory;
  const ncd = latestNcdAssessment || initialLatestAssessment;

  return (
    <View style={styles.container}>
      {/* Sub-Tab Navigation Bar */}
      <View style={styles.subTabBar}>
        <Pressable
          onPress={() => setActiveSubTab('surgical')}
          style={[styles.subTabBtn, activeSubTab === 'surgical' && styles.subTabBtn_active]}
        >
          <Icon
            name="activity"
            size={14}
            color={activeSubTab === 'surgical' ? theme.colors.primaryDark : theme.colors.textSecondary}
          />
          <ThemedText
            variant="captionBold"
            color={activeSubTab === 'surgical' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Surgical & Clinical
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setActiveSubTab('lifestyle')}
          style={[styles.subTabBtn, activeSubTab === 'lifestyle' && styles.subTabBtn_active]}
        >
          <Icon
            name="heartPulse"
            size={14}
            color={activeSubTab === 'lifestyle' ? theme.colors.primaryDark : theme.colors.textSecondary}
          />
          <ThemedText
            variant="captionBold"
            color={activeSubTab === 'lifestyle' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Lifestyle & Social
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setActiveSubTab('reproductive')}
          style={[styles.subTabBtn, activeSubTab === 'reproductive' && styles.subTabBtn_active]}
        >
          <Icon
            name="baby"
            size={14}
            color={activeSubTab === 'reproductive' ? theme.colors.primaryDark : theme.colors.textSecondary}
          />
          <ThemedText
            variant="captionBold"
            color={activeSubTab === 'reproductive' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Reproductive / OB-GYN
          </ThemedText>
        </Pressable>

        <Pressable
          onPress={() => setActiveSubTab('cardiometabolic')}
          style={[styles.subTabBtn, activeSubTab === 'cardiometabolic' && styles.subTabBtn_active]}
        >
          <Icon
            name="yakap"
            size={14}
            color={activeSubTab === 'cardiometabolic' ? theme.colors.primaryDark : theme.colors.textSecondary}
          />
          <ThemedText
            variant="captionBold"
            color={activeSubTab === 'cardiometabolic' ? theme.colors.primaryDark : theme.colors.textSecondary}
          >
            Cardiometabolic & NCD (lib_ncdq)
          </ThemedText>
        </Pressable>
      </View>

      {/* Sub-Tab Content View */}
      <View style={styles.subTabContent}>
        {activeSubTab === 'surgical' && (
          <ClinicalHistoryTab
            patient={patient}
            initialSurgicalHistories={surg}
            onRefreshChart={onRefreshChart}
          />
        )}
        {activeSubTab === 'lifestyle' && (
          <LifestyleSocialTab
            patient={patient}
            initialSocialHistory={soc}
            onRefreshChart={onRefreshChart}
          />
        )}
        {activeSubTab === 'reproductive' && (
          <ReproductiveHealthTab
            patient={patient}
            initialReproductiveHistory={rep}
            onRefreshChart={onRefreshChart}
          />
        )}
        {activeSubTab === 'cardiometabolic' && (
          <CardiometabolicRiskTab
            patient={patient}
            initialLatestAssessment={ncd}
            onRefreshChart={onRefreshChart}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  subTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  subTabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  subTabBtn_active: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  subTabContent: {
    flex: 1,
  },
});
