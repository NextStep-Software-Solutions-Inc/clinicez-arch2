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
      title: 'Restore Hidden Copies',
      message: 'Do you want to restore all hidden conversation copies to your active inbox view?',
      confirmLabel: 'Restore',
    });
    if (ok) {
      await clearAllHiddenConversations();
      setShowHiddenConversations(false);
      dialog.alert('Restored', 'Hidden conversation copies are now visible in your inbox.');
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
      {/* Message Privacy */}
      <SettingsSection
        title="Message Privacy"
        footer="Privacy blur obscures message previews, thread content, and attachments until tapped or held. Prevents shoulder surfing in public places."
      >
        <SettingsRow
          title="Privacy Blur Mode"
          subtitle="Blur message previews & media until tapped"
          icon={{ android: 'visibility_off', ios: 'eye.slash.fill' }}
          iconColor={colors.primary}
          right={{
            type: 'switch',
            value: privacyBlurEnabled,
            onValueChange: setPrivacyBlurEnabled,
          }}
        />
      </SettingsSection>

      {/* Conversation Copies */}
      <SettingsSection
        title="Conversation Copies"
        footer={
          hiddenConversationIds.size > 0
            ? `You currently have ${hiddenConversationIds.size} hidden conversation copy(ies). Using "Hide My Copy" removes the conversation from your active inbox view on this device.`
            : 'Using "Hide My Copy" removes the conversation from your active inbox view on this device without deleting official facility records.'
        }
      >
        <SettingsRow
          title="Show Hidden Conversations"
          subtitle="Display conversations hidden via 'Hide My Copy'"
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
            title="Restore All Hidden Conversations"
            subtitle={`Restore ${hiddenConversationIds.size} hidden conversation copy(ies) to inbox`}
            icon={{ android: 'unarchive', ios: 'arrow.uturn.backward.circle.fill' }}
            iconColor={colors.purple}
            right={{ type: 'none' }}
            onPress={handleClearHiddenCopies}
          />
        )}
      </SettingsSection>

      {/* Statutory Data Privacy Notice */}
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
            DATA PRIVACY ACT OF 2012 (RA 10173)
          </ThemedText>
        </View>
        <ThemedText variant="small" color="textSecondary" style={{ lineHeight: 20 }}>
          ClinicEZ complies with statutory data privacy requirements. Your patient communication copies are end-to-end secured. Using &ldquo;Hide My Copy&rdquo; only removes your local view and does not alter the healthcare facility&apos;s official medical records or audit trails.
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
