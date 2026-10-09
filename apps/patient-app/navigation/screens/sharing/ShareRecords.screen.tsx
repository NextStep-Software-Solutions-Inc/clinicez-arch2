import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Button from '@ui/Button';
import { SectionHeader } from '@ui/Primitives';
import { dialog } from '@utils/dialog';
import Screen from 'components/layout/Screen';
import ProfileToggle from 'components/profile/ProfileToggle';
import RedemptionPicker from 'components/sharing/RedemptionPicker';
import RotatingQr from 'components/sharing/RotatingQr';
import { useAppTheme } from 'contexts/ThemeContext';
import { usePatientId } from 'hooks/usePatientId';
import { useShareQr } from 'hooks/useShareQr';
import type { SharingScope } from 'services/api/wireEnums';
import { DEFAULT_SHARE_REDEMPTIONS, type ShareRedemptions } from 'services/sharing/redemptions';
import {
  SHARING_SCOPES,
  countSelectedScopes,
  defaultScopeSelection,
  toApiScopes,
  type ScopeSelection,
} from 'services/sharing/scopes';

export default function ShareRecordsScreen() {
  const patientId = usePatientId();
  const navigation = useNavigation();
  const { spacing } = useAppTheme();
  const [selection, setSelection] = useState<ScopeSelection>(defaultScopeSelection);
  const [maxRedemptions, setMaxRedemptions] = useState<ShareRedemptions>(DEFAULT_SHARE_REDEMPTIONS);

  const scopes = toApiScopes(selection);
  const qr = useShareQr(patientId, scopes, maxRedemptions);
  const clinicEzId = qr.session?.token.clinicEzId ?? null;

  const toggleScope = useCallback((scope: SharingScope, enabled: boolean) => {
    setSelection((current) => ({ ...current, [scope]: enabled }));
  }, []);

  const copyClinicEzId = async () => {
    if (!clinicEzId) return;
    await Clipboard.setStringAsync(clinicEzId);
    dialog.alert('Copied', 'Your ClinicEZ ID was copied to the clipboard.');
  };

  return (
    <Screen width="form" contentContainerStyle={{ gap: spacing.lg }}>
      <Card>
        <RotatingQr state={qr} hasScopes={scopes.length > 0} />
      </Card>

      <Card padding="sm" style={styles.idCard}>
        <View style={styles.idText}>
          <ThemedText variant="captionBold" color="textMuted">
            YOUR CLINICEZ ID
          </ThemedText>
          <ThemedText variant="h3" selectable>
            {clinicEzId ?? '—'}
          </ThemedText>
          <ThemedText variant="small" color="textMuted">
            Give this ID to staff if they cannot scan your code.
          </ThemedText>
        </View>
        <Button label="Copy" icon="copy" variant="outline" size="sm" disabled={!clinicEzId} onPress={copyClinicEzId} />
      </Card>

      <RedemptionPicker value={maxRedemptions} onChange={setMaxRedemptions} />

      <View>
        <SectionHeader
          title="What to share"
          subtitle={`${countSelectedScopes(selection)} of ${SHARING_SCOPES.length} selected. The code only releases what is switched on.`}
        />
        <View style={{ gap: spacing.sm }}>
          {SHARING_SCOPES.map((scope) => (
            <ProfileToggle
              key={scope.key}
              label={scope.label}
              description={scope.description}
              value={selection[scope.key]}
              onValueChange={(enabled) => toggleScope(scope.key, enabled)}
            />
          ))}
        </View>
      </View>

      <Button
        label="Can't scan? Share by code"
        icon="key"
        variant="outline"
        fullWidth
        onPress={() => navigation.navigate('Main', { screen: 'ShareCodeScreen' })}
      />

      <Button
        label="Manage access and activity"
        icon="shield"
        variant="secondary"
        fullWidth
        onPress={() => navigation.navigate('Main', { screen: 'AccessGrantsScreen' })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  idCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  idText: { flex: 1 },
});
