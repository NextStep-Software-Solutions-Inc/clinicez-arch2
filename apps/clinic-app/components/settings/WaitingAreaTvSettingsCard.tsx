import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, StyleSheet, Linking, Pressable } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Icon from '../ui/Icon';
import Input from '../ui/Input';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { SkeletonList } from '../ui/Skeleton';
import { ToggleSwitch } from './AddEditFieldModal';
import { theme } from '../../constants/theme';
import { notify } from '../../utils/feedback';
import { clinicService, ClinicSettingsRecord } from '../../services/clinicService';
import { getPortalBaseUrl, getApiBaseUrl } from '../../services/runtimeConfig';
import { resolveTenantContext } from '@shared/safe';
import { buildCloudTvDisplayUrl } from '../../utils/queueDisplayRoute';
import { TV_SOUND_THEMES, playAlertChime, playQueueCallAlert } from '../../utils/audioChime';

export interface WaitingAreaTvSettingsCardProps {
  settings: ClinicSettingsRecord | null;
  onSettingsUpdated?: (updated: ClinicSettingsRecord) => void;
  showSkeletons?: boolean;
}

export default function WaitingAreaTvSettingsCard({
  settings,
  onSettingsUpdated,
  showSkeletons = false,
}: WaitingAreaTvSettingsCardProps) {
  const [maskNames, setMaskNames] = useState<boolean>(true);
  const [showPhysicianName, setShowPhysicianName] = useState<boolean>(settings?.tvDisplayShowPhysicianName ?? true);
  const [, setSaving] = useState<boolean>(false);
  const [, setSavingPhysician] = useState<boolean>(false);
  const [copiedLan, setCopiedLan] = useState<boolean>(false);
  const [copiedCloud, setCopiedCloud] = useState<boolean>(false);
  const [savedPin, setSavedPin] = useState<string | null>(settings?.tvDisplayPin || null);
  const [pinInput, setPinInput] = useState<string>(settings?.tvDisplayPin || '');
  const [savingPin, setSavingPin] = useState<boolean>(false);

  // Sound Theme & Voice Announcement Settings
  const [soundTheme, setSoundTheme] = useState<string>(settings?.tvDisplaySoundTheme || 'classicChime');
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(settings?.tvDisplayVoiceEnabled ?? false);
  const [, setSavingTheme] = useState<boolean>(false);
  const [, setSavingVoice] = useState<boolean>(false);

  useEffect(() => {
    if (settings) {
      setMaskNames(settings.tvDisplayMaskPatientNames ?? true);
      if (settings.tvDisplayShowPhysicianName !== undefined) {
        setShowPhysicianName(settings.tvDisplayShowPhysicianName);
      }
      if (settings.tvDisplayPin !== undefined) {
        setSavedPin(settings.tvDisplayPin || null);
        setPinInput(settings.tvDisplayPin || '');
      }
      if (settings.tvDisplaySoundTheme) {
        setSoundTheme(settings.tvDisplaySoundTheme);
      }
      if (settings.tvDisplayVoiceEnabled !== undefined) {
        setVoiceEnabled(settings.tvDisplayVoiceEnabled);
      }
    }
  }, [settings]);

  // 1. Local LAN Kiosk URL: runs on the clinic server / Edge Cell port 3000
  const localLanUrl = useMemo<string>(() => {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return `${window.location.origin}/#/queue-display`;
    }
    const apiBase = getApiBaseUrl();
    if (apiBase) {
      try {
        const u = new URL(apiBase);
        return `http://${u.hostname}:3000/#/queue-display`;
      } catch {
        return '/#/queue-display';
      }
    }
    return '/#/queue-display';
  }, []);

  // 2. Public Cloud TV URL: routed via portal-web and portal-api (strictly NO UUIDs)
  const portalBase = useMemo(() => getPortalBaseUrl(), []);
  const ctx = useMemo(() => resolveTenantContext(), []);

  const activePin = savedPin ?? settings?.tvDisplayPin ?? null;
  const isPinConfigured = Boolean(activePin && activePin.trim().length > 0);

  const publicCloudTvUrl = useMemo<string>(() => {
    const effectiveSettings = settings ? { ...settings, tvDisplayPin: activePin } : { tvDisplayPin: activePin };
    return buildCloudTvDisplayUrl(portalBase, effectiveSettings, ctx, false);
  }, [portalBase, settings, activePin, ctx]);

  const handleToggleMask = useCallback(
    async (val: boolean) => {
      setMaskNames(val);
      setSaving(true);
      try {
        const [updated, err] = await clinicService.updateSettings({
          tvDisplayMaskPatientNames: val,
        });
        if (err || !updated) {
          setMaskNames(!val);
          notify.error(err?.message || 'Could not update TV display privacy setting.');
          return;
        }
        notify.success(
          val
            ? 'Patient name masking enabled for waiting area TV.'
            : 'Patient name masking disabled (patient names will be shown unmasked).'
        );
        onSettingsUpdated?.(updated);
      } catch {
        setMaskNames(!val);
        notify.error('Failed to save TV display setting.');
      } finally {
        setSaving(false);
      }
    },
    [onSettingsUpdated]
  );

  const handleTogglePhysicianName = useCallback(
    async (val: boolean) => {
      setShowPhysicianName(val);
      setSavingPhysician(true);
      try {
        const [updated, err] = await clinicService.updateSettings({
          tvDisplayShowPhysicianName: val,
        });
        if (err || !updated) {
          setShowPhysicianName(!val);
          notify.error(err?.message || 'Could not update TV clinician display setting.');
          return;
        }
        notify.success(
          val
            ? 'Clinician and staff names will be shown on waiting room TV screens.'
            : 'Clinician and staff names hidden on waiting room TV screens (room/station only).'
        );
        onSettingsUpdated?.(updated);
      } catch {
        setShowPhysicianName(!val);
        notify.error('Failed to save TV clinician display setting.');
      } finally {
        setSavingPhysician(false);
      }
    },
    [onSettingsUpdated]
  );

  const handleSavePin = useCallback(
    async (pinToSave: string | null) => {
      setSavingPin(true);
      try {
        const trimmed = pinToSave ? pinToSave.trim() : null;
        const [updated, err] = await clinicService.updateSettings({
          tvDisplayPin: trimmed,
          clearTvDisplayPin: !trimmed,
        });
        if (err) {
          notify.error(err.message || 'Could not save TV display passcode.');
          return;
        }
        const effectivePin = updated?.tvDisplayPin !== undefined ? updated.tvDisplayPin : trimmed;
        setSavedPin(effectivePin);
        setPinInput(effectivePin || '');
        notify.success(
          effectivePin
            ? `TV Display Passcode set to "${effectivePin}". Waiting area boards now require this PIN.`
            : 'TV Display Passcode cleared. Display board is now public without PIN.'
        );
        const resolvedSettings: ClinicSettingsRecord = {
          ...(settings || ({} as ClinicSettingsRecord)),
          ...(updated || {}),
          tvDisplayPin: effectivePin,
        };
        onSettingsUpdated?.(resolvedSettings);
      } catch {
        notify.error('Failed to update TV display passcode.');
      } finally {
        setSavingPin(false);
      }
    },
    [onSettingsUpdated, settings]
  );

  const handleGeneratePin = useCallback(() => {
    const randomPin = String(Math.floor(100000 + Math.random() * 900000));
    setPinInput(randomPin);
    void handleSavePin(randomPin);
  }, [handleSavePin]);

  const handleSelectTheme = useCallback(
    async (newTheme: string) => {
      setSoundTheme(newTheme);
      setSavingTheme(true);
      playAlertChime(newTheme);
      try {
        const [updated, err] = await clinicService.updateSettings({
          tvDisplaySoundTheme: newTheme,
        });
        if (err || !updated) {
          notify.error(err?.message || 'Could not update TV display sound theme.');
          return;
        }
        notify.success('Waiting area TV chime sound updated.');
        onSettingsUpdated?.(updated);
      } catch {
        notify.error('Failed to update TV display sound theme.');
      } finally {
        setSavingTheme(false);
      }
    },
    [onSettingsUpdated]
  );

  const handleToggleVoice = useCallback(
    async (enabled: boolean) => {
      setVoiceEnabled(enabled);
      setSavingVoice(true);
      if (enabled) {
        playQueueCallAlert({
          theme: soundTheme,
          voiceEnabled: true,
          ticketNumber: 'P-101',
          roomOrStation: 'Room 1',
        });
      }
      try {
        const [updated, err] = await clinicService.updateSettings({
          tvDisplayVoiceEnabled: enabled,
        });
        if (err || !updated) {
          setVoiceEnabled(!enabled);
          notify.error(err?.message || 'Could not update TV voice announcement setting.');
          return;
        }
        notify.success(
          enabled
            ? 'Voice ticket announcements enabled (English).'
            : 'Voice ticket announcements disabled.'
        );
        onSettingsUpdated?.(updated);
      } catch {
        setVoiceEnabled(!enabled);
        notify.error('Failed to save TV voice announcement setting.');
      } finally {
        setSavingVoice(false);
      }
    },
    [soundTheme, onSettingsUpdated]
  );

  const handleTestAnnouncement = useCallback(() => {
    playQueueCallAlert({
      theme: soundTheme,
      voiceEnabled: true,
      ticketNumber: 'P-102',
      roomOrStation: 'Room 2',
    });
    notify.info('Playing test announcement for ticket P-102...');
  }, [soundTheme]);

  const openUrl = useCallback((url: string) => {
    if (typeof window !== 'undefined' && window.open) {
      window.open(url, '_blank');
    } else {
      Linking.openURL(url).catch(() => {
        notify.error('Could not open TV display.');
      });
    }
  }, []);

  const copyToClipboard = useCallback(async (text: string, type: 'lan' | 'cloud') => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        if (type === 'lan') {
          setCopiedLan(true);
          setTimeout(() => setCopiedLan(false), 2500);
        } else {
          setCopiedCloud(true);
          setTimeout(() => setCopiedCloud(false), 2500);
        }
        notify.success('Display URL copied to clipboard!');
      } else {
        notify.info('Clipboard access unavailable. Please copy the URL manually.');
      }
    } catch {
      notify.error('Could not copy TV display URL to clipboard.');
    }
  }, []);

  return (
    <Card>
      <CardHeader
        title="Waiting Area TV Display"
        subtitle="Manage waiting room screens, passcode protection, and patient privacy"
        rightAction={
          <Badge
            label={maskNames ? 'Privacy Protection Active' : 'Unmasked (Warning)'}
            variant={maskNames ? 'success' : 'warning'}
          />
        }
      />
      <CardContent>
        {showSkeletons ? (
          <SkeletonList rows={4} />
        ) : (
          <View style={styles.container}>
            {/* Privacy Masking Toggle Row */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <View style={styles.titleWithIcon}>
                  <Icon name="shield" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Hide Patient Full Names on Screen
                  </ThemedText>
                </View>
                <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                  Displays only first name and last initial (e.g. Cassandra A.) on waiting room screens to protect patient privacy.
                </ThemedText>
              </View>
              <ToggleSwitch
                value={maskNames}
                onValueChange={handleToggleMask}
                accessibilityLabel="Toggle Patient Name Masking on TV Display"
              />
            </View>

            {/* Show Attending Physician / Clinician Name Toggle Row */}
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <View style={styles.titleWithIcon}>
                  <Icon name="staff" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    Show Attending Physician / Staff Name
                  </ThemedText>
                </View>
                <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                  Displays the clinician or staff name under the station or room on waiting room screens. Turn off to protect staff privacy.
                </ThemedText>
              </View>
              <ToggleSwitch
                value={showPhysicianName}
                onValueChange={handleTogglePhysicianName}
                accessibilityLabel="Toggle Physician Name Display on TV Screens"
              />
            </View>

            {/* TV Sound Theme Section */}
            <View style={styles.soundCard}>
              <View style={styles.urlHeader}>
                <View style={styles.iconWrapSound}>
                  <Icon name="volume2" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                </View>
                <View style={styles.urlInfo}>
                  <View style={styles.cardTitleBadgeRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Queue Calling Sound Chime
                    </ThemedText>
                    <Badge
                      label={TV_SOUND_THEMES.find((t) => t.id === soundTheme)?.name || 'Classic Chime'}
                      variant="primary"
                    />
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.urlSubtitle}>
                    Select the tone that plays on the waiting room TV whenever a new ticket is called.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.themeGrid}>
                {TV_SOUND_THEMES.map((t) => {
                  const isSelected = soundTheme === t.id;
                  const isSilent = t.id === 'silent';
                  return (
                    <Pressable
                      key={t.id}
                      style={[styles.themeOptionCard, isSelected && styles.themeOptionCardSelected]}
                      onPress={() => handleSelectTheme(t.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={t.name}
                    >
                      <View style={styles.themeOptionHeader}>
                        <ThemedText
                          variant="captionBold"
                          color={isSelected ? theme.colors.primaryDark : theme.colors.text}
                        >
                          {t.name}
                        </ThemedText>
                        {isSelected && <Badge label="Active" variant="primary" size="xs" />}
                      </View>
                      <ThemedText variant="caption" color={theme.colors.textSecondary}>
                        {t.description}
                      </ThemedText>
                      {!isSilent && (
                        <View style={styles.themePreviewRow}>
                          <Button
                            title="Preview Tone"
                            variant="ghost"
                            size="sm"
                            icon="volume2"
                            onPress={() => playAlertChime(t.id)}
                          />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* Text-to-Speech Voice Ticket Read-Aloud Section */}
            <View style={styles.voiceCard}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <View style={styles.titleWithIcon}>
                    <Icon name="volume2" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Read Aloud Queuing Ticket (Text-to-Speech)
                    </ThemedText>
                    {voiceEnabled && (
                      <Badge label="English Only" variant="success" size="xs" />
                    )}
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.toggleSubtitle}>
                    Speaks ticket numbers and destination rooms aloud over the waiting room TV audio (e.g. "Now serving ticket P-102. Please proceed to Room 1."). Strictly English language only.
                  </ThemedText>
                </View>
                <ToggleSwitch
                  value={voiceEnabled}
                  onValueChange={handleToggleVoice}
                  accessibilityLabel="Toggle Read Aloud Queuing Ticket"
                />
              </View>

              {voiceEnabled && (
                <View style={styles.voiceActionsRow}>
                  <Button
                    title="Test Voice Announcement"
                    variant="secondary"
                    icon="volume2"
                    onPress={handleTestAnnouncement}
                  />
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Test announcement plays sample ticket P-102 using browser-native speech synthesis.
                  </ThemedText>
                </View>
              )}
            </View>

            {/* TV Passcode / PIN Protection Card */}
            <View style={styles.pinCard}>
              <View style={styles.urlHeader}>
                <View style={styles.iconWrapPin}>
                  <Icon name="lock" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                </View>
                <View style={styles.urlInfo}>
                  <View style={styles.cardTitleBadgeRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      TV Passcode (PIN Protection)
                    </ThemedText>
                    <Badge
                      label={isPinConfigured ? 'PIN Protection Active' : 'Public Access (No PIN)'}
                      variant={isPinConfigured ? 'success' : 'neutral'}
                    />
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.urlSubtitle}>
                    Both the Portal TV link and Local LAN TV link require this 6-digit PIN to display patient queue tickets. When set, anyone opening either link must enter this passcode.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.pinInputRow}>
                <View style={styles.pinInputContainer}>
                  <Input
                    label="TV Passcode / PIN"
                    value={pinInput}
                    onChangeText={setPinInput}
                    placeholder="Enter 6-digit PIN (e.g. 123456)"
                    maxLength={6}
                    keyboardType="numeric"
                    leftIcon="lock"
                    helperText={
                      isPinConfigured
                        ? `Active PIN: "${activePin}". Both links require this PIN to view queue tickets.`
                        : 'No PIN set. Anyone opening either link can view queue tickets.'
                    }
                  />
                </View>
                <View style={styles.pinActionButtons}>
                  <Button
                    title="Save Passcode"
                    variant="primary"
                    icon="check"
                    loading={savingPin}
                    disabled={savingPin || pinInput.trim() === (activePin || '')}
                    onPress={() => handleSavePin(pinInput)}
                  />
                  <Button
                    title="Generate 6-Digit PIN"
                    variant="secondary"
                    icon="refreshCw"
                    disabled={savingPin}
                    onPress={handleGeneratePin}
                  />
                  {isPinConfigured && (
                    <Button
                      title="Clear PIN"
                      variant="outline"
                      icon="x"
                      disabled={savingPin}
                      onPress={() => handleSavePin(null)}
                    />
                  )}
                </View>
              </View>
            </View>

            {/* 1. Portal TV Display URL Card */}
            <View style={styles.urlCard}>
              <View style={styles.urlHeader}>
                <View style={styles.iconWrapCloud}>
                  <Icon name="cloud" size={theme.sizes.iconMd} color={theme.colors.textSecondary} />
                </View>
                <View style={styles.urlInfo}>
                  <View style={styles.cardTitleBadgeRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Portal TV Display Link
                    </ThemedText>
                    <Badge
                      label={isPinConfigured ? 'PIN Protected' : 'Online TV'}
                      variant={isPinConfigured ? 'success' : 'neutral'}
                    />
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.urlSubtitle}>
                    For waiting room TVs and monitors connected to the internet. Requires the 6-digit PIN to unlock.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.urlBadge}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} numberOfLines={1}>
                  {publicCloudTvUrl || 'Portal display link will appear once facility is configured.'}
                </ThemedText>
              </View>

              <View style={styles.actionRow}>
                <Button
                  title="Open Portal Display"
                  variant="secondary"
                  icon="maximize"
                  disabled={!publicCloudTvUrl}
                  onPress={() => publicCloudTvUrl && openUrl(publicCloudTvUrl)}
                />
                <Button
                  title={copiedCloud ? 'Copied' : 'Copy Portal Link'}
                  variant="outline"
                  icon="copy"
                  disabled={!publicCloudTvUrl}
                  onPress={() => publicCloudTvUrl && copyToClipboard(publicCloudTvUrl, 'cloud')}
                />
              </View>
            </View>

            {/* 2. Local LAN TV Display URL Card */}
            <View style={styles.urlCard}>
              <View style={styles.urlHeader}>
                <View style={styles.iconWrapLan}>
                  <Icon name="monitor" size={theme.sizes.iconMd} color={theme.colors.primaryDark} />
                </View>
                <View style={styles.urlInfo}>
                  <View style={styles.cardTitleBadgeRow}>
                    <ThemedText variant="bodyBold" color={theme.colors.text}>
                      Local Network (LAN) TV Display Link
                    </ThemedText>
                    <Badge
                      label={isPinConfigured ? 'PIN Protected' : 'Local Wi-Fi'}
                      variant={isPinConfigured ? 'success' : 'primary'}
                    />
                  </View>
                  <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.urlSubtitle}>
                    For waiting room TVs connected to your clinic&apos;s Wi-Fi. Works even during internet outages. Requires the 6-digit PIN to unlock.
                  </ThemedText>
                </View>
              </View>

              <View style={styles.urlBadge}>
                <ThemedText variant="captionBold" color={theme.colors.textSecondary} numberOfLines={1}>
                  {localLanUrl}
                </ThemedText>
              </View>

              <View style={styles.actionRow}>
                <Button
                  title="Open LAN Display"
                  variant="primary"
                  icon="maximize"
                  onPress={() => openUrl(localLanUrl)}
                />
                <Button
                  title={copiedLan ? 'Copied' : 'Copy LAN Link'}
                  variant="outline"
                  icon="copy"
                  onPress={() => copyToClipboard(localLanUrl, 'lan')}
                />
              </View>
            </View>
          </View>
        )}
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  toggleInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  toggleSubtitle: {
    lineHeight: theme.spacing.lg,
  },
  pinCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  iconWrapPin: {
    width: theme.sizes.iconLg,
    height: theme.sizes.iconLg,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinInputRow: {
    gap: theme.spacing.sm,
  },
  pinInputContainer: {
    maxWidth: 420,
  },
  pinActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
  },
  urlCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  urlHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  iconWrapLan: {
    width: theme.sizes.iconLg,
    height: theme.sizes.iconLg,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapCloud: {
    width: theme.sizes.iconLg,
    height: theme.sizes.iconLg,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.surfaceSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  urlInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  cardTitleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  urlSubtitle: {
    lineHeight: theme.spacing.md,
  },
  urlBadge: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  soundCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.md,
  },
  iconWrapSound: {
    width: theme.sizes.iconLg,
    height: theme.sizes.iconLg,
    borderRadius: theme.radii.sm,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  themeOptionCard: {
    flex: 1,
    minWidth: 200,
    padding: theme.spacing.sm,
    borderRadius: theme.radii.sm,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.spacing.xs,
  },
  themeOptionCardSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySubtle,
  },
  themeOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.xs,
  },
  themePreviewRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 2,
  },
  voiceCard: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  voiceActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    flexWrap: 'wrap',
    paddingTop: theme.spacing.xs,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.borderLight,
  },
});
