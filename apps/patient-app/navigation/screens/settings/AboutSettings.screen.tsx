import React from 'react';
import { ScrollView, Linking } from 'react-native';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { SettingsRow, SettingsSection } from '@ui/SettingsItem';
import { dialog } from '@utils/dialog';

const APP_VERSION = Constants.expoConfig?.version ?? '—';
const BUILD_NUMBER =
  (Constants.expoConfig?.ios?.buildNumber ?? Constants.expoConfig?.android?.versionCode) ?? '—';
const APP_ENV =
  Constants.expoConfig?.extra?.appVariant ??
  (Constants.expoConfig?.extra?.isProduction ? 'production' : 'development');
const GIT_BRANCH = Constants.expoConfig?.extra?.appBranch || 'main';
const CHANNEL =
  Updates.channel ?? Constants.expoConfig?.extra?.channel ?? 'production';
const BUNDLE_ID =
  Constants.expoConfig?.ios?.bundleIdentifier ??
  Constants.expoConfig?.android?.package ??
  'com.nextstepsoftware.clinicez.patient';
const DB_NAME = Constants.expoConfig?.extra?.sqliteDbName ?? 'Clinic EZ_patient.db';

const openUrl = async (url: string) => {
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  } else {
    dialog.alert('Unable to open link', url);
  }
};

const SUPPORT_EMAIL = process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '';

export default function AboutSettingsScreen() {
  const { colors, spacing, sizes } = useAppTheme();

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
      <SettingsSection title="App Info">
        <SettingsRow
          title="Version"
          right={{ type: 'value', label: String(APP_VERSION) }}
        />
        <SettingsRow
          title="Build"
          right={{ type: 'value', label: String(BUILD_NUMBER) }}
        />
        <SettingsRow
          title="Environment"
          right={{ type: 'value', label: String(APP_ENV) }}
        />
        <SettingsRow
          title="Git Branch"
          right={{ type: 'value', label: String(GIT_BRANCH) }}
        />
        <SettingsRow
          title="Release Channel"
          right={{ type: 'value', label: String(CHANNEL) }}
        />
        <SettingsRow
          title="Package / Bundle ID"
          right={{ type: 'value', label: String(BUNDLE_ID) }}
        />
        <SettingsRow
          title="Database"
          right={{ type: 'value', label: String(DB_NAME) }}
        />
      </SettingsSection>

      <SettingsSection title="Publisher">
        <SettingsRow title="Product" right={{ type: 'value', label: 'Clinic EZ' }} />
        <SettingsRow title="Company" right={{ type: 'value', label: 'Nextstep Software Corporation' }} />
      </SettingsSection>

      <SettingsSection title="Legal">
        <SettingsRow
          title="Privacy Policy"
          icon={{ android: 'privacy_tip', ios: 'hand.raised.fill' }}
          iconColor={colors.primary}
          right={{ type: 'chevron' }}
          onPress={() => openUrl('https://portal.clinicez.com/privacy')}
        />
        <SettingsRow
          title="Terms of Service"
          icon={{ android: 'description', ios: 'doc.text.fill' }}
          iconColor={colors.textMuted}
          right={{ type: 'chevron' }}
          onPress={() => openUrl('https://portal.clinicez.com/terms')}
        />
      </SettingsSection>

      <SettingsSection title="Support">
        <SettingsRow
          title="Contact Support"
          icon={{ android: 'support_agent', ios: 'person.fill.questionmark' }}
          iconColor={colors.success}
          right={{ type: 'chevron' }}
          onPress={() => SUPPORT_EMAIL && openUrl(`mailto:${SUPPORT_EMAIL}?subject=Clinic%20EZ%20Support`)}
        />
        <SettingsRow
          title="Report a Bug"
          icon={{ android: 'bug_report', ios: 'ant.fill' }}
          iconColor={colors.emergency}
          right={{ type: 'chevron' }}
          onPress={() =>
            openUrl(
              `mailto:${SUPPORT_EMAIL}?subject=Bug%20Report%20v${APP_VERSION}&body=Describe%20the%20issue%3A%0A%0ASteps%20to%20reproduce%3A%0A%0AExpected%20behavior%3A`,
            )
          }
        />
      </SettingsSection>
    </ScrollView>
  );
}
