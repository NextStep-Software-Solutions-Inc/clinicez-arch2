import React, { forwardRef, useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
  type BottomSheetModal,
} from '@gorhom/bottom-sheet';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import type { SelectOption } from './ProfileSelectModal';
import ThemedBottomSheetModal from '@ui/ThemedBottomSheetModal';
import { useAppTheme } from '../../contexts/ThemeContext';

interface ProfileBottomSheetSelectProps {
  title: string;
  options: SelectOption[];
  selected: string | undefined | null;
  onSelect: (value: string) => void;
}

export type ProfileBottomSheetSelectRef = BottomSheetModal;

const ProfileBottomSheetSelect = forwardRef<BottomSheetModal, ProfileBottomSheetSelectProps>(
  ({ title, options, selected, onSelect }, ref) => {
    const { colors, radii, sizes, spacing } = useAppTheme();
    const [query, setQuery] = useState('');
    const snapPoints = ['50%', '85%'];

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
      ),
      [],
    );

    const filtered = query.trim()
      ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
      : options;

    const handleSelect = (value: string) => {
      onSelect(value);
      if (ref && 'current' in ref) ref.current?.dismiss();
    };

    return (
      <ThemedBottomSheetModal
        ref={ref}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
      >
        <BottomSheetView style={styles.header}>
          <ThemedText variant="h2">{title}</ThemedText>
        </BottomSheetView>
        <BottomSheetView style={[styles.searchContainer, { borderColor: colors.borderLight }]}>
          <BottomSheetTextInput
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
        </BottomSheetView>
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => {
            const isSelected = item.value === selected;
            return (
              <Pressable
                onPress={() => handleSelect(item.value)}
                style={({ pressed }) => [
                  styles.option,
                  { borderBottomColor: colors.borderLight },
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
        />
      </ThemedBottomSheetModal>
    );
  },
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
