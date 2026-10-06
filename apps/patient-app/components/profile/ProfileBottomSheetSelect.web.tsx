import React, { forwardRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useTheme } from '@react-navigation/native';
import ThemedText from '@ui/ThemedText';
import type { SelectOption } from './ProfileSelectModal';
import ThemedBottomSheetModal, { type WebBottomSheetModalRef } from '@ui/ThemedBottomSheetModal';

export interface ProfileBottomSheetSelectProps {
  title: string;
  options: SelectOption[];
  selected: string | undefined | null;
  onSelect: (value: string) => void;
}

export type ProfileBottomSheetSelectRef = WebBottomSheetModalRef;

const ProfileBottomSheetSelect = forwardRef<WebBottomSheetModalRef, ProfileBottomSheetSelectProps>(
  ({ title, options, selected, onSelect }, ref) => {
    const { colors } = useTheme();
    const [query, setQuery] = useState('');

    const filtered = query.trim()
      ? options.filter((o) =>
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
          <ThemedText style={[styles.title, { color: colors.text }]}>{title}</ThemedText>
        </View>

        <View style={[styles.searchContainer, { borderColor: colors.border }]}>
          <TextInput
            placeholder="Search…"
            placeholderTextColor={String(colors.text) + '80'}
            value={query}
            onChangeText={setQuery}
            style={[
              styles.searchInput,
              { color: colors.text, backgroundColor: colors.background, borderColor: colors.border },
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
                style={({ pressed }) => [
                  styles.option,
                  { borderBottomColor: colors.border },
                  pressed && { opacity: 0.6 },
                  isSelected && { backgroundColor: String(colors.primary) + '18' },
                ]}
              >
                <ThemedText
                  style={[
                    styles.optionText,
                    { color: isSelected ? colors.primary : colors.text },
                    isSelected && { fontWeight: '600' },
                  ]}
                >
                  {item.label}
                </ThemedText>
                {isSelected && (
                  <ThemedText style={{ color: colors.primary, fontSize: 16 }}>✓</ThemedText>
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
  title: {
    fontSize: 18,
    fontWeight: '700',
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
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
  optionText: {
    fontSize: 15,
  },
});

export default ProfileBottomSheetSelect;
