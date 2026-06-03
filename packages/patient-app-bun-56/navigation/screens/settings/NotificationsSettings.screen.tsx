import { ScrollView } from 'react-native';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';

export default function NotificationsSettingsScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: 16, gap: 0 }}
    >
      <SettingsSection
        title="Push Notifications"
        footer="Push notification support is coming in a future update."
      >
        <SettingsRow
          title="Enable Push Notifications"
          icon={{ android: 'notifications', ios: 'bell.fill' }}
          iconColor="#F59E0B"
          right={{ type: 'switch', value: false, onValueChange: () => {}, disabled: true }}
          disabled
          subtitle="Coming soon"
        />
      </SettingsSection>

      <SettingsSection
        title="Reminders"
        footer="Appointment and health reminders will be configurable here."
      >
        <SettingsRow
          title="Appointment Reminders"
          icon={{ android: 'event', ios: 'calendar.badge.clock' }}
          iconColor="#3B82F6"
          right={{ type: 'switch', value: false, onValueChange: () => {}, disabled: true }}
          disabled
          subtitle="Coming soon"
        />
        <SettingsRow
          title="Medication Reminders"
          icon={{ android: 'medication', ios: 'pills.fill' }}
          iconColor="#10B981"
          right={{ type: 'switch', value: false, onValueChange: () => {}, disabled: true }}
          disabled
          subtitle="Coming soon"
        />
      </SettingsSection>

      <SettingsSection title="Clinic Updates">
        <SettingsRow
          title="Clinic Announcements"
          icon={{ android: 'campaign', ios: 'megaphone.fill' }}
          iconColor="#8B5CF6"
          right={{ type: 'switch', value: false, onValueChange: () => {}, disabled: true }}
          disabled
          subtitle="Coming soon"
        />
        <SettingsRow
          title="New Messages"
          icon={{ android: 'chat', ios: 'message.fill' }}
          iconColor="#EC4899"
          right={{ type: 'switch', value: false, onValueChange: () => {}, disabled: true }}
          disabled
          subtitle="Coming soon"
        />
      </SettingsSection>
    </ScrollView>
  );
}
