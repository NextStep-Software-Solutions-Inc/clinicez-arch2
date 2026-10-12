import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import ThemedText from './ThemedText';
import Input from './Input';
import Badge from './Badge';
import Icon from './Icon';
import { theme } from '../../constants/theme';
import { clinicService, type Icd10Code } from '../../services/clinicService';

export interface Icd10AutocompleteInputProps {
  selectedCode: string;
  selectedTitle: string;
  onSelect: (code: string, description: string) => void;
  onClear?: () => void;
  onTitleChange?: (title: string) => void;
  error?: string;
  required?: boolean;
  label?: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Icd10AutocompleteInput({
  selectedCode,
  selectedTitle,
  onSelect,
  onClear,
  onTitleChange,
  error,
  required = true,
  label = 'PhilHealth ICD-10 Diagnosis *',
  disabled = false,
  containerStyle,
  testID = 'icd10-autocomplete-input',
}: Icd10AutocompleteInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Icd10Code[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const searchSeqRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setNotice(null);
      return;
    }

    setLoading(true);
    setNotice(null);
    const seq = ++searchSeqRef.current;

    const timer = setTimeout(async () => {
      try {
        const [data, err] = await clinicService.searchIcd10(trimmed);
        if (seq !== searchSeqRef.current) return;

        if (!err && data) {
          setResults(data);
          if (data.length === 0) {
            setNotice('No matching codes in the PhilHealth ICD-10 catalog.');
          } else {
            setNotice(null);
          }
        } else {
          setResults([]);
          setNotice('The PhilHealth ICD-10 catalog is unreachable.');
        }
      } catch {
        if (seq !== searchSeqRef.current) return;
        setResults([]);
        setNotice('The PhilHealth ICD-10 catalog is unreachable.');
      } finally {
        if (seq === searchSeqRef.current) {
          setLoading(false);
        }
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectItem = (item: Icd10Code) => {
    onSelect(item.code, item.description);
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setNotice(null);
  };

  const handleClearSelection = () => {
    onClear?.();
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setNotice(null);
  };

  const hasSelectedCode = Boolean(selectedCode && selectedCode.trim());

  return (
    <View style={[styles.container, containerStyle]} testID={testID}>
      {hasSelectedCode ? (
        <View style={styles.selectedWrapper}>
          <ThemedText variant="captionBold" color={theme.colors.textSecondary} style={styles.label}>
            Selected ICD-10 Diagnosis {required ? <ThemedText color={theme.colors.emergency}> *</ThemedText> : null}
          </ThemedText>

          {/* Active Diagnosis Card / Chip */}
          <View style={styles.selectedCard}>
            <View style={styles.selectedCardHeader}>
              <View style={styles.selectedBadgeRow}>
                <Badge label={selectedCode} variant="routine" size="md" />
                <ThemedText variant="captionBold" color={theme.colors.primaryDark}>
                  PhilHealth Standard
                </ThemedText>
              </View>

              {!disabled ? (
                <Pressable
                  onPress={handleClearSelection}
                  style={styles.changeBtn}
                  hitSlop={theme.spacing.xs}
                  accessibilityLabel="Change or clear diagnosis"
                >
                  <Icon name="close" size={theme.sizes.iconSm} color={theme.colors.textMuted} />
                  <ThemedText variant="captionBold" color={theme.colors.primary}>
                    Change
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>

            <ThemedText variant="small" color={theme.colors.textSecondary} style={styles.selectedStandardDesc}>
              {selectedTitle || selectedCode}
            </ThemedText>
          </View>

          {/* Refine title / clinical specialization */}
          <View style={styles.titleRefineContainer}>
            <Input
              label="Problem Title / Clinical Specialization *"
              value={selectedTitle}
              onChangeText={onTitleChange}
              placeholder="e.g. Essential (primary) hypertension, stage 2"
              editable={!disabled}
              helperText="You can refine the title for clinical specialization while retaining the standard ICD-10 code."
            />
          </View>
        </View>
      ) : (
        <View style={styles.searchSection}>
          <Input
            label={label}
            required={required}
            leftIcon="search"
            placeholder="Type code or diagnosis (e.g. I10, diabetes, asthma)"
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
            error={error}
            editable={!disabled}
            helperText="Enter at least 2 characters to search the PhilHealth lib_icd catalog."
          />

          {isOpen && (query.trim().length >= 2 || loading || notice || results.length > 0) ? (
            <View style={styles.dropdownContainer}>
              {loading ? (
                <View style={styles.dropdownStatusRow}>
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Searching PhilHealth ICD-10 catalog…
                  </ThemedText>
                </View>
              ) : null}

              {notice ? (
                <View style={styles.dropdownStatusRow}>
                  <Icon name="alertCircle" size={theme.fontSizes.xs} color={theme.colors.warning} />
                  <ThemedText variant="caption" color={theme.colors.warningText}>
                    {notice}
                  </ThemedText>
                </View>
              ) : null}

              {!loading && results.length > 0 ? (
                <ScrollView
                  style={styles.resultsScroll}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                >
                  {results.map((item) => (
                    <Pressable
                      key={item.code}
                      style={({ pressed }) => [
                        styles.resultItem,
                        pressed && styles.resultItemPressed,
                      ]}
                      onPress={() => handleSelectItem(item)}
                    >
                      <View style={styles.resultItemCodeBadge}>
                        <ThemedText variant="captionBold" color={theme.colors.primary}>
                          {item.code}
                        </ThemedText>
                      </View>
                      <ThemedText variant="small" color={theme.colors.text} style={styles.resultItemDesc}>
                        {item.description}
                      </ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

export default Icd10AutocompleteInput;

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.xs,
  },
  label: {
    marginBottom: 2,
  },
  searchSection: {
    gap: theme.spacing.xs,
    position: 'relative',
    zIndex: 10,
  },
  dropdownContainer: {
    backgroundColor: theme.colors.surface,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.borderDark,
    borderRadius: theme.radii.md,
    maxHeight: 220,
    marginTop: 2,
    overflow: 'hidden',
  },
  dropdownStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  resultsScroll: {
    maxHeight: 180,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: theme.spacing.sm,
  },
  resultItemPressed: {
    backgroundColor: theme.colors.primarySubtle,
  },
  resultItemCodeBadge: {
    backgroundColor: theme.colors.primarySubtle,
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 2,
    borderRadius: theme.radii.sm,
    minWidth: 44,
    alignItems: 'center',
  },
  resultItemDesc: {
    flex: 1,
  },
  selectedWrapper: {
    gap: theme.spacing.sm,
  },
  selectedCard: {
    backgroundColor: theme.colors.primarySubtle,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.primaryBorder,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  selectedCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  changeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.radii.sm,
  },
  selectedStandardDesc: {
    marginTop: 2,
  },
  titleRefineContainer: {
    marginTop: 4,
  },
});
