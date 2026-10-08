import React, { useState, useEffect, useCallback } from 'react';
import { View, Image, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import ThemedText from './ui/ThemedText';
import { AppIcon } from './ui/Icon';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@db/index';
import { patients } from '@db/schema/patients';
import { eq } from 'drizzle-orm';

const avatarFile = new File(Paths.document, 'profile_avatar.jpg');

export default function ProfileCard() {
  const { colors, radii, shadows } = useAppTheme();
  const { user } = useUser();
  const { internalPatientId } = useAuth();
  const [patientRecord, setPatientRecord] = useState<{ firstName?: string | null; lastName?: string | null } | null>(null);

  const reloadPatient = useCallback(async () => {
    if (!internalPatientId) return;
    try {
      const p = await db.query.patients.findFirst({
        where: eq(patients.id, internalPatientId),
      });
      if (p) setPatientRecord({ firstName: p.firstName, lastName: p.lastName });
    } catch {}
  }, [internalPatientId]);

  useEffect(() => {
    reloadPatient();
  }, [reloadPatient, user?.firstName, user?.lastName, user?.fullName]);

  // Locally cached URI — shown immediately on next launch before Clerk image loads
  const [localUri, setLocalUri] = useState<string | null>(null);
  // Temporary optimistic preview while uploading
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Hydrate local cache on mount
  useEffect(() => {
    (async () => {
      const info = avatarFile.info();
      if (info.exists) {
        setLocalUri(avatarFile.uri + '?t=' + info.modificationTime);
      }
    })();
  }, []);

  const avatarSource = previewUri ?? localUri ?? user?.imageUrl ?? null;

  const localDbName = [patientRecord?.firstName, patientRecord?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim() || null;

  const clerkName = user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();

  const displayName =
    clerkName ||
    localDbName ||
    user?.emailAddresses[0]?.emailAddress ||
    'Patient';

  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const email = user?.emailAddresses[0]?.emailAddress ?? '';

  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [avatarSource]);

  const handlePickImage = useCallback(async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      dialog.alert(
        'Permission Required',
        'Please allow access to your photo library to change your profile photo.',
        [{ text: 'OK' }],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const pickedUri = result.assets[0].uri;

    // Immediate optimistic preview
    setPreviewUri(pickedUri);
    setUploading(true);

    try {
      // 1. Persist locally for fast loading on next launch
      avatarFile.exists && avatarFile.delete();
      await new File(pickedUri).copy(avatarFile);
      const info = avatarFile.info();
      setLocalUri(avatarFile.uri + '?t=' + (info.exists ? info.modificationTime : Date.now()));

      // 2. Upload to Clerk
      await user?.setProfileImage({ file: avatarFile });
      dialog.alert('Success', 'Your profile photo has been updated.', [{ text: 'OK' }]);

      // Clear temp preview — Clerk's imageUrl will update via useUser re-render
      setPreviewUri(null);
    } catch (err) {
      console.warn('Avatar upload failed:', err);
      dialog.alert(
        'Upload Failed',
        'Your photo was saved locally but could not be uploaded. It will retry on your next update.',
        [{ text: 'OK' }],
      );
    } finally {
      setUploading(false);
    }
  }, [user]);

  return (
    <View
      style={[
        styles.card,
        shadows.sm,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.lg,
        },
      ]}
    >
      {/* Avatar with camera overlay */}
      <Pressable
        onPress={handlePickImage}
        accessibilityLabel="Change profile photo"
        accessibilityRole="button"
        style={styles.avatarWrapper}
      >
        <View style={[styles.avatarContainer, { borderRadius: radii.full }]}>
          {avatarSource ? (
            <Image
              source={require('../assets/fallback_profile.jpg')}
              style={[styles.avatar, { backgroundColor: colors.border, borderRadius: radii.full }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary, borderRadius: radii.full }]}>
              <ThemedText variant="h2" style={{ color: colors.onPrimary }}>
                {initials}
              </ThemedText>
            </View>
          )}
          {avatarSource && !imageError && (
            <Image
              source={{ uri: avatarSource }}
              style={[styles.avatar, { position: 'absolute', top: 0, left: 0, borderRadius: radii.full }]}
              onLoadStart={() => setImageLoading(true)}
              onLoadEnd={() => setImageLoading(false)}
              onError={() => setImageError(true)}
            />
          )}
          {imageLoading && (
            <View style={[StyleSheet.absoluteFill, styles.avatarLoader, { backgroundColor: colors.overlay }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </View>

        {/* Camera overlay badge */}
        <View
          style={[
            styles.cameraBadge,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.full,
            },
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primary} style={styles.badgeSpinner} />
          ) : (
            <AppIcon name="camera" size={12} color="text" />
          )}
        </View>
      </Pressable>

      {/* Info */}
      <View style={styles.info}>
        <ThemedText variant="title" numberOfLines={1}>
          {displayName}
        </ThemedText>
        {email ? (
          <ThemedText
            variant="body"
            color="textSecondary"
            numberOfLines={1}
            style={styles.email}
          >
            {email}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 28,
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
  },
  avatarContainer: {
    width: 58,
    height: 58,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarLoader: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 58,
    height: 58,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeSpinner: {
    transform: [{ scale: 0.6 }],
  },
  info: {
    flex: 1,
  },
  email: {
    marginTop: 2,
  },
});
