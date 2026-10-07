import React, { forwardRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import type { SelectOption } from './ProfileSelectModal';
import ThemedBottomSheetModal, { type WebBottomSheetModalRef } from '@ui/ThemedBottomSheetModal';
import { useAppTheme } from '../../contexts/ThemeContext';

export interface ProfileBottomSheetSelectProps {
  title: string;
  options: SelectOption[];
  selected: string | undefined | null;
  onSelect: (value: string) => void;
}

export type ProfileBottomSheetSelectRef = WebBottomSheetModalRef;

const ProfileBottomSheetSelect = forwardRef<WebBottomSheetModalRef, ProfileBottomSheetSelectProps>(
  ({ title, options, selected, onSelect }, ref) => {
    const { colors, radii, sizes, spacing } = useAppTheme();
    const [query, setQuery] = useState('');

    const filtered = query.trim()
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(query.toLowerCase()) ||
            o.value.toLowerCase().includes(query.toLowerCase())
        )
      : options;

    const handleSelect = (value: string) => {
      onSelect(value);
      if (ref && 'current' in ref && ref.current) {
        ref.current.dismiss();
      }
    };

    return (
      <ThemedBottomSheetModal ref={ref}>
        <View style={styles.header}>
          <ThemedText variant="h2">{title}</ThemedText>
        </View>

        <View style={[styles.searchContainer, { borderColor: colors.borderLight }]}>
          <TextInput
            placeholder="Search…"
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            style={[
              styles.searchInput,
              {
                color: colors.text,
                backgroundColor: colors.background,
                borderColor: colors.border,
                borderRadius: radii.sm,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
              },
            ]}
          />
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => {
            const isSelected = item.value === selected;
            return (
              <Pressable
                onPress={() => handleSelect(item.value)}
                style={({ pressed, hovered }: any) => [
                  styles.option,
                  { borderBottomColor: colors.borderLight },
                  hovered && { backgroundColor: colors.surfaceSubtle },
                  pressed && { opacity: 0.6 },
                  isSelected && { backgroundColor: colors.primarySubtle },
                ]}
              >
                <ThemedText
                  variant={isSelected ? 'bodyBold' : 'body'}
                  style={{ color: isSelected ? colors.primary : colors.text }}
                >
                  {item.label}
                </ThemedText>
                {isSelected && (
                  <AppIcon name="check" size={sizes.iconSm} color="primary" />
                )}
              </Pressable>
            );
          }}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          style={styles.list}
        />
      </ThemedBottomSheetModal>
    );
  }
);

ProfileBottomSheetSelect.displayName = 'ProfileBottomSheetSelect';

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    borderWidth: 1,
    minHeight: 40,
  },
  list: {
    maxHeight: 400,
  },
  listContent: {
    paddingBottom: 24,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});

export default ProfileBottomSheetSelect;
