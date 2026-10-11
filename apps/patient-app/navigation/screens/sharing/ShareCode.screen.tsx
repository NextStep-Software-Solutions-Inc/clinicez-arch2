import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import ThemedText from '@ui/ThemedText';
import Card from '@ui/Card';
import Badge from '@ui/Badge';
import Button from '@ui/Button';
import { SectionHeader } from '@ui/Primitives';
import { dialog } from '@utils/dialog';
import Screen from 'components/layout/Screen';
import ProfileToggle from 'components/profile/ProfileToggle';
import { useAppTheme } from 'contexts/ThemeContext';
import { usePatientId } from 'hooks/usePatientId';
import { useShareCode } from 'hooks/useShareCode';
import type { SharingScope } from 'services/api/wireEnums';
import {
  SHARING_SCOPES,
  countSelectedScopes,
  defaultScopeSelection,
  scopeLabel,
  toApiScopes,
  type ScopeSelection,
} from 'services/sharing/scopes';
import { formatCountdown } from 'services/sharing/shareCode';

export default function ShareCodeScreen() {
  const patientId = usePatientId();
  const { colors, spacing } = useAppTheme();
  const [selection, setSelection] = useState<ScopeSelection>(defaultScopeSelection);

  const scopes = toApiScopes(selection);
  const { code, secondsLeft, expired, error, isGenerating, generate } = useShareCode(patientId, scopes);

  const toggleScope = useCallback((scope: SharingScope, enabled: boolean) => {
    setSelection((current) => ({ ...current, [scope]: enabled }));
  }, []);

  const copy = async (value: string, subject: string) => {
    await Clipboard.setStringAsync(value);
    dialog.alert('Copied', `${subject} was copied to the clipboard.`);
  };

  return (
    <Screen width="form" contentContainerStyle={{ gap: spacing.lg }}>
      {code ? (
        <Card style={{ gap: spacing.md }}>
          <ThemedText variant="captionBold" color="textMuted">
            YOUR ONE-TIME CODE
          </ThemedText>
          <ThemedText
            variant="display"
            selectable
            numberOfLines={1}
            adjustsFontSizeToFit
            style={styles.code}
            accessibilityLabel={`Share code ${code.code.split('').join(' ')}`}
          >
            {code.code}
          </ThemedText>
          <ThemedText variant="bodyBold" style={{ color: colors.warningText }}>
            Expires in {formatCountdown(secondsLeft)}
          </ThemedText>
          <ThemedText variant="small" color="textMuted">
            Single use. Read it to the clinic staff; once they enter it, it stops working.
          </ThemedText>
          <View style={[styles.row, { gap: spacing.xs }]}>
            {code.scopes.map((scope) => (
              <Badge key={scope} label={scopeLabel(scope)} tone="info" size="sm" />
            ))}
          </View>
          <Button label="Copy code" icon="copy" variant="outline" onPress={() => copy(code.code, 'The code')} />
          <View style={[styles.row, styles.idRow, { gap: spacing.md }]}>
            <View style={styles.flex}>
              <ThemedText variant="captionBold" color="textMuted">
                YOUR CLINICEZ ID
              </ThemedText>
              <ThemedText variant="h3" selectable>
                {code.clinicEzId}
              </ThemedText>
            </View>
            <Button
              label="Copy"
              icon="copy"
              variant="outline"
              size="sm"
              onPress={() => copy(code.clinicEzId, 'Your ClinicEZ ID')}
            />
          </View>
        </Card>
      ) : (
        <>
          {expired ? (
            <Card padding="sm">
              <ThemedText variant="bodyBold">The code expired</ThemedText>
              <ThemedText variant="small" color="textMuted">
                For your safety it was removed from the screen. Generate a new code when you are ready.
              </ThemedText>
            </Card>
          ) : null}
          {error ? (
            <Card padding="sm">
              <ThemedText variant="small" style={{ color: colors.warningText }}>
                {error}
              </ThemedText>
            </Card>
          ) : null}

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
            label={expired ? 'Generate new code' : 'Generate code'}
            icon="key"
            fullWidth
            loading={isGenerating}
            disabled={scopes.length === 0}
            onPress={generate}
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap' },
  idRow: { alignItems: 'center', justifyContent: 'space-between' },
  code: { fontFamily: 'monospace', letterSpacing: 4, textAlign: 'center' },
});
