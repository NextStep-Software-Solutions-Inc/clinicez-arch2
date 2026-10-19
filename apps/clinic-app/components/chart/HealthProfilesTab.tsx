import React, { useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import { ThemedText, Icon } from '../ui';
import { getSessionItem, setSessionItem } from '../../utils/deviceStorage';
import type {
  ClinicPatient,
  PatientSurgicalHistory,
  PatientSocialHistory,
  PatientReproductiveHistory,
  NcdRiskAssessment,
  PhilHealthPatientProfile,
} from '../../services/clinicService';

import ClinicalHistoryTab from './ClinicalHistoryTab';
import LifestyleSocialTab from './LifestyleSocialTab';
import ReproductiveHealthTab from './ReproductiveHealthTab';
import CardiometabolicRiskTab from './CardiometabolicRiskTab';

export type ProfileSubTab = 'surgical' | 'lifestyle' | 'reproductive' | 'cardiometabolic';

export interface HealthProfilesTabProps {
  patient: ClinicPatient;
  profile?: PhilHealthPatientProfile;
  initialProfile?: PhilHealthPatientProfile;
  surgicalHistories?: PatientSurgicalHistory[];
  initialSurgicalHistories?: PatientSurgicalHistory[];
  socialHistory?: PatientSocialHistory;
  initialSocialHistory?: PatientSocialHistory;
  reproductiveHistory?: PatientReproductiveHistory;
  initialReproductiveHistory?: PatientReproductiveHistory;
  latestNcdAssessment?: NcdRiskAssessment;
  initialLatestAssessment?: NcdRiskAssessment;
  onRefreshChart?: () => void;
  initialSubTab?: ProfileSubTab;
}

export default function HealthProfilesTab({
  patient,
  profile,
  initialProfile,
  initialSubTab,
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
  const [activeSubTab, setActiveSubTab] = useState<ProfileSubTab>(() => {
    if (initialSubTab && ['surgical', 'lifestyle', 'reproductive', 'cardiometabolic'].includes(initialSubTab)) {
      return initialSubTab;
    }
    if (typeof window !== 'undefined' && window.location?.search) {
      try {
        const sp = new URLSearchParams(window.location.search);
        const sub = sp.get('subTab') as ProfileSubTab;
        if (sub && ['surgical', 'lifestyle', 'reproductive', 'cardiometabolic'].includes(sub)) {
          return sub;
        }
      } catch {}
    }
    const saved = getSessionItem('clinicez_health_profiles_active_subtab') as ProfileSubTab | null;
    if (saved && ['surgical', 'lifestyle', 'reproductive', 'cardiometabolic'].includes(saved)) {
      return saved;
    }
    return 'surgical';
  });

  const handleSubTabChange = (sub: ProfileSubTab) => {
    setActiveSubTab(sub);
    setSessionItem('clinicez_health_profiles_active_subtab', sub);
    if (typeof window !== 'undefined' && window.history?.replaceState && window.location) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('subTab', sub);
        window.history.replaceState(null, '', url.toString());
      } catch {}
    }
  };

  const surg = surgicalHistories || initialSurgicalHistories;
  const soc = socialHistory || initialSocialHistory;
  const rep = reproductiveHistory || initialReproductiveHistory;
  const ncd = latestNcdAssessment || initialLatestAssessment;

  return (
    <View style={styles.container}>
      {/* Sub-Tab Navigation Bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.subTabScroll}
        contentContainerStyle={styles.subTabBar}
      >
        <Pressable
          onPress={() => handleSubTabChange('surgical')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeSubTab === 'surgical' }}
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
          onPress={() => handleSubTabChange('lifestyle')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeSubTab === 'lifestyle' }}
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
          onPress={() => handleSubTabChange('reproductive')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeSubTab === 'reproductive' }}
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
          onPress={() => handleSubTabChange('cardiometabolic')}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeSubTab === 'cardiometabolic' }}
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
            Cardiometabolic & NCD
          </ThemedText>
        </Pressable>
      </ScrollView>

      {/* Sub-Tab Content View */}
      <View style={styles.subTabContent}>
        {activeSubTab === 'surgical' && (
          <ClinicalHistoryTab
            patient={patient}
            initialSurgicalHistories={surg}
            initialProfile={profile || initialProfile}
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
  subTabScroll: {
    flexGrow: 0,
    marginBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  subTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    gap: theme.spacing.xs,
    paddingBottom: 6,
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
    flexShrink: 0,
  },
  subTabBtn_active: {
    backgroundColor: theme.colors.primarySubtle,
    borderColor: theme.colors.primaryBorder,
  },
  subTabContent: {
    flex: 1,
  },
});
