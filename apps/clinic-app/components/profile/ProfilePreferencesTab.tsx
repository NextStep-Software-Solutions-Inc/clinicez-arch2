import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { Card, CardContent } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import { theme } from '../../constants/theme';
import type { TextScalePreset } from '../../context/TextScaleContext';
import type { ThemeMode } from '../../context/ThemeModeContext';
import type { UiDensity } from '../../context/UiDensityContext';
import type { SoundTheme } from '../../utils/alertSounds';
import DisplayErgonomicsCard, { SyncStatusBadge } from './DisplayErgonomicsCard';
import AlertChimesCard from './AlertChimesCard';
import type { PersonalChartLayoutMode, PreferencesSyncState } from './types';

export interface ProfilePreferencesTabProps {
  density: UiDensity;
  scale: number;
  textPreset: TextScalePreset;
  personalChartLayout: PersonalChartLayoutMode;
  themeMode?: ThemeMode;
  isDark?: boolean;
  userBrandColorHex?: string | null;
  clinicPrimaryColorHex?: string | null;
  soundTheme: SoundTheme;
  isAlertMuted: boolean;
  customAudioDataUri: string | null;
  customAudioFileName: string | null;
  audioUploadError: string | null;
  syncState: PreferencesSyncState;
  syncErrorMessage?: string | null;
  showSkeletons?: boolean;
  onSelectThemeMode?: (mode: ThemeMode) => void;
  onSelectUserBrandColor?: (colorHex: string | null, label?: string) => void;
  onSelectDensity: (density: UiDensity, label: string) => void;
  onSelectTextPreset: (preset: TextScalePreset, label: string) => void;
  onStepScaleDown: () => void;
  onStepScaleUp: () => void;
  onSelectChartLayout: (layout: PersonalChartLayoutMode) => void;
  onToggleAlertMute: (muted: boolean) => void;
  onSelectSoundTheme: (themeId: SoundTheme) => void;
  onPreviewTone: (themeId: SoundTheme) => void;
  onSelectCustomAudio: () => void;
  onRetrySync: () => void;
}

export default function ProfilePreferencesTab({
  density,
  scale,
  textPreset,
  personalChartLayout,
  themeMode,
  isDark,
  userBrandColorHex,
  clinicPrimaryColorHex,
  soundTheme,
  isAlertMuted,
  customAudioDataUri,
  customAudioFileName,
  audioUploadError,
  syncState,
  syncErrorMessage,
  showSkeletons = false,
  onSelectThemeMode,
  onSelectUserBrandColor,
  onSelectDensity,
  onSelectTextPreset,
  onStepScaleDown,
  onStepScaleUp,
  onSelectChartLayout,
  onToggleAlertMute,
  onSelectSoundTheme,
  onPreviewTone,
  onSelectCustomAudio,
  onRetrySync,
}: ProfilePreferencesTabProps) {
  if (showSkeletons) {
    return (
      <View style={styles.tabContainer}>
        <Card>
          <CardContent>
            <SkeletonList rows={4} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <SkeletonList rows={3} />
          </CardContent>
        </Card>
      </View>
    );
  }

  const statusBadge = <SyncStatusBadge syncState={syncState} onRetrySync={onRetrySync} />;

  return (
    <View style={styles.tabContainer}>
      {syncState === 'error' ? (
        <View style={styles.errorBanner}>
          <View style={styles.errorTextRow}>
            <Icon name="alertCircle" size={theme.sizes.iconSm} color={theme.colors.emergency} />
            <ThemedText variant="small" color={theme.colors.emergencyText} style={styles.flex1}>
              {syncErrorMessage ||
                'Could not save your preferences online. Your changes still work on this device.'}
            </ThemedText>
          </View>
          <Button
            title="Try Again"
            variant="outline"
            size="sm"
            icon="refresh"
            onPress={onRetrySync}
          />
        </View>
      ) : null}

      <DisplayErgonomicsCard
        density={density}
        scale={scale}
        textPreset={textPreset}
        personalChartLayout={personalChartLayout}
        themeMode={themeMode}
        isDark={isDark}
        userBrandColorHex={userBrandColorHex}
        clinicPrimaryColorHex={clinicPrimaryColorHex}
        syncStatusBadge={statusBadge}
        onSelectThemeMode={onSelectThemeMode}
        onSelectUserBrandColor={onSelectUserBrandColor}
        onSelectDensity={onSelectDensity}
        onSelectTextPreset={onSelectTextPreset}
        onStepScaleDown={onStepScaleDown}
        onStepScaleUp={onStepScaleUp}
        onSelectChartLayout={onSelectChartLayout}
      />

      <AlertChimesCard
        soundTheme={soundTheme}
        isAlertMuted={isAlertMuted}
        customAudioDataUri={customAudioDataUri}
        customAudioFileName={customAudioFileName}
        audioUploadError={audioUploadError}
        syncStatusBadge={statusBadge}
        onToggleAlertMute={onToggleAlertMute}
        onSelectSoundTheme={onSelectSoundTheme}
        onPreviewTone={onPreviewTone}
        onSelectCustomAudio={onSelectCustomAudio}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabContainer: {
    width: '100%',
    alignSelf: 'stretch',
    gap: theme.spacing.lg,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.emergencySubtle,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.emergencyBorder,
  },
  errorTextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flex: 1,
    minWidth: 200,
  },
  flex1: {
    flex: 1,
  },
});
