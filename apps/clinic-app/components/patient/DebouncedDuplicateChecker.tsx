import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import ThemedText from '../ui/ThemedText';
import { IconSlot } from '../ui/Icon';
import Badge from '../ui/Badge';
import { theme } from '../../constants/theme';
import { clinicService, DuplicateMatch } from '../../services/clinicService';

export interface DebouncedDuplicateCheckerProps {
  philHealthNumber?: string;
  contactNumber?: string;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  debounceMs?: number; // default: 400ms
  onSelectExistingPatient?: (patientId: string, match?: DuplicateMatch) => void;
  onSelectDuplicate?: (patientId: string) => void;
  onDuplicatesFound?: (hasDuplicates: boolean, matches: DuplicateMatch[]) => void;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export default function DebouncedDuplicateChecker({
  philHealthNumber,
  contactNumber,
  firstName,
  lastName,
  dateOfBirth,
  debounceMs = 400,
  onSelectExistingPatient,
  onSelectDuplicate,
  onDuplicatesFound,
  containerStyle,
  testID = 'debounced-duplicate-checker',
}: DebouncedDuplicateCheckerProps) {
  const [checking, setChecking] = useState(false);
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const sequenceRef = useRef(0);

  const handleSelect = (patientId: string, item: DuplicateMatch) => {
    onSelectExistingPatient?.(patientId, item);
    onSelectDuplicate?.(patientId);
  };

  useEffect(() => {
    const rawPin = (philHealthNumber || '').replace(/\D/g, '');
    const rawContact = (contactNumber || '').replace(/\D/g, '');
    const fn = (firstName || '').trim();
    const ln = (lastName || '').trim();
    const dob = (dateOfBirth || '').trim();

    // Verification thresholds to avoid querying prematurely on single characters
    const hasSufficientPin = rawPin.length >= 10;
    const hasSufficientContact = rawContact.length >= 7;
    const hasSufficientNameDob = fn.length >= 2 && ln.length >= 2 && dob.length >= 8;

    if (!hasSufficientPin && !hasSufficientContact && !hasSufficientNameDob) {
      sequenceRef.current += 1;
      setChecking(false);
      setMatches([]);
      onDuplicatesFound?.(false, []);
      return undefined;
    }

    setChecking(true);
    const ticket = ++sequenceRef.current;

    const timer = setTimeout(async () => {
      try {
        const [result, err] = await clinicService.checkPatientDuplicates({
          philHealthNumber: rawPin.length >= 10 ? philHealthNumber?.trim() : undefined,
          contactNumber: rawContact.length >= 7 ? contactNumber?.trim() : undefined,
          firstName: hasSufficientNameDob ? fn : undefined,
          lastName: hasSufficientNameDob ? ln : undefined,
          dateOfBirth: hasSufficientNameDob ? dob : undefined,
        });

        // Abort if another input arrived in the meantime
        if (ticket !== sequenceRef.current) return;

        setChecking(false);
        if (result && result.hasDuplicates) {
          setMatches(result.matches);
          setCollapsed(false);
          onDuplicatesFound?.(true, result.matches);
        } else {
          setMatches([]);
          onDuplicatesFound?.(false, []);
        }
      } catch {
        if (ticket !== sequenceRef.current) return;
        setChecking(false);
      }
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [philHealthNumber, contactNumber, firstName, lastName, dateOfBirth, debounceMs, onDuplicatesFound]);

  if (checking && matches.length === 0) {
    return (
      <View style={[styles.loadingRow, containerStyle]} testID={`${testID}-loading`}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <ThemedText variant="caption" color={theme.colors.textMuted}>
          Scanning directory for existing patient records...
        </ThemedText>
      </View>
    );
  }

  if (matches.length === 0) {
    return null;
  }

  return (
    <View style={[styles.bannerContainer, containerStyle]} testID={testID}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.titleGroup}>
          <IconSlot value="alert" size={theme.sizes.iconMd} color={theme.colors.warning} />
          <ThemedText variant="smallBold" color={theme.colors.warningText}>
            Possible Duplicate Record ({matches.length})
          </ThemedText>
          {checking ? <ActivityIndicator size="small" color={theme.colors.warning} style={styles.inlineSpinner} /> : null}
        </View>

        <Pressable
          onPress={() => setCollapsed(!collapsed)}
          style={styles.collapseToggle}
          hitSlop={theme.spacing.sm}
        >
          <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
            {collapsed ? 'Show' : 'Hide'}
          </ThemedText>
        </Pressable>
      </View>

      {/* Matched Records */}
      {!collapsed ? (
        <View style={styles.matchesList}>
          {matches.map((item) => (
            <View key={item.patientId} style={styles.matchCard}>
              <View style={styles.matchInfo}>
                <View style={styles.patientNameRow}>
                  <ThemedText variant="bodyBold" color={theme.colors.text}>
                    {item.fullName}
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textSecondary}>
                    ({item.patientCode})
                  </ThemedText>
                </View>

                <ThemedText variant="caption" color={theme.colors.textMuted}>
                  DOB: {item.dateOfBirth}
                  {item.contactNumber ? ` • Phone: ${item.contactNumber}` : ''}
                  {item.philHealthNumber ? ` • PIN: ${item.philHealthNumber}` : ''}
                </ThemedText>

                <View style={styles.badgeRow}>
                  <Badge
                    label={item.matchReason}
                    variant="warning"
                    size="sm"
                    icon="alertCircle"
                  />
                </View>
              </View>

              {/* Action shortcut to open existing patient */}
              <Pressable
                style={styles.viewPatientBtn}
                onPress={() => handleSelect(item.patientId, item)}
                testID={`view-existing-patient-${item.patientId}`}
              >
                <IconSlot value="eye" size={theme.sizes.iconSm} color={theme.colors.primary} />
                <ThemedText variant="smallBold" color={theme.colors.primary}>
                  View Chart
                </ThemedText>
                <IconSlot value="arrowRight" size={theme.sizes.iconSm} color={theme.colors.primary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  inlineSpinner: {
    marginLeft: theme.spacing.xs,
  },
  bannerContainer: {
    backgroundColor: theme.colors.warningBg,
    borderColor: theme.colors.warningBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
    marginVertical: theme.spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  collapseToggle: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  matchesList: {
    gap: theme.spacing.sm,
  },
  matchCard: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.borderDark,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  matchInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  patientNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  badgeRow: {
    marginTop: theme.spacing.xs,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  viewPatientBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    backgroundColor: theme.colors.primaryLight,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.radii.sm,
  },
});
