import React, { useEffect, useState } from 'react';
import { ColorValue, DeviceEventEmitter, Pressable, StyleSheet, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { AppIcon, type IconName } from '@ui/Icon';
import ThemedText from '@ui/ThemedText';
import { CircularProgress } from '../ui/CircularProgress';
import { FileBrowserFile } from '../../services/files';
import {
  formatRecordFileName,
  formatRecordSubtitle,
  getProvenanceIndicatorMeta,
} from '../../services/files/recordPresentation';
import { useAppTheme } from '../../contexts/ThemeContext';
import type { ColorToken } from '../../constants/theme';
import { ClinicalUrgencyBadge } from '../records/ClinicalUrgencyBadge';
import { SyncStatusDot } from './SyncStatusDot';

type BrowserItem = FileBrowserFile;

const TYPE_META: Record<string, { colorToken: ColorToken; icon: IconName }> = {
  'file-type-xray': { colorToken: 'info', icon: 'activity' },
  'file-type-lab-result': { colorToken: 'success', icon: 'lab' },
  'file-type-medical-certificate': { colorToken: 'warning', icon: 'document' },
  'file-type-prescription': { colorToken: 'emergency', icon: 'pill' },
  'file-type-id': { colorToken: 'purple', icon: 'badge' },
};
const DEFAULT_META: { colorToken: ColorToken; icon: IconName } = {
  colorToken: 'textSecondary',
  icon: 'document',
};

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
  const displayFileName = formatRecordFileName(item);
  const recordSubtitle = formatRecordSubtitle(item);
  const provenanceMeta = getProvenanceIndicatorMeta({
    provenance: (item as any).provenance,
    clinicId: item.clinicId,
    facilityName: item.facilityName,
  });

  const swipeableRef = React.useRef<any>(null);

  const renderRightActions = () => (
    <View style={[styles.swipeWrap, { borderRadius: radii.lg, marginLeft: spacing.xs }]}>
      <Pressable
        onPress={() => {
          swipeableRef.current?.close();
          onShare();
        }}
        accessibilityRole="button"
        accessibilityLabel="Share"
        style={[styles.swipeBtn, { backgroundColor: colors.infoBg, width: sizes.avatarLg }]}
      >
        <AppIcon name="share" color="infoText" size={sizes.iconMd} />
        <ThemedText variant="captionBold" color="infoText">Share</ThemedText>
      </Pressable>
      {onRename ? (
        <Pressable
          onPress={() => {
            swipeableRef.current?.close();
            onRename();
          }}
          accessibilityRole="button"
          accessibilityLabel="Rename"
          style={[styles.swipeBtn, { backgroundColor: colors.surfaceSubtle, width: sizes.avatarLg }]}
        >
          <AppIcon name="edit" color="textSecondary" size={sizes.iconMd} />
          <ThemedText variant="captionBold" color="textSecondary">Rename</ThemedText>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => {
          swipeableRef.current?.close();
          onDelete();
        }}
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
        accessibilityLabel={displayFileName}
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
          {/* Filename.ext + Urgent/STAT clinical indicator */}
          <View style={[styles.titleRow, { gap: spacing.xs, marginBottom: spacing.xxs }]}>
            <ThemedText variant="bodyBold" numberOfLines={1} style={styles.titleText}>
              {displayFileName}
            </ThemedText>
            <ClinicalUrgencyBadge
              urgency={(item as any).urgency}
              isCritical={(item as any).isCritical}
            />
          </View>

          {/* Timestamp + file size subtitle + icon-only provenance indicator */}
          <View style={[styles.subtitleRow, { gap: spacing.xs }]}>
            {recordSubtitle ? (
              <ThemedText variant="small" color="textMuted" numberOfLines={1} style={styles.subtitleText}>
                {recordSubtitle}
              </ThemedText>
            ) : null}
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel={provenanceMeta.accessibilityLabel}
              style={styles.provenanceIconWrap}
            >
              <AppIcon
                name={provenanceMeta.icon}
                color={provenanceMeta.colorToken}
                size={sizes.iconSm}
              />
            </View>
          </View>

          {item.syncStatus === 'failed' && (item.syncError || item.lastSyncError) ? (
            <ThemedText variant="caption" color="emergencyText" numberOfLines={2} style={{ marginTop: spacing.xxs }}>
              {item.syncError || item.lastSyncError}
            </ThemedText>
          ) : null}
        </View>

        {item.syncStatus === 'failed' ? (
          <Pressable
            onPress={onErrorPress}
            style={{ padding: spacing.xs, margin: -spacing.xs }}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Sync error details"
          >
            <SyncStatusDot status={item.syncStatus} />
          </Pressable>
        ) : item.syncStatus === 'syncing' ? (
          <CircularProgress
            progress={uploadProgress}
            size={sizes.iconLg}
            color={colors.info}
            trackColor={colors.surfaceSubtle}
          />
        ) : (
          <SyncStatusDot status={item.syncStatus} />
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
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleText: {
    flexShrink: 1,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtitleText: {
    flexShrink: 1,
  },
  provenanceIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
