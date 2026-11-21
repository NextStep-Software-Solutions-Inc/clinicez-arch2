import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';
import { AppIcon } from '@ui/Icon';
import ThemedText from '@ui/ThemedText';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { usePrivacy } from '../../../contexts/PrivacyContext';
import { dialog } from '../../../utils/dialog';

export default function PrivacySettingsScreen() {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const {
    privacyBlurEnabled,
    setPrivacyBlurEnabled,
    showHiddenConversations,
    setShowHiddenConversations,
    hiddenConversationIds,
    clearAllHiddenConversations,
  } = usePrivacy();

  const handleClearHiddenCopies = async () => {
    const ok = await dialog.confirm({
      title: 'Restore Hidden Messages',
      message: 'Bring back all hidden conversations to your inbox?',
      confirmLabel: 'Restore',
    });
    if (ok) {
      await clearAllHiddenConversations();
      setShowHiddenConversations(false);
      dialog.alert('Restored', 'Your hidden conversations are back in your inbox.');
    }
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: spacing.lg,
        maxWidth: sizes.formMaxWidth,
        alignSelf: 'center',
        width: '100%',
      }}
    >
      {/* Screen Privacy */}
      <SettingsSection
        title="Screen Privacy"
        footer="Keeps messages hidden on your screen until you tap them, so people nearby cannot read them."
      >
        <SettingsRow
          title="Privacy Blur"
          subtitle="Tap or hold to reveal messages"
          icon={{ android: 'visibility_off', ios: 'eye.slash.fill' }}
          iconColor={colors.primary}
          right={{
            type: 'switch',
            value: privacyBlurEnabled,
            onValueChange: setPrivacyBlurEnabled,
          }}
        />
      </SettingsSection>

      {/* Hidden Messages */}
      <SettingsSection
        title="Hidden Messages"
        footer={
          hiddenConversationIds.size > 0
            ? `You have ${hiddenConversationIds.size} hidden conversation${hiddenConversationIds.size > 1 ? 's' : ''}. Hiding a message only removes it from this phone — your clinic still has their copy on file.`
            : 'Hiding a conversation only removes it from this phone. Your clinic still has their copy on file.'
        }
      >
        <SettingsRow
          title="Show Hidden Messages"
          subtitle="Display messages you previously hid"
          icon={{ android: 'visibility', ios: 'eye.fill' }}
          iconColor={colors.primary}
          right={{
            type: 'switch',
            value: showHiddenConversations,
            onValueChange: setShowHiddenConversations,
          }}
        />
        {hiddenConversationIds.size > 0 && (
          <SettingsRow
            title="Restore Hidden Messages"
            subtitle={`Bring back ${hiddenConversationIds.size} hidden conversation${hiddenConversationIds.size > 1 ? 's' : ''}`}
            icon={{ android: 'unarchive', ios: 'arrow.uturn.backward.circle.fill' }}
            iconColor={colors.purple}
            right={{ type: 'none' }}
            onPress={handleClearHiddenCopies}
          />
        )}
      </SettingsSection>

      {/* Privacy Protection */}
      <View
        style={[
          styles.noticeCard,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.borderLight,
            borderRadius: radii.md,
            padding: spacing.lg,
            gap: spacing.sm,
          },
        ]}
      >
        <View style={styles.noticeHeader}>
          <AppIcon android="shield" ios="checkmark.shield.fill" size={18} color="primary" />
          <ThemedText variant="captionBold" color="primaryText">
            YOUR PRIVACY IS PROTECTED
          </ThemedText>
        </View>
        <ThemedText variant="small" color="textSecondary" style={{ lineHeight: 20 }}>
          Your health information and conversations are always private and protected. When you hide a conversation, it is only removed from this device — your doctor and healthcare team still keep their official copy for your care.
        </ThemedText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  noticeCard: {
    borderWidth: 1,
  },
  noticeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
