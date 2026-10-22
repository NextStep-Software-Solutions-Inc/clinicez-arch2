import React, { useState, useEffect } from 'react';
import { View, Pressable, StyleSheet, ColorValue, DeviceEventEmitter } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { AppIcon, type IconName } from '@ui/Icon';
import ThemedText from '@ui/ThemedText';
import Badge from '../ui/Badge';
import { CircularProgress } from '../ui/CircularProgress';
import { FileBrowserFile, formatBytes } from '../../services/files';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ColorToken } from '../../constants/theme';
import { ProvenanceBadge } from '../records/ProvenanceBadge';
import { ClinicalUrgencyBadge } from '../records/ClinicalUrgencyBadge';

type BrowserItem = FileBrowserFile;

const TYPE_META: Record<string, { colorToken: ColorToken; icon: IconName }> = {
  'file-type-xray': { colorToken: 'info', icon: 'activity' },
  'file-type-lab-result': { colorToken: 'success', icon: 'lab' },
  'file-type-medical-certificate': { colorToken: 'warning', icon: 'document' },
  'file-type-prescription': { colorToken: 'emergency', icon: 'pill' },
  'file-type-id': { colorToken: 'purple', icon: 'badge' },
};
const DEFAULT_META: { colorToken: ColorToken; icon: IconName } = { colorToken: 'textSecondary', icon: 'document' };

function fileMeta(item: FileBrowserFile) {
  if (item.previewKind === 'image') return { colorToken: 'purple' as ColorToken, icon: 'image' as IconName };
  if (item.previewKind === 'pdf') return { colorToken: 'emergency' as ColorToken, icon: 'pdf' as IconName };
  return TYPE_META[item.documentTypeId ?? ''] ?? DEFAULT_META;
}

export function Icon({
  android,
  ios,
  name,
  color,
  size = 20,
}: {
  android?: string;
  ios?: string;
  name?: IconName;
  color?: ColorToken | ColorValue;
  size?: number;
}) {
  return <AppIcon android={android} ios={ios} name={name} size={size} color={color} />;
}

function StatusDot({ status }: { status: string }) {
  const { colors, radii, spacing } = useAppTheme();
  const c: ColorToken =
    status === 'synced' ? 'success' :
      status === 'failed' ? 'emergency' :
        status === 'syncing' ? 'info' : 'warning';
  const bgToken: ColorToken =
    status === 'synced' ? 'successBg' :
      status === 'failed' ? 'emergencyBg' :
        status === 'syncing' ? 'infoBg' : 'warningBg';
  const l =
    status === 'synced' ? 'Backed up' :
      status === 'failed' ? 'Error' :
        status === 'syncing' ? 'Syncing' : 'On device';

  return (
    <View style={[styles.dot, { backgroundColor: colors[bgToken], borderRadius: radii.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }]}>
      <View style={[styles.dotInner, { backgroundColor: colors[c], borderRadius: radii.full }]} />
      <ThemedText variant="captionBold" color={c}>{l}</ThemedText>
    </View>
  );
}

export function FileRow({
  item,
  onPress,
  onDelete,
  onShare,
  onRename,
  onErrorPress,
}: {
  item: BrowserItem;
  onPress: () => void;
  onMove?: () => void;
  onDelete: () => void;
  onShare: () => void;
  onRename?: () => void;
  onErrorPress?: () => void;
}) {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();

  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    if (item.syncStatus !== 'syncing') return;

    const sub = DeviceEventEmitter.addListener('file-sync-progress', (e) => {
      if (e.fileId === item.id) {
        setUploadProgress(e.progress);
      }
    });
    return () => sub.remove();
  }, [item.id, item.syncStatus]);

  const meta = fileMeta(item);
  const displayTitle = item.title?.trim() || item.name;

  const rawDate = item.documentDate || item.createdAt;
  const dateStr = rawDate
    ? new Date(rawDate).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric',
    })
    : '';

  const subtitleParts = [
    item.facilityName,
    formatBytes(item.sizeBytes),
    dateStr,
  ].filter(Boolean).join('  ·  ');

  const swipeableRef = React.useRef<any>(null);

  const renderRightActions = () => (
    <View style={[styles.swipeWrap, { borderRadius: radii.lg, marginLeft: spacing.xs }]}>
      <Pressable
        onPress={() => { swipeableRef.current?.close(); onShare(); }}
        accessibilityRole="button"
        accessibilityLabel="Share"
        style={[styles.swipeBtn, { backgroundColor: colors.infoBg, width: sizes.avatarLg }]}
      >
        <AppIcon name="share" color="infoText" size={sizes.iconMd} />
        <ThemedText variant="captionBold" color="infoText">Share</ThemedText>
      </Pressable>
      {onRename && (
        <Pressable
          onPress={() => { swipeableRef.current?.close(); onRename(); }}
          accessibilityRole="button"
          accessibilityLabel="Rename"
          style={[styles.swipeBtn, { backgroundColor: colors.surfaceSubtle, width: sizes.avatarLg }]}
        >
          <AppIcon name="edit" color="textSecondary" size={sizes.iconMd} />
          <ThemedText variant="captionBold" color="textSecondary">Rename</ThemedText>
        </Pressable>
      )}
      <Pressable
        onPress={() => { swipeableRef.current?.close(); onDelete(); }}
        accessibilityRole="button"
        accessibilityLabel="Delete"
        style={[styles.swipeBtn, { backgroundColor: colors.emergencyBg, width: sizes.avatarLg }]}
      >
        <AppIcon name="trash" color="emergencyText" size={sizes.iconMd} />
        <ThemedText variant="captionBold" color="emergencyText">Delete</ThemedText>
      </Pressable>
    </View>
  );

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} overshootRight={false}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={displayTitle}
        style={({ pressed }) => [
          styles.row,
          {
            backgroundColor: colors.card,
            padding: spacing.md,
            borderRadius: radii.lg,
            gap: spacing.md,
            borderColor: colors.border,
            borderWidth: sizes.borderWidth,
            opacity: pressed ? 0.85 : 1,
          },
          shadows.sm,
        ]}
      >
        <View
          style={[
            styles.rowIcon,
            {
              width: sizes.controlLg,
              height: sizes.controlLg,
              borderRadius: radii.md,
              backgroundColor: colors[
                meta.colorToken === 'info' ? 'infoBg' :
                  meta.colorToken === 'success' ? 'successBg' :
                    meta.colorToken === 'warning' ? 'warningBg' :
                      meta.colorToken === 'emergency' ? 'emergencyBg' :
                        meta.colorToken === 'purple' ? 'purpleBg' : 'surfaceSubtle'
              ],
            },
          ]}
        >
          <AppIcon name={meta.icon} color={meta.colorToken} size={sizes.iconLg} />
        </View>

        <View style={styles.rowBody}>
          {/* Title and Badges */}
          <View style={[styles.titleBadgeRow, { gap: spacing.xs, marginBottom: spacing.xxs }]}>
            <ThemedText variant="bodyBold" numberOfLines={1} style={styles.titleText}>
              {displayTitle}
            </ThemedText>
            {item.typeLabel ? (
              <Badge label={item.typeLabel} tone="neutral" size="sm" />
            ) : null}
            <ClinicalUrgencyBadge
              urgency={(item as any).urgency}
              isCritical={(item as any).isCritical}
            />
            <ProvenanceBadge
              provenance={(item as any).provenance}
              clinicId={item.clinicId}
              facilityName={item.facilityName}
              compact
            />
          </View>

          {/* Subtitle */}
          <ThemedText variant="small" color="textMuted" numberOfLines={1}>
            {subtitleParts}
          </ThemedText>

          {item.syncStatus === 'failed' && (item.syncError || item.lastSyncError) && (
            <ThemedText variant="caption" color="emergencyText" numberOfLines={2} style={{ marginTop: spacing.xxs }}>
              {item.syncError || item.lastSyncError}
            </ThemedText>
          )}
        </View>

        {item.syncStatus === 'failed' ? (
          <Pressable onPress={onErrorPress} style={{ padding: spacing.xs, margin: -spacing.xs }} hitSlop={10}>
            <StatusDot status={item.syncStatus} />
          </Pressable>
        ) : item.syncStatus === 'syncing' ? (
          <CircularProgress
            progress={uploadProgress}
            size={sizes.iconXl}
            color={colors.info}
            trackColor={colors.surfaceSubtle}
          />
        ) : (
          <StatusDot status={item.syncStatus} />
        )}
      </Pressable>
    </Swipeable>
  );
}

export default FileRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  titleText: {
    flexShrink: 1,
  },
  dot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dotInner: {
    width: 6,
    height: 6,
  },
  swipeWrap: {
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  swipeBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
});
