import React from 'react';
import { View, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import ThemedText from '@ui/ThemedText';
import { AppIcon } from '@ui/Icon';
import { useAppTheme } from '../../contexts/ThemeContext';
import { FileFolder } from '@db/schema';

export type BrowserContents = {
  breadcrumbs: FileFolder[];
  pendingSyncCount: number;
};

export function FilesHeader({
  contents,
  folderId,
  isSyncing,
  onOpenFolder,
  onOpenRoot,
  onSync,
}: {
  contents: BrowserContents | null;
  folderId?: string;
  isSyncing: boolean;
  onCreateFolder?: () => void;
  onOpenFolder: (id: string) => void;
  onOpenRoot: () => void;
  onOpenUpload?: () => void;
  onSync: () => void;
}) {
  const { colors, spacing, radii, sizes } = useAppTheme();
  const hasCrumbs = (contents?.breadcrumbs?.length ?? 0) > 0 || !!folderId;
  const pendingCount = contents?.pendingSyncCount ?? 0;

  return (
    <View style={[styles.header, { gap: spacing.md }]}>
      {pendingCount > 0 && (
        <Pressable
          onPress={onSync}
          disabled={isSyncing}
          accessibilityRole="button"
          accessibilityLabel={`${pendingCount} items waiting to back up. Tap to sync now.`}
          style={({ pressed }) => [
            styles.syncBanner,
            {
              borderRadius: radii.lg,
              padding: spacing.md,
              backgroundColor: colors.warningBg,
              borderColor: colors.warningBorder,
              borderWidth: sizes.borderWidth,
              opacity: pressed ? 0.8 : 1,
              gap: spacing.md,
            },
          ]}
        >
          <View
            style={[
              styles.syncIconWrap,
              {
                width: sizes.controlSm,
                height: sizes.controlSm,
                borderRadius: radii.md,
                backgroundColor: colors.surfaceSubtle,
              },
            ]}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color={colors.warningText} />
            ) : (
              <AppIcon name="upload" size={sizes.iconSm} color="warningText" />
            )}
          </View>
          <View style={styles.syncContent}>
            <ThemedText variant="smallBold" color="warningText">
              {pendingCount} item{pendingCount === 1 ? '' : 's'} waiting to back up
            </ThemedText>
            <ThemedText variant="caption" color="warningText" style={{ opacity: 0.85 }}>
              Tap to sync now
            </ThemedText>
          </View>
          <AppIcon name="forward" size={sizes.iconSm} color="warningText" />
        </Pressable>
      )}

      {hasCrumbs && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.crumbRow, { gap: spacing.sm, paddingVertical: spacing.xxs }]}
        >
          <Pressable
            onPress={onOpenRoot}
            accessibilityRole="button"
            accessibilityLabel="All files"
            style={[
              styles.crumb,
              {
                borderRadius: radii.full,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                gap: spacing.xs,
              },
              !folderId
                ? { backgroundColor: colors.primary }
                : {
                    backgroundColor: colors.card,
                    borderWidth: sizes.borderWidth,
                    borderColor: colors.border,
                  },
            ]}
          >
            <AppIcon
              name="home"
              size={sizes.iconSm}
              color={!folderId ? colors.onPrimary : colors.primary}
            />
            <ThemedText
              variant="smallBold"
              color={!folderId ? colors.onPrimary : colors.text}
            >
              All files
            </ThemedText>
          </Pressable>
          {(contents?.breadcrumbs ?? []).map((folder) => {
            const isActive = folder.id === folderId;
            return (
              <Pressable
                key={folder.id}
                onPress={() => onOpenFolder(folder.id)}
                accessibilityRole="button"
                accessibilityLabel={folder.name}
                style={[
                  styles.crumb,
                  {
                    borderRadius: radii.full,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    gap: spacing.xs,
                  },
                  isActive
                    ? { backgroundColor: colors.primary }
                    : {
                        backgroundColor: colors.card,
                        borderWidth: sizes.borderWidth,
                        borderColor: colors.border,
                      },
                ]}
              >
                <ThemedText
                  variant="smallBold"
                  color={isActive ? colors.onPrimary : colors.text}
                >
                  {folder.name}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {},
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncContent: {
    flex: 1,
  },
  crumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  crumb: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
