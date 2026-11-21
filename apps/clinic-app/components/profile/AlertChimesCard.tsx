import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Icon from '../ui/Icon';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { theme } from '../../constants/theme';
import { SOUND_THEME_PRESETS, type SoundTheme } from '../../utils/alertSounds';
import { ToggleSwitch } from '../settings/AddEditFieldModal';

export interface AlertChimesCardProps {
  soundTheme: SoundTheme;
  isAlertMuted: boolean;
  customAudioDataUri: string | null;
  customAudioFileName: string | null;
  audioUploadError: string | null;
  syncStatusBadge: React.ReactNode;
  onToggleAlertMute: (muted: boolean) => void;
  onSelectSoundTheme: (themeId: SoundTheme) => void;
  onPreviewTone: (themeId: SoundTheme) => void;
  onSelectCustomAudio: () => void;
}

export default function AlertChimesCard({
  soundTheme,
  isAlertMuted,
  customAudioDataUri,
  customAudioFileName,
  audioUploadError,
  syncStatusBadge,
  onToggleAlertMute,
  onSelectSoundTheme,
  onPreviewTone,
  onSelectCustomAudio,
}: AlertChimesCardProps) {
  return (
    <Card>
      <CardHeader
        icon="bell"
        title="Notification Sounds"
        subtitle="Choose alert sounds for patient queue calls and messages."
        rightAction={
          <View style={styles.headerRightActions}>
            {syncStatusBadge}
            <Button
              title="Test Sound"
              variant="outline"
              size="sm"
              icon="volume2"
              disabled={isAlertMuted || soundTheme === 'silent'}
              onPress={() => onPreviewTone(soundTheme)}
            />
          </View>
        }
      />
      <CardContent style={styles.cardSection}>
        {/* Master Mute Switch Row */}
        <View style={styles.audioToggleRow}>
          <View style={styles.audioToggleInfo}>
            <View style={styles.inlineHeader}>
              <Icon
                name={isAlertMuted ? 'volumeX' : 'volume2'}
                size={theme.sizes.iconMd}
                color={isAlertMuted ? theme.colors.emergency : theme.colors.primary}
              />
              <ThemedText variant="bodyBold" color={theme.colors.text}>
                Mute All Notification Sounds
              </ThemedText>
              {isAlertMuted ? <Badge label="Muted" variant="emergency" size="xs" /> : null}
            </View>
            <ThemedText variant="caption" color={theme.colors.textSecondary}>
              Turn off sound alerts for patient queue calls and messages on this device.
            </ThemedText>
          </View>
          <ToggleSwitch
            value={isAlertMuted}
            onValueChange={onToggleAlertMute}
            accessibilityLabel="Mute All Notification Sounds"
          />
        </View>

        {/* Sound Options */}
        <View style={styles.subsection}>
          <View style={styles.sectionHeaderRow}>
            <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
              SOUND OPTIONS
            </ThemedText>
            {soundTheme === 'custom' || SOUND_THEME_PRESETS.find((p) => p.id === soundTheme)?.name ? (
              <Badge
                label={
                  soundTheme === 'custom'
                    ? 'Custom Sound'
                    : SOUND_THEME_PRESETS.find((p) => p.id === soundTheme)?.name || ''
                }
                variant="primary"
                size="xs"
              />
            ) : null}
          </View>

          <View style={styles.tileGrid}>
            {SOUND_THEME_PRESETS.map((presetItem) => {
              const isSelected = soundTheme === presetItem.id;
              const isPresetMuted = presetItem.id === 'silent';
              const isCustomTheme = presetItem.id === 'custom';

              return (
                <Pressable
                  key={presetItem.id}
                  onPress={() => onSelectSoundTheme(presetItem.id)}
                  style={[
                    styles.compactTile,
                    isSelected && styles.compactTileActive,
                    isAlertMuted && styles.tileMuted,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={presetItem.name}
                >
                  <View style={styles.tileTopRow}>
                    <View style={styles.inlineHeader}>
                      <Icon
                        name={
                          isPresetMuted
                            ? 'volumeX'
                            : isCustomTheme
                            ? 'upload'
                            : isSelected
                            ? 'volume2'
                            : 'bell'
                        }
                        size={theme.sizes.iconSm}
                        color={isSelected ? theme.colors.primary : theme.colors.textSecondary}
                      />
                      <ThemedText
                        variant="smallBold"
                        color={isSelected ? theme.colors.primary : theme.colors.text}
                      >
                        {presetItem.name}
                      </ThemedText>
                    </View>
                    {isSelected ? <Badge label="Selected" variant="primary" size="xs" /> : null}
                  </View>

                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    {presetItem.description}
                  </ThemedText>

                  {!isPresetMuted && (!isCustomTheme || customAudioDataUri) ? (
                    <View style={styles.presetActionRow}>
                      <Button
                        title="Play Sample"
                        variant="ghost"
                        size="sm"
                        icon="volume2"
                        onPress={() => onPreviewTone(presetItem.id)}
                      />
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Custom Audio Upload */}
        <View style={styles.customAudioCard}>
          <View style={styles.customAudioHeader}>
            <Icon name="upload" size={theme.sizes.iconMd} color={theme.colors.primary} />
            <View style={styles.customAudioInfo}>
              <ThemedText variant="smallBold" color={theme.colors.text}>
                Custom Sound File
              </ThemedText>
              <ThemedText variant="caption" color={theme.colors.textSecondary}>
                Upload an MP3, WAV, or OGG file up to 500 KB. Saved to your account automatically.
              </ThemedText>
            </View>
          </View>

          {customAudioFileName ? (
            <View style={styles.customAudioLoadedRow}>
              <View style={styles.selectedFilePill}>
                <Icon name="volume2" size={theme.sizes.iconSm} color={theme.colors.primary} />
                <ThemedText variant="captionBold" color={theme.colors.text} numberOfLines={1}>
                  {customAudioFileName}
                </ThemedText>
                <Badge label="Loaded" variant="success" size="xs" icon="check" />
              </View>
              <View style={styles.customAudioButtons}>
                <Button
                  title="Test Play"
                  variant="secondary"
                  size="sm"
                  icon="volume2"
                  onPress={() => onPreviewTone('custom')}
                />
                <Button
                  title="Change File"
                  variant="ghost"
                  size="sm"
                  icon="upload"
                  onPress={onSelectCustomAudio}
                />
              </View>
            </View>
          ) : (
            <View style={styles.customAudioUploadRow}>
              <Button
                title="Upload Sound File (.mp3, .wav, .ogg)"
                variant="secondary"
                size="sm"
                icon="upload"
                onPress={onSelectCustomAudio}
              />
            </View>
          )}

          {audioUploadError ? (
            <ThemedText variant="caption" color={theme.colors.emergency}>
              {audioUploadError}
            </ThemedText>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  cardSection: {
    gap: theme.spacing.md,
  },
  subsection: {
    gap: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  compactTile: {
    flex: 1,
    minWidth: 180,
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  compactTileActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
    ...theme.shadows.brandSubtle,
  },
  tileMuted: {
    opacity: 0.65,
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  inlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  audioToggleRow: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  audioToggleInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  presetActionRow: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  customAudioCard: {
    padding: theme.spacing.md,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  customAudioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  customAudioInfo: {
    flex: 1,
    gap: 2,
  },
  customAudioLoadedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  selectedFilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderLight,
    maxWidth: 320,
  },
  customAudioButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  customAudioUploadRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
});
