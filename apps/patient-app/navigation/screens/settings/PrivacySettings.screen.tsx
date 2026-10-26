import React from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Screen from '../../../components/layout/Screen';
import Card from '../../../components/ui/Card';
import Button from '../../../components/ui/Button';
import { AppIcon } from '../../../components/ui/Icon';
import IconButton from '../../../components/ui/IconButton';
import ThemedText from '../../../components/ui/ThemedText';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { usePrivacy } from '../../../contexts/PrivacyContext';
import { dialog } from '../../../utils/dialog';

export default function PrivacySettingsScreen() {
  const { colors, spacing, radii } = useAppTheme();
  const navigation = useNavigation<any>();
  const {
    privacyBlurEnabled,
    setPrivacyBlurEnabled,
    showHiddenConversations,
    setShowHiddenConversations,
    hiddenConversationIds,
  } = usePrivacy();

  const handleClearHiddenCopies = async () => {
    const ok = await dialog.confirm({
      title: 'Restore Hidden Copies',
      message: 'Do you want to restore all hidden conversation copies to your active inbox view?',
      confirmLabel: 'Restore',
    });
    if (ok) {
      setShowHiddenConversations(false);
      dialog.alert('Restored', 'Hidden conversation copies are now visible in your inbox.');
    }
  };

  return (
    <Screen width="form" contentContainerStyle={{ gap: spacing.lg }}>
      {/* Header */}
      <View style={styles.headerRow}>
        <IconButton
          icon="back"
          accessibilityLabel="Back to Settings"
          hitSize={44}
          onPress={() => navigation.goBack()}
        />
        <View style={styles.headerText}>
          <ThemedText variant="h2">Privacy & Communications</ThemedText>
          <ThemedText variant="small" color="textMuted">
            Manage message privacy, blur mode, and local copies
          </ThemedText>
        </View>
      </View>

      {/* Setting 1: Privacy Blur Mode */}
      <Card padding="lg" style={{ gap: spacing.md }}>
        <View style={styles.settingItem}>
          <View style={styles.settingTextGroup}>
            <View style={styles.iconTitleRow}>
              <AppIcon name="eye" size={20} color="primary" />
              <ThemedText variant="bodyBold">Privacy Blur Mode</ThemedText>
            </View>
            <ThemedText variant="small" color="textSecondary">
              Blurs message previews, thread content, and attachments until tapped or held. Prevents shoulder surfing in public places.
            </ThemedText>
          </View>
          <Switch
            value={privacyBlurEnabled}
            onValueChange={setPrivacyBlurEnabled}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>
      </Card>

      {/* Setting 2: Show Hidden Conversations */}
      <Card padding="lg" style={{ gap: spacing.md }}>
        <View style={styles.settingItem}>
          <View style={styles.settingTextGroup}>
            <View style={styles.iconTitleRow}>
              <AppIcon name="eyeOff" size={20} color="primary" />
              <ThemedText variant="bodyBold">Show Hidden Conversations</ThemedText>
            </View>
            <ThemedText variant="small" color="textSecondary">
              Display conversations you previously hid via "Hide My Copy" in your inbox.
            </ThemedText>
          </View>
          <Switch
            value={showHiddenConversations}
            onValueChange={setShowHiddenConversations}
            trackColor={{ false: colors.border, true: colors.primary }}
          />
        </View>

        {hiddenConversationIds.size > 0 && (
          <View style={[styles.subAction, { borderTopColor: colors.border, paddingTop: spacing.md }]}>
            <ThemedText variant="caption" color="textMuted">
              You currently have {hiddenConversationIds.size} hidden conversation copy(ies).
            </ThemedText>
            <Button
              label="Restore All Hidden Conversations"
              variant="outline"
              size="sm"
              onPress={handleClearHiddenCopies}
            />
          </View>
        )}
      </Card>

      {/* Legal & Regulatory Notice */}
      <Card
        padding="lg"
        style={[
          styles.noticeCard,
          {
            backgroundColor: colors.surfaceSubtle,
            borderColor: colors.border,
            gap: spacing.sm,
          },
        ]}
      >
        <View style={styles.iconTitleRow}>
          <AppIcon name="shield" size={20} color="primary" />
          <ThemedText variant="smallBold" color="primaryText">
            DATA PRIVACY ACT OF 2012 (RA 10173)
          </ThemedText>
        </View>
        <ThemedText variant="small" color="textSecondary">
          ClinicEZ complies with statutory data privacy requirements. Your patient communication copies are end-to-end secured. Using "Hide My Copy" only removes your local view and does not alter the healthcare facility's official medical records or audit trails.
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerText: {
    flex: 1,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
  },
  settingTextGroup: {
    flex: 1,
    gap: 4,
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  subAction: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  noticeCard: {
    borderWidth: 1,
  },
});
